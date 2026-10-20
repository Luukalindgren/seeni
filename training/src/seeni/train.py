"""Fine-tune an ImageNet model on the species classes (phase 6, #6).

Run from training/ on the desktop, in tmux, after `seeni.split`:

    uv run python -m seeni.train                          # EfficientNet-B0 at 224 px
    uv run python -m seeni.train --name b0-try2 --epochs 30
    uv run tensorboard --logdir ~/seeni-data/runs         # curves

Output goes under <data dir>/runs/<name>/ (hard rule 2, never in git):

    best.pt            weights with the best val macro-F1, model name and labels
    labels.json        class order: [{"id", "taxonKeys"}], position = output index
    preprocess.json    the eval transform (seeni.preprocess.spec)
    metrics.json       val metrics of best.pt, dangerous confusions, baseline numbers
    per_class.csv      per-class precision, recall, F1, top-3 on val
    confusion.csv      val confusion matrix, rows = true class, columns = top-1
    tb/                TensorBoard logs

Classes are the `in_model` classes of lajilista.csv in file order, then `muu` (hard rule 5).
Until phase 7 collects real unknown data, `muu` holds the manifest's images of classes that
are on the list but not in the model; they are lookalikes, and "I don't know" is the safe
answer for them.

Training: a few epochs of the head only at 1e-3 (backbone frozen, its BatchNorm in eval
mode), then the whole model at 3e-4: on B0 that beat 1e-4 by 1.8 points of val top-1. AdamW, linear warmup and cosine decay per stage, bf16
autocast, channels_last, label smoothing 0.1 and sampling weighted by 1/sqrt(class size).
Evaluation runs in fp32. Test stays untouched for phase 7.
"""

import argparse
import csv
import json
import math
import sys
import time
from collections import Counter
from pathlib import Path

import torch
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

from seeni.baseline import class_groups, dangerous, device
from seeni.gbif_images import read_table
from seeni.lajilista import LAJILISTA, UNKNOWN_CLASS, Row, read, validate
from seeni.paths import data_dir
from seeni.preprocess import MEAN, STD, eval_transform, load, spec, train_transform
from seeni.split import read_split

MODEL = "efficientnet_b0.ra_in1k"


def labels(rows: list[Row]) -> list[dict]:
    """labels.json: the in_model classes in lajilista order, then `muu` with no taxa."""
    taxa: dict[str, list[int]] = {}
    for r in rows:
        if r.in_model:
            taxa.setdefault(r.class_id, [])
            if r.taxon_key is not None:
                taxa[r.class_id].append(r.taxon_key)
    out = [{"id": c, "taxonKeys": sorted(set(keys))} for c, keys in taxa.items()]
    return out + [{"id": UNKNOWN_CLASS, "taxonKeys": []}]


def target(taxon_key: int, class_id: str, taxon_class: dict[int, str], index: dict[str, int]):
    """Output index for a manifest image. Its class comes from lajilista through the taxon,
    and must match the manifest's, so a renamed or merged class never trains as `muu`.
    A listed class that is not in the model trains as `muu`."""
    listed = taxon_class.get(taxon_key)
    if listed != class_id:
        raise SystemExit(
            f"taxonKey {taxon_key} is {listed} in lajilista but {class_id} in the manifest; "
            "re-run gbif_images download and seeni.split"
        )
    return index.get(class_id, index[UNKNOWN_CLASS])


def sample_weights(targets: list[int]) -> list[float]:
    """1 / sqrt(images in the class) per image, so a class is drawn ~ sqrt(its size)."""
    counts = Counter(targets)
    return [1 / math.sqrt(counts[t]) for t in targets]


def warmup_cosine(step: int, warmup: int, total: int) -> float:
    """Learning rate factor: linear warmup to 1, then cosine decay to 0 at `total`."""
    if step < warmup:
        return (step + 1) / warmup
    progress = (step - warmup) / max(1, total - warmup)
    return 0.5 * (1 + math.cos(math.pi * min(1.0, progress)))


def confusion_matrix(y: torch.Tensor, pred: torch.Tensor, n: int) -> torch.Tensor:
    return torch.bincount(y * n + pred, minlength=n * n).reshape(n, n)


