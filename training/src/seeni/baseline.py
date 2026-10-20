"""Frozen DINOv2 embeddings + linear probe: a quick check of the data (phase 5, #5).

Run from training/ on the desktop, after `seeni.split`:

    uv run python -m seeni.baseline embed      # every manifest image through frozen DINOv2
    uv run python -m seeni.baseline probe      # linear classifier, per-class results on val
    uv run python -m seeni.baseline outliers   # images far from their own class, for review

Output goes under <data dir>/baseline/ (hard rule 2, never in git):

    embeddings-<model>.pt    image ids and features (CLS token + mean patch token)
    probe.json               overall metrics and the chosen weight decay
    per_class.csv            per-class top-1 / top-3 on val
    confusion.csv            val confusion matrix, rows = true class, columns = top-1
    outliers.csv             outlier candidates; sheets under outliers/<class_id>.jpg

An outlier candidate is far from the rest of its class (z-score of its mean similarity to
its nearest same-class images below OUTLIER_Z) and most of its nearest images overall
belong to other classes. Either test alone flags too many: classes that look alike share
neighbours without anything being wrong.

The probe trains on the train set and is scored on val; test stays untouched for phase 7.
Everything runs in fp32: the model is frozen, so embedding is evaluation, and the probe is
one linear layer on a few thousand vectors.
"""

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset

from seeni.gbif_images import contact_sheet, read_table
from seeni.lajilista import DANGEROUS, FOOD, LAJILISTA, Row, read
from seeni.paths import data_dir
from seeni.preprocess import eval_transform, load
from seeni.split import read_split

MODEL = "vit_base_patch14_dinov2.lvd142m"
WEIGHT_DECAYS = [0.1, 1.0, 3.0, 10.0]
STEPS = 1000
LR = 1e-3
NEIGHBORS = 10
OUTLIER_Z = -2.5
MAX_OUTLIERS_PER_CLASS = 30


def out_dir() -> Path:
    path = data_dir() / "baseline"
    path.mkdir(parents=True, exist_ok=True)
    return path


def embeddings_path(model: str) -> Path:
    return out_dir() / f"embeddings-{model.split('.')[0]}.pt"


def device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


# --- Embed -------------------------------------------------------------------------------


class Images(Dataset):
    def __init__(self, paths: list[Path]):
        self.paths = paths
        self.transform = eval_transform()

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, i: int) -> torch.Tensor:
        return self.transform(load(self.paths[i]))


def pool(tokens: torch.Tensor, prefix: int) -> torch.Tensor:
    """CLS token and mean patch token side by side, the usual DINOv2 linear-probe input."""
    return torch.cat([tokens[:, 0], tokens[:, prefix:].mean(dim=1)], dim=1)


@torch.inference_mode()
def embed(paths: list[Path], model_name: str, batch_size: int, workers: int) -> torch.Tensor:
    import timm

    dev = device()
    model = timm.create_model(model_name, pretrained=True, num_classes=0, img_size=224)
    model = model.eval().to(dev)
    loader = DataLoader(Images(paths), batch_size=batch_size, num_workers=workers)
    out = []
    for i, batch in enumerate(loader):
        tokens = model.forward_features(batch.to(dev, non_blocking=True))
        out.append(pool(tokens, model.num_prefix_tokens).float().cpu())
        if i % 20 == 0:
            print(f"{min((i + 1) * batch_size, len(paths))}/{len(paths)}", flush=True)
    return torch.cat(out)


def cmd_embed(args) -> int:
    root = data_dir()
    manifest = read_table(root / "manifest.parquet")
    path = embeddings_path(args.model)
    done: dict[str, torch.Tensor] = {}
    if path.exists():
        saved = torch.load(path)
        done = dict(zip(saved["images"], saved["features"]))
    todo = [m for m in manifest if m["image"] not in done]
    print(f"{len(manifest)} images, {len(todo)} to embed with {args.model}")
    if todo:
        features = embed([root / m["path"] for m in todo], args.model, args.batch, args.workers)
        done.update(zip((m["image"] for m in todo), features))
    images = sorted(m["image"] for m in manifest)
    torch.save(
        {"model": args.model, "images": images, "features": torch.stack([done[i] for i in images])},
        path,
    )
    print(f"saved {len(images)} embeddings to {path}")
    return 0


# --- Probe -------------------------------------------------------------------------------


def class_groups(rows: list[Row]) -> dict[str, set[str]]:
    groups = defaultdict(set)
    for r in rows:
        groups[r.class_id].add(r.ryhma)
    return groups


def dangerous(true_group: str, predicted_groups: set[str]) -> bool:
    """A poisonous or deadly taxon called a class with a food mushroom in it, or an
    esikäsiteltävä taxon called a class with a syötävä one (CLAUDE.md, PLAN.md phase 7)."""
    if true_group in DANGEROUS - FOOD:
        return bool(predicted_groups & FOOD)
    if true_group == "esikäsiteltävä":
        return "syötävä" in predicted_groups
    return False


