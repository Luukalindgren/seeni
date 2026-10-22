"""Evaluate a trained run: safety metrics, calibration and the unknown threshold (phase 7, #7).

Run from training/ on the desktop, after `seeni.train`:

    uv run python -m seeni.evaluate val --run b0-224-muu2      # fit T and the threshold on val
    uv run python -m seeni.evaluate errors --run b0-224-muu2   # contact sheets of val confusions
    uv run python -m seeni.evaluate test --run b0-224-muu2     # once, at the end: the test set

Everything runs in fp32. Output goes under <data dir>/runs/<name>/eval/:

    calibration.json        temperature T and the unknown threshold, for web calibration.json (#8)
    threshold-val.csv       what each threshold would give on val
    report-<set>.json/.md   metrics; the .md is the report for issue #7
    per_taxon-<set>.csv     per listed taxon: top-1, top-3, dangerous confusions
    per_class-<set>.csv     per class: precision, recall, F1
    errors/                 contact sheets from `errors`

The app's decision (PLAN.md phase 9), which the metrics follow: probabilities are
softmax(logits / T). If `muu` is the top class, or the top species class is below the
threshold, the answer is "en tunnista varmasti". Otherwise the candidates are the top
species classes up to 95 % cumulative probability (at most 5), and the dangerous lookalikes
of every candidate are always shown with them.

Dangerous confusion (PLAN.md phase 7) is counted per taxon on wrong top-1 classes: (a) a
myrkyllinen or tappava taxon whose top-1 class contains a food mushroom, (b) an
esikäsiteltävä taxon whose top-1 class contains a syötävä taxon. It is reported three ways:
raw (top-1 only), after the threshold (the app answered) and after the threshold and
warnings (the app answered and the true class was neither a candidate nor a shown
lookalike, so nothing on screen pointed at it). The last one must be close to zero.

Sets: `val` and `test` are the in-model classes and `muu` from split.csv. `outside` is every
image of the listed classes that are not in the model (in_model = false); training never
sees them, so they stand for a dangerous species the model does not know.
"""

import argparse
import csv
import itertools
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from seeni.baseline import dangerous, device
from seeni.lajilista import (
    DANGEROUS,
    FOOD,
    LAJILISTA,
    UNKNOWN_CLASS,
    Row,
    class_lookalikes,
    classes,
    read,
)
from seeni.muu import read_manifests
from seeni.paths import data_dir
from seeni.preprocess import eval_transform
from seeni.split import read_split
from seeni.train import Images, confusion_matrix, labels, per_class_f1, predict

CANDIDATE_MASS = 0.95
MAX_CANDIDATES = 5
# Threshold rule, on val: the lowest threshold at which (1) at most MAX_RESIDUAL of the
# dangerous-group images end up as a dangerous confusion after the threshold and warnings,
# and (2) at most MAX_UNKNOWN_FOOD of the unlisted fungi (muu) are answered with a class
# that has a food mushroom in it. An unlisted fungus may be poisonous, so (2) is the
# unknown-species version of (1). Zero for (1) would need a threshold of 0.99, at which the
# app answers a quarter of the photos: the lookalike checks of phase 9 are the next guard.
# (2) counts only unseen muu fungi, species with no muu image in train: the common unlisted
# species have many images in every set, and the model has learnt those, so counting them
# would make the threshold look safer for a truly unknown fungus than it is.
MAX_RESIDUAL = 0.005
MAX_UNKNOWN_FOOD = 0.075
THRESHOLDS = [round(t / 100, 2) for t in range(100)]


# --- Decision ----------------------------------------------------------------------------


def fit_temperature(logits: torch.Tensor, y: torch.Tensor) -> float:
    """The T > 0 that minimizes the log loss of softmax(logits / T) (temperature scaling)."""
    log_t = torch.zeros(1, requires_grad=True)
    optimizer = torch.optim.LBFGS([log_t], lr=0.1, max_iter=200, line_search_fn="strong_wolfe")
    logits = logits.double()

    def closure():
        optimizer.zero_grad()
        loss = torch.nn.functional.cross_entropy(logits / log_t.exp().double(), y)
        loss.backward()
        return loss

    optimizer.step(closure)
    return float(log_t.detach().exp())