def per_class_f1(confusion: torch.Tensor):
    """Precision, recall and F1 per class (0 where undefined)."""
    tp = confusion.diag().double()
    precision = tp / confusion.sum(0).clamp(min=1)
    recall = tp / confusion.sum(1).clamp(min=1)
    f1 = 2 * precision * recall / (precision + recall).clamp(min=1e-12)
    return precision, recall, f1


def macro_f1(confusion: torch.Tensor) -> float:
    """Mean F1 over the classes that have val images."""
    present = confusion.sum(1) > 0
    return per_class_f1(confusion)[2][present].mean().item()


class Images(Dataset):
    def __init__(self, paths: list[Path], targets: list[int], transform):
        self.paths, self.targets, self.transform = paths, targets, transform

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, i: int):
        return self.transform(load(self.paths[i])), self.targets[i]


def load_items(rows: list[Row], index: dict[str, int]):
    """(path, target, manifest row) for train and val. Test is never read."""
    root = data_dir()
    split = read_split()
    taxon_class = {r.taxon_key: r.class_id for r in rows if r.taxon_key is not None}
    out = {"train": [], "val": []}
    for m in read_table(root / "manifest.parquet"):
        entry = split.get(int(m["gbifID"]))
        if entry is None or entry[0] != m["class_id"]:
            raise SystemExit(f"gbifID {m['gbifID']} is missing from split.csv; run seeni.split")
        if entry[1] in out:
            t = target(m["taxonKey"], m["class_id"], taxon_class, index)
            out[entry[1]].append((root / m["path"], t, m))
    return out["train"], out["val"]


@torch.inference_mode()
def predict(model, loader, dev) -> torch.Tensor:
    """Logits in fp32 (no autocast): evaluation must not depend on bf16 rounding."""
    model.eval()
    out = []
    for x, _ in loader:
        x = x.to(dev, non_blocking=True).to(memory_format=torch.channels_last)
        out.append(model(x).float().cpu())
    return torch.cat(out)


def evaluate(logits: torch.Tensor, y: torch.Tensor, n: int, known: torch.Tensor) -> dict:
    """Overall metrics, plus top-1/top-3 on the species classes only (`known`), which is
    what the phase 5 baseline measured."""
    pred = logits.argmax(1)
    top3 = (logits.topk(3, dim=1).indices == y[:, None]).any(1)
    top1 = pred == y
    confusion = confusion_matrix(y, pred, n)
    return {
        "val_top1": top1.float().mean().item(),
        "val_top3": top3.float().mean().item(),
        "val_macro_f1": macro_f1(confusion),
        "val_species_top1": top1[known].float().mean().item(),
        "val_species_top3": top3[known].float().mean().item(),
        "val_species_macro_top1": torch.stack(
            [top1[y == c].float().mean() for c in y[known].unique()]
        )
        .mean()
        .item(),
    }


def head_parameters(model) -> list[torch.nn.Parameter]:
    return list(model.get_classifier().parameters())


def set_stage(model, head_only: bool) -> None:
    """Train mode. In the head-only stage the frozen backbone stays in eval mode (its
    BatchNorm statistics, no stochastic depth or dropout), so the head fits the features it
    will see at evaluation."""
    head = {id(p) for p in head_parameters(model)}
    for p in model.parameters():
        p.requires_grad_(not head_only or id(p) in head)
    model.train(not head_only)
    model.get_classifier().train()