def load_data(model: str, lajilista: Path):
    root = data_dir()
    manifest = {m["image"]: m for m in read_table(root / "manifest.parquet")}
    saved = torch.load(embeddings_path(model))
    embedded = set(saved["images"])
    missing = [i for i in manifest if i not in embedded]
    if missing:
        raise SystemExit(f"{len(missing)} manifest images have no embedding; run `embed`")
    keep = [k for k, i in enumerate(saved["images"]) if i in manifest]
    items = [manifest[saved["images"][k]] for k in keep]
    return items, saved["features"][keep], read(lajilista), read_split()


def train_probe(x: torch.Tensor, y: torch.Tensor, n_classes: int, weight_decay: float):
    torch.manual_seed(0)
    layer = torch.nn.Linear(x.shape[1], n_classes).to(x.device)
    opt = torch.optim.AdamW(layer.parameters(), lr=LR, weight_decay=weight_decay)
    for _ in range(STEPS):
        opt.zero_grad(set_to_none=True)
        torch.nn.functional.cross_entropy(layer(x), y).backward()
        opt.step()
    return layer.eval()


def topk_hits(logits: torch.Tensor, y: torch.Tensor, k: int) -> torch.Tensor:
    return (logits.topk(k, dim=1).indices == y[:, None]).any(dim=1)


def macro(hits: torch.Tensor, y: torch.Tensor, n_classes: int) -> float:
    per = [hits[y == c].float().mean().item() for c in range(n_classes) if (y == c).any()]
    return sum(per) / len(per)