def expected_calibration_error(probs: torch.Tensor, y: torch.Tensor, bins: int = 15) -> float:
    """Top-1 confidence against accuracy in equal-width bins, weighted by bin size."""
    conf, pred = probs.max(1)
    hit = (pred == y).double()
    edges = torch.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in itertools.pairwise(edges):
        mask = (conf > lo) & (conf <= hi)
        if mask.any():
            total += mask.double().mean() * (conf[mask].double().mean() - hit[mask].mean()).abs()
    return float(total)


def candidates(
    p: torch.Tensor, unknown: int, mass: float = CANDIDATE_MASS, k: int = MAX_CANDIDATES
):
    """Top species classes (never `muu`) until their probabilities sum to `mass`, at most k."""
    out, total = [], 0.0
    for i in p.argsort(descending=True).tolist():
        if i == unknown:
            continue
        out.append(i)
        total += float(p[i])
        if total >= mass or len(out) == k:
            break
    return out


def decide(p: torch.Tensor, unknown: int, threshold: float) -> list[int] | None:
    """The candidates the app shows, or None for "en tunnista varmasti"."""
    top = int(p.argmax())
    if top == unknown:
        return None
    if float(p[top]) < threshold:
        return None
    return candidates(p, unknown)


@dataclass
class ClassInfo:
    groups: dict[str, set[str]]  # class id -> its taxa's groups
    warn: dict[str, set[str]]  # class id -> dangerous lookalikes shown with it

    @classmethod
    def from_rows(cls, rows: list[Row]) -> "ClassInfo":
        by_class = classes(rows)
        groups = {c: {x.ryhma for x in r} for c, r in by_class.items()}
        # A lookalike is dangerous by its content: any of its taxa, as dangerous confusion
        # is counted, not only its merged group.
        return cls(
            groups=groups,
            warn={
                c: {x for x in class_lookalikes(r) if groups.get(x, set()) & DANGEROUS}
                for c, r in by_class.items()
            },
        )

    def shown(self, ids: list[str]) -> set[str]:
        return set(ids).union(*(self.warn.get(c, set()) for c in ids))


# --- Per-image outcomes ------------------------------------------------------------------


@dataclass
class Outcome:
    true: str  # class id
    group: str  # the image's own taxon group, "" for muu
    top1: str
    top3: bool
    answered: bool
    danger: str  # "", "a" or "b": the top-1 class is a dangerous confusion
    residual: bool  # danger, answered, and the true class not on screen
    food_shown: bool = False  # answered with a food mushroom among the candidates


def outcomes(
    probs: torch.Tensor,
    items: list[dict],
    class_ids: list[str],
    info: ClassInfo,
    taxon_group: dict[int, str],
    threshold: float,
) -> list[Outcome]:
    unknown = class_ids.index(UNKNOWN_CLASS)
    top3 = probs.topk(3, dim=1).indices
    out = []
    for p, m, t3 in zip(probs, items, top3.tolist()):
        true, top1 = m["class_id"], class_ids[int(p.argmax())]
        group = "" if true == UNKNOWN_CLASS else taxon_group[m["taxonKey"]]
        shown = decide(p, unknown, threshold)
        danger = ""
        if group and top1 != true and dangerous(group, info.groups.get(top1, set())):
            danger = "b" if group == "esikäsiteltävä" else "a"
        residual = (
            bool(danger)
            and shown is not None
            and (true not in info.shown([class_ids[i] for i in shown]))
        )
        out.append(
            Outcome(
                true=true,
                group=group,
                top1=top1,
                top3=true in {class_ids[i] for i in t3},
                answered=shown is not None,
                danger=danger,
                residual=residual,
                food_shown=shown is not None
                and any(info.groups.get(class_ids[i], set()) & FOOD for i in shown),
            )
        )
    return out


def at_risk(o: Outcome) -> str:
    """ "a" or "b" when the image's taxon can be dangerously confused at all."""
    if o.group in {"tappava", "myrkyllinen"}:
        return "a"
    return "b" if o.group == "esikäsiteltävä" else ""