def write_reports(out: Path, logits, y, items, classes, rows, metrics) -> None:
    n = len(classes)
    pred = logits.argmax(1)
    top3 = (logits.topk(3, dim=1).indices == y[:, None]).any(1)
    confusion = confusion_matrix(y, pred, n)
    precision, recall, f1 = per_class_f1(confusion)
    with (out / "confusion.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["true \\ top-1", *classes])
        for i, c in enumerate(classes):
            w.writerow([c, *confusion[i].tolist()])
    with (out / "per_class.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["class_id", "val", "precision", "recall", "f1", "top3", "confused_with"])
        for i, c in enumerate(classes):
            mask = y == i
            wrong = Counter({classes[j]: int(confusion[i, j]) for j in range(n) if j != i})
            w.writerow(
                [
                    c,
                    int(mask.sum()),
                    f"{precision[i]:.3f}",
                    f"{recall[i]:.3f}",
                    f"{f1[i]:.3f}",
                    f"{top3[mask].float().mean().item():.3f}" if mask.any() else "",
                    "; ".join(f"{k} {v}" for k, v in wrong.most_common(2) if v),
                ]
            )
    # Per taxon, as PLAN.md phase 7 counts it.
    groups = class_groups(rows)
    taxon_group = {r.taxon_key: r.ryhma for r in rows}
    taxon_name = {r.taxon_key: r.tieteellinen for r in rows}
    danger = Counter()
    for (_, _, m), p in zip(items, pred.tolist()):
        if classes[p] != m["class_id"] and dangerous(
            taxon_group[m["taxonKey"]], groups.get(classes[p], set())
        ):
            danger[f"{taxon_name[m['taxonKey']]} -> {classes[p]}"] += 1
    metrics["dangerous_confusions"] = dict(danger.most_common())
    metrics["dangerous_confusion_images"] = sum(danger.values())
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False) + "\n")