def cmd_probe(args) -> int:
    items, features, rows, split = load_data(args.model, args.lajilista)
    classes = list(dict.fromkeys(r.class_id for r in rows if r.in_model))
    index = {c: i for i, c in enumerate(classes)}
    groups = class_groups(rows)
    taxon_group = {r.taxon_key: r.ryhma for r in rows}
    dev = device()

    def subset(name: str):
        ks = [
            k
            for k, m in enumerate(items)
            if m["class_id"] in index and split[int(m["gbifID"])][1] == name
        ]
        y = torch.tensor([index[items[k]["class_id"]] for k in ks], device=dev)
        return ks, features[ks].to(dev), y

    train_k, x_train, y_train = subset("train")
    val_k, x_val, y_val = subset("val")
    mean, std = x_train.mean(0), x_train.std(0) + 1e-6
    x_train, x_val = (x_train - mean) / std, (x_val - mean) / std

    sweep = {}
    for wd in WEIGHT_DECAYS:
        layer = train_probe(x_train, y_train, len(classes), wd)
        with torch.no_grad():
            sweep[wd] = (macro(topk_hits(layer(x_val), y_val, 1), y_val, len(classes)), layer)
        print(f"weight decay {wd:g}: val macro top-1 {sweep[wd][0]:.3f}")
    best_wd = max(sweep, key=lambda wd: sweep[wd][0])
    layer = sweep[best_wd][1]
    with torch.no_grad():
        logits = layer(x_val)
        top1, top3 = topk_hits(logits, y_val, 1), topk_hits(logits, y_val, 3)
        pred = logits.argmax(1)

    out = out_dir()
    n = len(classes)
    confusion = torch.zeros(n, n, dtype=torch.long)
    for t, p in zip(y_val.tolist(), pred.tolist()):
        confusion[t, p] += 1
    with (out / "confusion.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["true \\ top-1", *classes])
        for i, c in enumerate(classes):
            w.writerow([c, *confusion[i].tolist()])

    per_class = []
    for i, c in enumerate(classes):
        mask = y_val == i
        wrong = Counter({classes[j]: int(confusion[i, j]) for j in range(n) if j != i})
        top_wrong = [f"{k} {v}" for k, v in wrong.most_common(2) if v]
        per_class.append(
            {
                "class_id": c,
                "train": int((y_train == i).sum()),
                "val": int(mask.sum()),
                "top1": top1[mask].float().mean().item() if mask.any() else float("nan"),
                "top3": top3[mask].float().mean().item() if mask.any() else float("nan"),
                "confused_with": "; ".join(top_wrong),
            }
        )
    with (out / "per_class.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(per_class[0]), lineterminator="\n")
        w.writeheader()
        w.writerows(per_class)

    danger = Counter()
    for k, p in zip(val_k, pred.tolist()):
        m = items[k]
        if classes[p] != m["class_id"] and dangerous(
            taxon_group[m["taxonKey"]], groups[classes[p]]
        ):
            danger[(m["class_id"], classes[p])] += 1

    # Classes on the list but not in the model: what would the probe call them?
    outside = defaultdict(Counter)
    ks = [k for k, m in enumerate(items) if m["class_id"] not in index]
    if ks:
        with torch.no_grad():
            p = layer(((features[ks].to(dev)) - mean) / std).argmax(1).tolist()
        for k, j in zip(ks, p):
            outside[items[k]["class_id"]][classes[j]] += 1

    metrics = {
        "model": args.model,
        "classes": n,
        "train_images": len(train_k),
        "val_images": len(val_k),
        "weight_decay": best_wd,
        "sweep": {str(wd): s for wd, (s, _) in sweep.items()},
        "val_top1": top1.float().mean().item(),
        "val_top3": top3.float().mean().item(),
        "val_macro_top1": macro(top1, y_val, n),
        "val_macro_top3": macro(top3, y_val, n),
        "dangerous_confusions": {f"{a} -> {b}": v for (a, b), v in danger.most_common()},
        "not_in_model": {c: dict(v.most_common()) for c, v in outside.items()},
    }
    (out / "probe.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({k: v for k, v in metrics.items() if k != "sweep"}, indent=2))
    print("\n| class_id | train | val | top-1 | top-3 | most often called |")
    print("| --- | ---: | ---: | ---: | ---: | --- |")
    for r in sorted(per_class, key=lambda r: r["top1"]):
        print(
            f"| {r['class_id']} | {r['train']} | {r['val']} | {r['top1']:.2f} | "
            f"{r['top3']:.2f} | {r['confused_with']} |"
        )
    print(f"\nresults in {out}")
    return 0


# --- Outliers ----------------------------------------------------------------------------


def outlier_scores(x: torch.Tensor, labels: list[str], groups: list[int], k: int = NEIGHBORS):
    """Per image: mean cosine similarity to its k nearest images of the same class, and how
    many of its k nearest images overall share its class. Images of the same observation
    (`groups`) never count as each other's neighbours."""
    x = torch.nn.functional.normalize(x, dim=1)
    label_ids = {c: i for i, c in enumerate(dict.fromkeys(labels))}
    lab = torch.tensor([label_ids[c] for c in labels], device=x.device)
    grp = torch.tensor(groups, device=x.device)
    own, same = [], []
    for start in range(0, len(x), 2048):
        sims = x[start : start + 2048] @ x.T
        rows = torch.arange(start, min(start + 2048, len(x)), device=x.device)
        sims[grp[rows][:, None] == grp[None, :]] = -2  # self and same observation
        nearest = sims.topk(k, dim=1).indices
        same.append((lab[nearest] == lab[rows][:, None]).sum(1))
        sims[lab[rows][:, None] != lab[None, :]] = -2
        own.append(sims.topk(k, dim=1).values.clamp(min=-1).mean(1))
    return torch.cat(own).cpu(), torch.cat(same).cpu()


def cmd_outliers(args) -> int:
    items, features, _, _ = load_data(args.model, args.lajilista)
    root, out = data_dir(), out_dir()
    x = features.to(device())
    x = (x - x.mean(0)) / (x.std(0) + 1e-6)
    labels = [m["class_id"] for m in items]
    own, same = outlier_scores(x, labels, [int(m["gbifID"]) for m in items])

    by_class = defaultdict(list)
    for k, c in enumerate(labels):
        by_class[c].append(k)
    flagged = []
    for c, ks in by_class.items():
        s = own[ks]
        z = (s - s.mean()) / (s.std() + 1e-6)
        hits = [
            (k, z[j].item())
            for j, k in enumerate(ks)
            if z[j] < OUTLIER_Z and same[k] <= NEIGHBORS // 5
        ]
        hits.sort(key=lambda t: t[1])
        flagged += [(c, k, zz) for k, zz in hits[:MAX_OUTLIERS_PER_CLASS]]

    sheets = out / "outliers"
    sheets.mkdir(exist_ok=True)
    for old in sheets.glob("*.jpg"):
        old.unlink()
    with (out / "outliers.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["image", "class_id", "z", "same_class_neighbors", "path"])
        for c, k, z in flagged:
            m = items[k]
            w.writerow([m["image"], c, f"{z:.2f}", int(same[k]), m["path"]])
    per_class = defaultdict(list)
    for c, k, _ in flagged:
        per_class[c].append(items[k])
    for c, ms in per_class.items():
        sheet = contact_sheet([root / m["path"] for m in ms], [m["image"] for m in ms])
        sheet.save(sheets / f"{c}.jpg", quality=85)
    print(f"{len(flagged)} outlier candidates in {len(per_class)} classes")
    print(f"list: {out / 'outliers.csv'}, sheets: {sheets}")
    print("Add the bad ones to exclude.csv as image,reason and re-run gbif_images download.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    parser.add_argument("--model", default=MODEL, help="a timm DINOv2 model")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("embed", help="embed every manifest image")
    p.add_argument("--batch", type=int, default=128)
    p.add_argument("--workers", type=int, default=8)
    p.set_defaults(func=cmd_embed)
    sub.add_parser("probe", help="linear probe, results on val").set_defaults(func=cmd_probe)
    p = sub.add_parser("outliers", help="images far from their own class")
    p.set_defaults(func=cmd_outliers)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