def safety(results: list[Outcome]) -> dict:
    out = {}
    for kind in ("a", "b"):
        rel = [o for o in results if at_risk(o) == kind]
        n = len(rel)
        raw = sum(o.danger == kind for o in rel)
        answered = sum(o.danger == kind and o.answered for o in rel)
        residual = sum(o.residual and o.danger == kind for o in rel)
        out[kind] = {
            "images": n,
            "raw": raw,
            "after_threshold": answered,
            "after_threshold_and_warnings": residual,
            "raw_rate": raw / n if n else None,
            "after_threshold_rate": answered / n if n else None,
            "residual_rate": residual / n if n else None,
        }
    poisonous = [o for o in results if o.group in {"tappava", "myrkyllinen"}]
    out["poisonous_top3"] = sum(o.top3 for o in poisonous) / len(poisonous) if poisonous else None
    return out


def unknown_metrics(results: list[Outcome], items: list[dict], info: ClassInfo) -> dict:
    """How `muu` images and species images fare against the "en tunnista" answer."""
    out = {}
    for kind in ("fungi", "fungi_unseen", "other"):
        rel = [
            o
            for o, m in zip(results, items)
            if o.true == UNKNOWN_CLASS
            and m.get("kind") == kind.removesuffix("_unseen")
            and (kind != "fungi_unseen" or m.get("unseen"))
        ]
        if rel:
            food = sum(o.food_shown for o in rel)
            out[f"muu_{kind}"] = {
                "images": len(rel),
                "not_sure": sum(not o.answered for o in rel) / len(rel),
                "answered_as_food_class": food / len(rel),
            }
    species = [o for o in results if o.true != UNKNOWN_CLASS]
    if species:
        answered = [o for o in species if o.answered]
        out["species_answered"] = len(answered) / len(species)
        out["species_top1_when_answered"] = (
            sum(o.top1 == o.true for o in answered) / len(answered) if answered else None
        )
    return out


def standard(probs: torch.Tensor, y: torch.Tensor, n: int, unknown: int) -> dict:
    pred = probs.argmax(1)
    top3 = (probs.topk(3, dim=1).indices == y[:, None]).any(1)
    confusion = confusion_matrix(y, pred, n)
    present = confusion.sum(1) > 0
    species = y != unknown
    return {
        "images": len(y),
        "top1": (pred == y).float().mean().item(),
        "top3": top3.float().mean().item(),
        "macro_f1": per_class_f1(confusion)[2][present].mean().item(),
        "species_top1": (pred == y)[species].float().mean().item(),
        "species_top3": top3[species].float().mean().item(),
    }


def threshold_curve(probs, items, class_ids, info, taxon_group) -> list[dict]:
    rows = []
    for t in THRESHOLDS:
        res = outcomes(probs, items, class_ids, info, taxon_group, t)
        s, u = safety(res), unknown_metrics(res, items, info)
        rows.append(
            {
                "threshold": t,
                "residual_a": s["a"]["after_threshold_and_warnings"],
                "residual_b": s["b"]["after_threshold_and_warnings"],
                "answered_a": s["a"]["after_threshold"],
                "answered_b": s["b"]["after_threshold"],
                "species_answered": u.get("species_answered"),
                "species_top1_when_answered": u.get("species_top1_when_answered"),
                "muu_fungi_not_sure": u.get("muu_fungi", {}).get("not_sure"),
                "muu_fungi_food": u["muu_fungi"]["answered_as_food_class"],
                "muu_fungi_unseen_food": u.get("muu_fungi_unseen", {}).get(
                    "answered_as_food_class"
                ),
                "muu_other_not_sure": u.get("muu_other", {}).get("not_sure"),
                "at_risk": s["a"]["images"] + s["b"]["images"],
            }
        )
    return rows