def cmd_train(args) -> int:
    import timm
    from torch.utils.tensorboard import SummaryWriter

    torch.manual_seed(args.seed)
    rows = read(args.lajilista)
    errors, _ = validate(rows, require_keys=True)
    if errors or any(r.class_id == UNKNOWN_CLASS for r in rows):
        raise SystemExit("lajilista.csv is not valid (or lists `muu`):\n" + "\n".join(errors))
    label_list = labels(rows)
    classes = [c["id"] for c in label_list]
    index = {c: i for i, c in enumerate(classes)}
    train_items, val_items = load_items(rows, index)
    n = len(classes)

    out = data_dir() / "runs" / args.name
    if out.exists() and any(out.iterdir()):
        raise SystemExit(f"{out} already exists; pick another --name")
    out.mkdir(parents=True, exist_ok=True)
    (out / "labels.json").write_text(json.dumps(label_list, indent=2) + "\n")
    (out / "preprocess.json").write_text(json.dumps(spec(), indent=2) + "\n")
    (out / "args.json").write_text(json.dumps(vars(args), indent=2, default=str) + "\n")

    dev = device()
    train_targets = [t for _, t, _ in train_items]
    print(f"{n} classes, {len(train_items)} train and {len(val_items)} val images")
    print(f"muu: {train_targets.count(index[UNKNOWN_CLASS])} train images")
    train_loader = DataLoader(
        Images([p for p, _, _ in train_items], train_targets, train_transform()),
        batch_size=args.batch,
        sampler=WeightedRandomSampler(sample_weights(train_targets), len(train_targets)),
        num_workers=args.workers,
        pin_memory=dev.type == "cuda",
        drop_last=True,
        persistent_workers=args.workers > 0,
    )
    val_loader = DataLoader(
        Images([p for p, _, _ in val_items], [t for _, t, _ in val_items], eval_transform()),
        batch_size=args.batch * 2,
        num_workers=args.workers,
        pin_memory=dev.type == "cuda",
        persistent_workers=args.workers > 0,
    )
    y_val = torch.tensor([t for _, t, _ in val_items])
    known = y_val != index[UNKNOWN_CLASS]

    model = timm.create_model(
        args.model, pretrained=True, num_classes=n, drop_rate=0.2, drop_path_rate=0.1
    )
    cfg = model.pretrained_cfg
    if not torch.allclose(torch.tensor(cfg["mean"]), torch.tensor(MEAN)) or not torch.allclose(
        torch.tensor(cfg["std"]), torch.tensor(STD)
    ):
        raise SystemExit(f"{args.model} expects mean/std {cfg['mean']}/{cfg['std']}")
    model = model.to(dev, memory_format=torch.channels_last)
    criterion = torch.nn.CrossEntropyLoss(label_smoothing=0.1)
    writer = SummaryWriter(out / "tb")
    steps_per_epoch = len(train_loader)
    stages = [
        ("head", args.head_epochs, args.head_lr, True),
        ("full", args.epochs - args.head_epochs, args.lr, False),
    ]
    best, best_metrics, epoch, step = -1.0, {}, 0, 0
    for stage, epochs, lr, head_only in stages:
        params = head_parameters(model) if head_only else list(model.parameters())
        optimizer = torch.optim.AdamW(params, lr=lr, weight_decay=args.weight_decay)
        total = epochs * steps_per_epoch
        warmup = min(total // 2, max(1, int(args.warmup * steps_per_epoch)))
        scheduler = torch.optim.lr_scheduler.LambdaLR(
            optimizer, lambda s, w=warmup, t=total: warmup_cosine(s, w, t)
        )
        for _ in range(epochs):
            epoch += 1
            set_stage(model, head_only)
            start, loss_sum = time.time(), torch.zeros((), device=dev)
            for x, y in train_loader:
                x = x.to(dev, non_blocking=True).to(memory_format=torch.channels_last)
                y = y.to(dev, non_blocking=True)
                with torch.autocast(dev.type, dtype=torch.bfloat16, enabled=dev.type == "cuda"):
                    loss = criterion(model(x), y)
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()
                scheduler.step()
                step += 1
                loss_sum += loss.detach()
                if step % 50 == 0:
                    writer.add_scalar("train/loss", loss.item(), step)
                    writer.add_scalar("train/lr", scheduler.get_last_lr()[0], step)
            logits = predict(model, val_loader, dev)
            metrics = evaluate(logits, y_val, n, known)
            val_loss = torch.nn.functional.cross_entropy(logits, y_val).item()
            for k, v in metrics.items():
                writer.add_scalar(f"val/{k.removeprefix('val_')}", v, epoch)
            writer.add_scalar("val/loss", val_loss, epoch)
            is_best = metrics["val_macro_f1"] > best
            print(
                f"epoch {epoch}/{args.epochs} {stage}: train loss {loss_sum.item() / steps_per_epoch:.3f}"
                f", val loss {val_loss:.3f}, top-1 {metrics['val_top1']:.3f}, top-3 "
                f"{metrics['val_top3']:.3f}, macro-F1 {metrics['val_macro_f1']:.3f}"
                f"{' *' if is_best else ''} ({time.time() - start:.0f} s)",
                flush=True,
            )
            if is_best:
                best = metrics["val_macro_f1"]
                best_metrics = {"epoch": epoch, **metrics}
                torch.save(
                    {
                        "model": args.model,
                        "state_dict": model.state_dict(),
                        "labels": label_list,
                        "preprocess": spec(),
                        "epoch": epoch,
                        "metrics": metrics,
                    },
                    out / "best.pt",
                )
    writer.close()

    # Reports for the best checkpoint.
    checkpoint = torch.load(out / "best.pt", map_location=dev)
    model.load_state_dict(checkpoint["state_dict"])
    logits = predict(model, val_loader, dev)
    metrics = {
        "model": args.model,
        "classes": n,
        "train_images": len(train_items),
        "val_images": len(val_items),
        **best_metrics,
        **evaluate(logits, y_val, n, known),
    }
    write_reports(out, logits, y_val, val_items, classes, rows, metrics)
    print(json.dumps({k: v for k, v in metrics.items() if k != "dangerous_confusions"}, indent=2))
    print(f"results in {out}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    parser.add_argument("--model", default=MODEL, help="a timm model with ImageNet weights")
    parser.add_argument("--name", default=None, help="run directory under <data dir>/runs")
    parser.add_argument("--epochs", type=int, default=25, help="total, head stage included")
    parser.add_argument("--head-epochs", type=int, default=3)
    parser.add_argument("--head-lr", type=float, default=1e-3)
    parser.add_argument("--lr", type=float, default=3e-4, help="full-model stage")
    parser.add_argument("--weight-decay", type=float, default=0.05)
    parser.add_argument("--warmup", type=float, default=1.0, help="warmup epochs per stage")
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)
    if not 0 < args.head_epochs < args.epochs:
        parser.error("--head-epochs must be between 0 and --epochs")
    args.name = args.name or f"{args.model.split('.')[0]}-{time.strftime('%Y%m%d-%H%M')}"
    return cmd_train(args)


if __name__ == "__main__":
    sys.exit(main())
