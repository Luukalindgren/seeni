import json

import numpy as np
import pytest

from seeni.export import FIXTURES, check, models_dir, softmax, spread
from seeni.lajilista import UNKNOWN_CLASS, classes, read
from seeni.preprocess import load, spec

V1 = models_dir("v1")


def test_check_passes_close_outputs_and_fails_a_swapped_top5():
    ref = np.array([[5.0, 4.0, 3.0, 2.0, 1.0, 0.0]] * 4, dtype=np.float32)
    assert check(ref, ref + 1e-5, ref + 1e-2)["fp16_top1_match"] == 1.0
    swapped = ref.copy()
    swapped[0, [3, 4]] = swapped[0, [4, 3]]
    with pytest.raises(SystemExit):
        check(ref, swapped, ref)
    with pytest.raises(SystemExit):
        check(ref, ref, ref[:, ::-1].copy())


def test_spread_takes_one_per_class_first():
    items = [{"image": f"{c}{i}", "class_id": c} for c in "abc" for i in range(5)]
    picked = spread(items, 4, "k")
    assert {m["class_id"] for m in picked[:3]} == {"a", "b", "c"}
    assert len(picked) == 4


# The published model files: the contract between training and the web app (#8).


def test_published_preprocess_is_the_one_definition():
    assert json.loads((V1 / "preprocess.json").read_text()) == spec()


def test_published_labels_are_list_classes_then_muu():
    labels = json.loads((V1 / "labels.json").read_text())
    by_class = classes(read())
    assert labels[-1] == {"id": UNKNOWN_CLASS, "taxonKeys": []}
    for c in labels[:-1]:
        assert c["id"] in by_class
        assert c["taxonKeys"] == sorted({r.taxon_key for r in by_class[c["id"]]})


def test_published_calibration():
    c = json.loads((V1 / "calibration.json").read_text())
    assert c["temperature"] > 0 and 0 <= c["unknownThreshold"] < 1
    assert c["candidateMass"] == 0.95 and c["maxCandidates"] == 5


def test_golden_probabilities_follow_from_the_logits():
    golden = json.loads((FIXTURES / "golden.json").read_text())
    labels = json.loads((V1 / "labels.json").read_text())
    assert len(golden["images"]) == 20
    for g in golden["images"]:
        assert (FIXTURES / g["file"]).exists()
        for t in g["top5"]:
            assert labels[t["index"]]["id"] == t["id"]
        logits = [t["logit"] for t in g["top5"]]
        assert logits == sorted(logits, reverse=True)


def test_python_matches_the_golden_fixtures():
    """The Python half of the parity test: the committed model, run with onnxruntime on the
    committed images, gives the golden top-5, and preprocessing gives the golden tensors."""
    ort = pytest.importorskip("onnxruntime")
    from seeni.preprocess import eval_transform

    golden = json.loads((FIXTURES / "golden.json").read_text())
    transform = eval_transform()
    x = np.stack([transform(load(FIXTURES / g["file"])).numpy() for g in golden["images"]])
    for path in golden["tensors"]:
        name = path.removeprefix("tensors/").removesuffix(".npy")
        i = next(k for k, g in enumerate(golden["images"]) if name in g["file"])
        np.testing.assert_allclose(np.load(FIXTURES / path)[0], x[i], atol=1e-6)
    session = ort.InferenceSession(str(V1 / "model.onnx"), providers=["CPUExecutionProvider"])
    logits = session.run(["logits"], {"input": x.astype(np.float32)})[0]
    probs = softmax(logits / golden["temperature"])
    for g, row, p in zip(golden["images"], logits, probs):
        top = np.argsort(-row)[:5]
        assert [t["index"] for t in g["top5"]] == top.tolist()
        np.testing.assert_allclose([t["logit"] for t in g["top5"]], row[top], atol=1e-3)
        np.testing.assert_allclose([t["probability"] for t in g["top5"]], p[top], atol=1e-4)