def pick_threshold(
    curve: list[dict],
    max_residual: float = MAX_RESIDUAL,
    max_unknown_food: float = MAX_UNKNOWN_FOOD,
) -> float:
    for r in curve:
        unknown_food = r.get("muu_fungi_unseen_food")
        if unknown_food is None:
            unknown_food = r.get("muu_fungi_food", 0.0)
        if (r["residual_a"] + r["residual_b"]) <= max_residual * r[
            "at_risk"
        ] and unknown_food <= max_unknown_food:
            return r["threshold"]
    return curve[-1]["threshold"]


# --- Data and model ----------------------------------------------------------------------


def run_dir(name: str) -> Path:
    path = data_dir() / "runs" / name
    if not (path / "best.pt").exists():
        raise SystemExit(f"{path / 'best.pt'} is missing; train with seeni.train first")
    return path


def checked_labels(run: Path, rows: list[Row]) -> list[str]:
    saved = json.loads((run / "labels.json").read_text())
    if saved != labels(rows):
        raise SystemExit(
            "labels.json no longer matches lajilista.csv; evaluate with the list it was trained on"
        )
    return [c["id"] for c in saved]


def items_for(set_name: str, rows: list[Row]) -> list[dict]:
    split = read_split()
    in_model = {r.class_id for r in rows if r.in_model} | {UNKNOWN_CLASS}
    manifests = read_manifests()
    trained = {
        m["taxonKey"]
        for m in manifests
        if m["class_id"] == UNKNOWN_CLASS and split.get(int(m["gbifID"]), ("", ""))[1] == "train"
    }
    out = []
    for m in manifests:
        if m["class_id"] == UNKNOWN_CLASS:
            # A muu species with no image in train is what an unknown fungus looks like.
            m = {**m, "unseen": m["taxonKey"] not in trained}
        entry = split.get(int(m["gbifID"]))
        if entry is None or entry[0] != m["class_id"]:
            raise SystemExit(f"gbifID {m['gbifID']} is missing from split.csv; run seeni.split")
        if set_name == "outside":
            if m["class_id"] not in in_model:
                out.append(m)
        elif entry[1] == set_name and m["class_id"] in in_model:
            out.append(m)
    return out


def load_model(run: Path, n: int):
    """The run's best.pt in eval mode, on the CPU."""
    import timm

    checkpoint = torch.load(run / "best.pt", map_location="cpu")
    model = timm.create_model(checkpoint["model"], pretrained=False, num_classes=n)
    model.load_state_dict(checkpoint["state_dict"])
    return model.eval()


def logits_for(run: Path, set_name: str, items: list[dict], n: int, workers: int) -> torch.Tensor:
    """Logits in fp32, cached in eval/logits-<set>.pt for the same images and best.pt."""
    cache = run / "eval" / f"logits-{set_name}.pt"
    images = [m["image"] for m in items]
    stat = (run / "best.pt").stat()
    weights = [stat.st_size, stat.st_mtime_ns]
    if cache.exists():
        saved = torch.load(cache)
        if saved["images"] == images and saved.get("weights") == weights:
            return saved["logits"]
    dev = device()
    model = load_model(run, n).to(dev, memory_format=torch.channels_last)
    root = data_dir()
    loader = DataLoader(
        Images([root / m["path"] for m in items], [0] * len(items), eval_transform()),
        batch_size=128,
        num_workers=workers,
        pin_memory=dev.type == "cuda",
    )
    logits = predict(model, loader, dev)
    cache.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"images": images, "weights": weights, "logits": logits}, cache)
    return logits


# --- Reports -----------------------------------------------------------------------------


