"""Export a trained run to ONNX for the browser, with checks and golden fixtures (phase 8, #8).

Run from training/ on the desktop, after `seeni.evaluate val` and `test`:

    uv run python -m seeni.export --run b0-224-muu --version v1

It writes the four files that are the contract between training and the web app to
web/public/models/<version>/:

    model.onnx         fp16 weights, fp32 input `input` (N×3×224×224) and output `logits`
    labels.json        the run's class order (hard rule 5)
    preprocess.json    seeni.preprocess.spec(), the one preprocessing definition (hard rule 4)
    calibration.json   T and the unknown threshold fixed in phase 7

and the golden fixtures for the parity test (hard rule 7, #10, #14) to web/tests/fixtures/:

    images/<image>.jpg          20 test images (CC0/CC-BY, credited in ATTRIBUTIONS.md)
    golden.json                 per image: the expected top-5 of the shipped model, as raw
                                logits and as calibrated probabilities
    tensors/<image>.npy         the expected 1×3×224×224 float32 input for a few of them

Checks, which stop the export when they fail: on 50 test images, the fp32 ONNX model's top-5
equals PyTorch's and its logits differ by less than 1e-3; the fp16 model's top-1 matches
PyTorch on more than 99 % of them. Everything runs in fp32 on the CPU, except fp16 weights.
"""

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import torch

from seeni.evaluate import checked_labels, items_for, run_dir
from seeni.lajilista import LAJILISTA, UNKNOWN_CLASS, read
from seeni.paths import REPO_ROOT, data_dir
from seeni.preprocess import CROP, eval_transform, load, spec

OPSET = 17
CHECK_IMAGES = 50
FIXTURE_IMAGES = 20
TENSOR_FIXTURES = 3
MAX_LOGIT_DIFF = 1e-3
MIN_FP16_TOP1 = 0.99
FIXTURES = REPO_ROOT / "web" / "tests" / "fixtures"


def models_dir(version: str) -> Path:
    return REPO_ROOT / "web" / "public" / "models" / version


def load_model(run: Path, n: int):
    import timm

    checkpoint = torch.load(run / "best.pt", map_location="cpu")
    model = timm.create_model(checkpoint["model"], pretrained=False, num_classes=n)
    model.load_state_dict(checkpoint["state_dict"])
    return model.eval()


def export_onnx(model, path: Path) -> None:
    """fp32 ONNX, opset 17, input `input` and output `logits` with a dynamic batch."""
    path.parent.mkdir(parents=True, exist_ok=True)
    x = torch.zeros(1, 3, CROP, CROP)
    torch.onnx.export(
        model,
        (x,),
        str(path),
        input_names=["input"],
        output_names=["logits"],
        opset_version=OPSET,
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        dynamo=False,
    )


def to_fp16(src: Path, dest: Path) -> None:
    import onnx
    from onnxconverter_common import float16

    model = float16.convert_float_to_float16(onnx.load(str(src)), keep_io_types=True)
    onnx.save(model, str(dest))


def run_onnx(path: Path, x: np.ndarray) -> np.ndarray:
    import onnxruntime as ort

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    return np.concatenate(
        [session.run(["logits"], {"input": x[i : i + 16]})[0] for i in range(0, len(x), 16)]
    )


def inputs(paths: list[Path]) -> np.ndarray:
    transform = eval_transform()
    return torch.stack([transform(load(p)) for p in paths]).numpy().astype(np.float32)


def check(reference: np.ndarray, fp32: np.ndarray, fp16: np.ndarray) -> dict:
    """The phase 8 checks; raises SystemExit when one fails."""
    top5 = lambda a: np.argsort(-a, axis=1)[:, :5]
    result = {
        "images": len(reference),
        "fp32_max_logit_diff": float(np.abs(fp32 - reference).max()),
        "fp32_top5_equal": bool((top5(fp32) == top5(reference)).all()),
        "fp16_top1_match": float((fp16.argmax(1) == reference.argmax(1)).mean()),
        "fp16_max_logit_diff": float(np.abs(fp16 - reference).max()),
    }
    if not result["fp32_top5_equal"] or result["fp32_max_logit_diff"] >= MAX_LOGIT_DIFF:
        raise SystemExit(f"fp32 ONNX differs from PyTorch: {result}")
    if result["fp16_top1_match"] <= MIN_FP16_TOP1:
        raise SystemExit(f"fp16 ONNX top-1 matches PyTorch too rarely: {result}")
    return result


