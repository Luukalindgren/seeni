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

Checks, which stop the export when they fail: on 200 test images (the plan asks for about 50;
200 makes "more than 99 %" mean something), the fp32 ONNX model's top-5 equals PyTorch's and
its logits differ by less than 1e-3; the fp16 model's top-1 matches PyTorch on more than
99 % of them. Everything runs on the CPU in fp32, except the fp16 weights of the shipped
model. The golden outputs are those of the shipped fp16 model, since that is what the browser
runs; golden.json also keeps the fp32 logits for reference.
"""

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import torch

from seeni.evaluate import checked_labels, items_for, load_model, run_dir
from seeni.lajilista import LAJILISTA, UNKNOWN_CLASS, read
from seeni.paths import REPO_ROOT, data_dir
from seeni.preprocess import CROP, eval_transform, load, spec

OPSET = 17
CHECK_IMAGES = 200
FIXTURE_PARTS = ["images", "tensors", "golden.json"]
FIXTURE_IMAGES = 20
TENSOR_FIXTURES = 3
MAX_LOGIT_DIFF = 1e-3
MIN_FP16_TOP1 = 0.99
FIXTURES = REPO_ROOT / "web" / "tests" / "fixtures"


def models_dir(version: str) -> Path:
    return REPO_ROOT / "web" / "public" / "models" / version


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


def golden(items, logits, fp32_logits, class_ids, calibration) -> list[dict]:
    """Expected top-5 per image. `logit` and `probability` come from the shipped fp16 model,
    which the browser runs; `logitFp32` from the fp32 export, for reference."""
    probs = softmax(logits / calibration["temperature"])
    out = []
    for m, row, ref, p in zip(items, logits, fp32_logits, probs):
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
                        "logitFp32": round(float(ref[i]), 5),
                        "probability": round(float(p[i]), 6),
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

    # Everything is staged in the run's export/ folder first and copied into the repo only
    # when it is complete, so a failure never leaves a model next to stale fixtures.
    stage = work / "stage"
    if stage.exists():
        shutil.rmtree(stage)
    (stage / "model").mkdir(parents=True)
    shutil.copyfile(fp16_path, stage / "model" / "model.onnx")
    shutil.copyfile(run / "labels.json", stage / "model" / "labels.json")
    (stage / "model" / "preprocess.json").write_text(json.dumps(spec(), indent=2) + "\n")
    (stage / "model" / "calibration.json").write_text(
        json.dumps({**calibration, "run": args.run}, indent=2) + "\n"
    )

    # Golden fixtures from the test set: a muu image, then one image per class.
    muu = [m for m in test if m["class_id"] == UNKNOWN_CLASS]
    if not muu:
        raise SystemExit("the test set has no muu image")
    first = spread(muu, 1, "fixture")
    fixtures = first + spread([m for m in test if m not in first], FIXTURE_IMAGES - 1, "fixture")
    for d in FIXTURE_PARTS[:2]:
        (stage / "fixtures" / d).mkdir(parents=True)
    for m in fixtures:
        shutil.copyfile(root / m["path"], stage / "fixtures" / "images" / f"{m['image']}.jpg")
    fx = inputs([stage / "fixtures" / "images" / f"{m['image']}.jpg" for m in fixtures])
    logits = run_onnx(stage / "model" / "model.onnx", fx)
    for m, t in zip(fixtures[:TENSOR_FIXTURES], fx[:TENSOR_FIXTURES]):
        np.save(stage / "fixtures" / "tensors" / f"{m['image']}.npy", t[None])
    record = {
        "model": f"models/{args.version}/model.onnx",
        "temperature": calibration["temperature"],
        "tensors": [f"tensors/{m['image']}.npy" for m in fixtures[:TENSOR_FIXTURES]],
        "images": golden(fixtures, logits, run_onnx(fp32_path, fx), class_ids, calibration),
    }
    (stage / "fixtures" / "golden.json").write_text(json.dumps(record, indent=2) + "\n")

    out = models_dir(args.version)
    out.mkdir(parents=True, exist_ok=True)
    for f in (stage / "model").iterdir():
        shutil.copyfile(f, out / f.name)
    # Replace only the parts of the fixtures folder the export owns.
    args.fixtures.mkdir(parents=True, exist_ok=True)
    for part in FIXTURE_PARTS:
        target = args.fixtures / part
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
        src = stage / "fixtures" / part
        (shutil.copytree if src.is_dir() else shutil.copyfile)(src, target)
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