def per_taxon(results: list[Outcome], items: list[dict], rows: list[Row]) -> list[dict]:
    by_key = {r.taxon_key: r for r in rows}
    stats: dict[int, Counter] = defaultdict(Counter)
    confusions: dict[int, Counter] = defaultdict(Counter)
    for o, m in zip(results, items):
        if o.true == UNKNOWN_CLASS:
            continue
        s = stats[m["taxonKey"]]
        s["images"] += 1
        s["top1"] += o.top1 == o.true
        s["top3"] += o.top3
        s["answered"] += o.answered
        s["danger"] += bool(o.danger)
        s["danger_answered"] += bool(o.danger) and o.answered
        s["residual"] += o.residual
        if o.danger:
            confusions[m["taxonKey"]][o.top1] += 1
    out = []
    for key, s in sorted(stats.items(), key=lambda kv: by_key[kv[0]].line):
        r = by_key[key]
        out.append(
            {
                "class_id": r.class_id,
                "taxon": r.tieteellinen,
                "nimi": r.nimi,
                "ryhma": r.ryhma,
                "images": s["images"],
                "top1": s["top1"] / s["images"],
                "top3": s["top3"] / s["images"],
                "answered": s["answered"] / s["images"],
                "dangerous_raw": s["danger"],
                "dangerous_after_threshold": s["danger_answered"],
                "dangerous_after_warnings": s["residual"],
                "dangerous_top1": "; ".join(f"{c} {v}" for c, v in confusions[key].most_common()),
            }
        )
    return out


def per_class(probs: torch.Tensor, y: torch.Tensor, class_ids: list[str]) -> list[dict]:
    n = len(class_ids)
    confusion = confusion_matrix(y, probs.argmax(1), n)
    precision, recall, f1 = per_class_f1(confusion)
    out = []
    for i, c in enumerate(class_ids):
        if confusion[i].sum() == 0:
            continue
        wrong = Counter({class_ids[j]: int(confusion[i, j]) for j in range(n) if j != i})
        out.append(
            {
                "class_id": c,
                "images": int(confusion[i].sum()),
                "precision": round(float(precision[i]), 3),
                "recall": round(float(recall[i]), 3),
                "f1": round(float(f1[i]), 3),
                "confused_with": "; ".join(f"{k} {v}" for k, v in wrong.most_common(3) if v),
            }
        )
    return out


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        if not rows:
            return
        w = csv.DictWriter(f, list(rows[0]), lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: f"{v:.3f}" if isinstance(v, float) else v for k, v in r.items()})


def pct(x) -> str:
    return "–" if x is None else f"{100 * x:.1f} %"