def spread(items: list[dict], n: int, key: str) -> list[dict]:
    """n items in a fixed pseudo-random order, one per class first."""
    ordered = sorted(items, key=lambda m: hashlib.sha1(f"{key}:{m['image']}".encode()).hexdigest())
    first, rest, seen = [], [], set()
    for m in ordered:
        (rest if m["class_id"] in seen else first).append(m)
        seen.add(m["class_id"])
    return (first + rest)[:n]


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


def golden(items, logits, class_ids, temperature) -> list[dict]:
    probs = softmax(logits / temperature)
    out = []
    for m, row, p in zip(items, logits, probs):
        top = np.argsort(-row)[:5]
        out.append(
            {
                "file": f"images/{m['image']}.jpg",
                "class_id": m["class_id"],
                "top5": [
                    {
                        "index": int(i),
                        "id": class_ids[i],
                        "logit": round(float(row[i]), 5),
                        "probability": round(float(p[i]), 5),
                    }
                    for i in top
                ],
            }
        )
    return out


def attribution_rows(items: list[dict]) -> list[str]:
    return [
        f"| `web/tests/fixtures/images/{m['image']}.jpg` | {m['rights_holder']} | {m['license']} | "
        f"[GBIF {m['gbifID']}](https://www.gbif.org/occurrence/{m['gbifID']}) |"
        for m in items
    ]


def cmd_export(args) -> int:
    rows = read(args.lajilista)
    run = run_dir(args.run)
    class_ids = checked_labels(run, rows)
    calibration = json.loads((run / "eval" / "calibration.json").read_text())
    if json.loads((run / "preprocess.json").read_text()) != spec():
        raise SystemExit("the run was trained with another preprocessing than seeni.preprocess")
    model = load_model(run, len(class_ids))
    work = run / "export"
    fp32_path, fp16_path = work / "model-fp32.onnx", work / "model-fp16.onnx"
    export_onnx(model, fp32_path)
    to_fp16(fp32_path, fp16_path)

    root = data_dir()
    test = items_for("test", rows)
    sample = spread(test, CHECK_IMAGES, "check")
    x = inputs([root / m["path"] for m in sample])
    with torch.inference_mode():
        reference = model(torch.from_numpy(x)).numpy()
    result = check(reference, run_onnx(fp32_path, x), run_onnx(fp16_path, x))
    print(json.dumps(result, indent=2))

    out = models_dir(args.version)
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(fp16_path, out / "model.onnx")
    (out / "labels.json").write_text((run / "labels.json").read_text())
    (out / "preprocess.json").write_text(json.dumps(spec(), indent=2) + "\n")
    (out / "calibration.json").write_text(
        json.dumps({**calibration, "run": args.run}, indent=2) + "\n"
    )

    # Golden fixtures: one image per class first, muu included, from the test set.
    fixtures = spread(test, FIXTURE_IMAGES, "fixture")
    if UNKNOWN_CLASS not in {m["class_id"] for m in fixtures}:
        raise SystemExit("no muu image among the fixtures")
    if args.fixtures.exists():
        shutil.rmtree(args.fixtures)
    (args.fixtures / "images").mkdir(parents=True)
    (args.fixtures / "tensors").mkdir()
    for m in fixtures:
        shutil.copyfile(root / m["path"], args.fixtures / "images" / f"{m['image']}.jpg")
    fx = inputs([args.fixtures / "images" / f"{m['image']}.jpg" for m in fixtures])
    logits = run_onnx(out / "model.onnx", fx)
    for m, t in zip(fixtures[:TENSOR_FIXTURES], fx[:TENSOR_FIXTURES]):
        np.save(args.fixtures / "tensors" / f"{m['image']}.npy", t[None])
    record = {
        "model": f"models/{args.version}/model.onnx",
        "temperature": calibration["temperature"],
        "tensors": [f"tensors/{m['image']}.npy" for m in fixtures[:TENSOR_FIXTURES]],
        "images": golden(fixtures, logits, class_ids, calibration["temperature"]),
    }
    (args.fixtures / "golden.json").write_text(json.dumps(record, indent=2) + "\n")
    (work / "attributions.md").write_text("\n".join(attribution_rows(fixtures)) + "\n")
    (work / "check.json").write_text(json.dumps(result, indent=2) + "\n")
    size = (out / "model.onnx").stat().st_size / 1e6
    print(f"{out}: model.onnx {size:.1f} MB; fixtures in {args.fixtures}")
    print(f"attribution rows for ATTRIBUTIONS.md in {work / 'attributions.md'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    parser.add_argument("--run", required=True, help="run directory under <data dir>/runs")
    parser.add_argument("--version", default="v1", help="folder under web/public/models")
    parser.add_argument("--fixtures", type=Path, default=FIXTURES)
    args = parser.parse_args(argv)
    return cmd_export(args)


if __name__ == "__main__":
    sys.exit(main())