def markdown(report: dict) -> str:
    lines = [f"# Phase 7 evaluation: {report['run']}, {report['set']}", ""]
    c = report["calibration"]
    lines += [
        (
            f"T = {c['temperature']:.3f}, unknown threshold {c['unknownThreshold']:.2f}, "
            f"candidates up to {100 * c['candidateMass']:.0f} % (max {c['maxCandidates']})."
        ),
        "",
        "## Standard metrics",
        "",
        "| set | images | top-1 | top-3 | macro-F1 | species top-1 | species top-3 | ECE before | ECE after |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    s = report["standard"]
    lines.append(
        f"| {report['set']} | {s['images']} | {pct(s['top1'])} | {pct(s['top3'])} | "
        f"{s['macro_f1']:.3f} | {pct(s['species_top1'])} | {pct(s['species_top3'])} | "
        f"{pct(report['ece_raw'])} | {pct(report['ece_calibrated'])} |"
    )
    lines += ["", "## Unknown (`muu`) and the threshold", ""]
    u = report["unknown"]
    lines.append(
        f'- Species images answered (not "en tunnista"): {pct(u.get("species_answered"))}, '
        f"top-1 correct when answered: {pct(u.get('species_top1_when_answered'))}"
    )
    for kind in ("fungi", "fungi_unseen", "other"):
        if f"muu_{kind}" in u:
            m = u[f"muu_{kind}"]
            label = "fungi of species not in train" if kind == "fungi_unseen" else kind
            lines.append(
                f'- muu {label} ({m["images"]} images): "en tunnista" {pct(m["not_sure"])}, '
                f"answered with a food mushroom among the candidates {pct(m['answered_as_food_class'])}"
            )
    for name in ("in_model", "outside"):
        if name not in report["safety"]:
            continue
        sa = report["safety"][name]
        title = "in-model classes" if name == "in_model" else "dangerous species not in the model"
        lines += [
            "",
            f"## Dangerous confusion: {title}",
            "",
            f"Poisonous or deadly taxa with the true class in top-3: {pct(sa['poisonous_top3'])}.",
            "",
            "| case | images | raw | after threshold | after threshold and warnings |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
        for kind, label in (
            ("a", "(a) myrkyllinen/tappava → food class"),
            ("b", "(b) esikäsiteltävä → syötävä class"),
        ):
            k = sa[kind]
            lines.append(
                f"| {label} | {k['images']} | {k['raw']} ({pct(k['raw_rate'])}) | "
                f"{k['after_threshold']} ({pct(k['after_threshold_rate'])}) | "
                f"{k['after_threshold_and_warnings']} ({pct(k['residual_rate'])}) |"
            )
        lines += [
            "",
            "| taxon | group | images | top-1 | top-3 | raw | after threshold | after warnings | dangerous top-1 classes |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ]
        for t in report["per_taxon"][name]:
            if t["ryhma"] not in DANGEROUS:
                continue
            lines.append(
                f"| {t['taxon']} ({t['nimi']}) | {t['ryhma']} | {t['images']} | {pct(t['top1'])} | "
                f"{pct(t['top3'])} | {t['dangerous_raw']} | {t['dangerous_after_threshold']} | "
                f"{t['dangerous_after_warnings']} | {t['dangerous_top1']} |"
            )
    return "\n".join(lines) + "\n"


def evaluate_set(run, set_name, rows, class_ids, info, workers, temperature, threshold):
    taxon_group = {r.taxon_key: r.ryhma for r in rows}
    items = items_for(set_name, rows)
    logits = logits_for(run, set_name, items, len(class_ids), workers)
    probs = (logits / temperature).softmax(1)
    res = outcomes(probs, items, class_ids, info, taxon_group, threshold)
    return items, logits, probs, res


def cmd_evaluate(args, set_name: str) -> int:
    rows = read(args.lajilista)
    run = run_dir(args.run)
    class_ids = checked_labels(run, rows)
    info = ClassInfo.from_rows(rows)
    index = {c: i for i, c in enumerate(class_ids)}
    unknown = index[UNKNOWN_CLASS]
    taxon_group = {r.taxon_key: r.ryhma for r in rows}
    out = run / "eval"
    out.mkdir(parents=True, exist_ok=True)

    if set_name == "val":
        items = items_for("val", rows)
        if not any(m.get("kind") == "fungi" for m in items):
            raise SystemExit("val has no muu fungi; run the seeni.muu pipeline and seeni.split")
        logits = logits_for(run, "val", items, len(class_ids), args.workers)
        y = torch.tensor([index[m["class_id"]] for m in items])
        temperature = fit_temperature(logits, y)
        curve = threshold_curve(
            (logits / temperature).softmax(1), items, class_ids, info, taxon_group
        )
        write_csv(out / "threshold-val.csv", curve)
        threshold = (
            args.threshold
            if args.threshold is not None
            else pick_threshold(curve, args.max_residual, args.max_unknown_food)
        )
        calibration = {
            "temperature": round(temperature, 4),
            "unknownThreshold": threshold,
            "candidateMass": CANDIDATE_MASS,
            "maxCandidates": MAX_CANDIDATES,
        }
        (out / "calibration.json").write_text(json.dumps(calibration, indent=2) + "\n")
    else:
        path = out / "calibration.json"
        if not path.exists():
            raise SystemExit("run `val` first: test uses the T and threshold fixed on val")
        calibration = json.loads(path.read_text())
    temperature, threshold = calibration["temperature"], calibration["unknownThreshold"]

    report = {
        "run": args.run,
        "set": set_name,
        "calibration": calibration,
        "safety": {},
        "per_taxon": {},
    }
    items, logits, probs, res = evaluate_set(
        run, set_name, rows, class_ids, info, args.workers, temperature, threshold
    )
    y = torch.tensor([index[m["class_id"]] for m in items])
    report["standard"] = standard(probs, y, len(class_ids), unknown)
    report["ece_raw"] = expected_calibration_error(logits.softmax(1), y)
    report["ece_calibrated"] = expected_calibration_error(probs, y)
    report["log_loss_raw"] = torch.nn.functional.cross_entropy(logits, y).item()
    report["log_loss_calibrated"] = torch.nn.functional.cross_entropy(
        logits / temperature, y
    ).item()
    report["unknown"] = unknown_metrics(res, items, info)
    report["safety"]["in_model"] = safety(res)
    report["per_taxon"]["in_model"] = per_taxon(res, items, rows)
    write_csv(out / f"per_taxon-{set_name}.csv", report["per_taxon"]["in_model"])
    write_csv(out / f"per_class-{set_name}.csv", per_class(probs, y, class_ids))

    o_items, _, _, o_res = evaluate_set(
        run, "outside", rows, class_ids, info, args.workers, temperature, threshold
    )
    if o_items:
        report["safety"]["outside"] = safety(o_res)
        report["per_taxon"]["outside"] = per_taxon(o_res, o_items, rows)
        report["outside_top1"] = dict(Counter(o.top1 for o in o_res).most_common(8))
        report["outside_not_sure"] = sum(not o.answered for o in o_res) / len(o_res)
        write_csv(out / "per_taxon-outside.csv", report["per_taxon"]["outside"])

    (out / f"report-{set_name}.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    )
    (out / f"report-{set_name}.md").write_text(markdown(report))
    print(markdown(report))
    print(f"results in {out}")
    return 0


def cmd_errors(args) -> int:
    """Contact sheets of the most common wrong top-1 pairs on val, and of the most confident
    mistakes, for error analysis by eye."""
    from seeni.gbif_images import contact_sheet

    rows = read(args.lajilista)
    run = run_dir(args.run)
    class_ids = checked_labels(run, rows)
    if not (run / "eval" / "calibration.json").exists():
        raise SystemExit("run `val` first: the sheets use the T fixed on val")
    calibration = json.loads((run / "eval" / "calibration.json").read_text())
    items = items_for(args.set, rows)
    logits = logits_for(run, args.set, items, len(class_ids), args.workers)
    probs = (logits / calibration["temperature"]).softmax(1)
    conf, pred = probs.max(1)
    wrong = [
        (m, class_ids[int(p)], float(c))
        for m, p, c in zip(items, pred, conf)
        if class_ids[int(p)] != m["class_id"]
    ]
    out = run / "eval" / "errors"
    out.mkdir(parents=True, exist_ok=True)
    root = data_dir()
    pairs = Counter((m["class_id"], p) for m, p, _ in wrong)
    for (true, p), count in pairs.most_common(args.pairs):
        pick = sorted(
            [w for w in wrong if (w[0]["class_id"], w[1]) == (true, p)], key=lambda w: -w[2]
        )[:40]
        sheet = contact_sheet(
            [root / m["path"] for m, _, _ in pick], [f"{c:.2f} {m['image']}" for m, _, c in pick]
        )
        sheet.save(out / f"{count:03d}-{true}--{p}.jpg", quality=85)
    worst = sorted(wrong, key=lambda w: -w[2])[:60]
    sheet = contact_sheet(
        [root / m["path"] for m, _, _ in worst],
        [f"{c:.2f} {m['class_id'][:12]}>{p[:12]}" for m, p, c in worst],
    )
    sheet.save(out / "confident-mistakes.jpg", quality=85)
    with (out / "confident-mistakes.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["image", "true", "top1", "p"])
        for m, p, c in worst:
            w.writerow([m["image"], m["class_id"], p, f"{c:.3f}"])
    print(f"{len(wrong)} wrong top-1 on {args.set}; sheets in {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("val", "test", "errors"):
        p = sub.add_parser(name)
        p.add_argument("--run", required=True, help="run directory under <data dir>/runs")
        p.add_argument("--workers", type=int, default=12)
        if name == "val":
            p.add_argument("--max-residual", type=float, default=MAX_RESIDUAL)
            p.add_argument("--max-unknown-food", type=float, default=MAX_UNKNOWN_FOOD)
            p.add_argument("--threshold", type=float, help="use this instead of the rule")
        if name == "errors":
            p.add_argument("--set", default="val", choices=["val", "outside"])
            p.add_argument("--pairs", type=int, default=15)
    args = parser.parse_args(argv)
    if args.command == "errors":
        return cmd_errors(args)
    return cmd_evaluate(args, args.command)


if __name__ == "__main__":
    sys.exit(main())
