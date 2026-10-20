import itertools
import json

import numpy as np
import onnxruntime as ort
import pytest

from seeni.export import FIXTURE_IMAGES, FIXTURES, check, softmax, spread
from seeni.lajilista import UNKNOWN_CLASS, read
from seeni.paths import REPO_ROOT
from seeni.preprocess import eval_transform, load, spec

GOLDEN = json.loads((FIXTURES / "golden.json").read_text())
# The model the fixtures were made with, e.g. web/public/models/v1/.
MODEL = REPO_ROOT / "web" / "public" / GOLDEN["model"]
PUBLISHED = MODEL.parent


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
    assert json.loads((PUBLISHED / "preprocess.json").read_text()) == spec()


def test_published_labels_are_model_classes_then_muu():
    """Every class of labels.json is an in-model class of the list, with its taxa. The list
    may gain classes later; a published model's labels stay as they were trained."""
    labels = json.loads((PUBLISHED / "labels.json").read_text())
    rows = read()
    assert labels[-1] == {"id": UNKNOWN_CLASS, "taxonKeys": []}
    ids = [c["id"] for c in labels[:-1]]
    assert len(ids) == len(set(ids))
    for c in labels[:-1]:
        taxa = [r for r in rows if r.class_id == c["id"] and r.in_model]
        assert taxa, c["id"]
        assert c["taxonKeys"] == sorted({r.taxon_key for r in taxa if r.taxon_key is not None})


def test_published_calibration():
    c = json.loads((PUBLISHED / "calibration.json").read_text())
    assert c["temperature"] > 0 and 0 <= c["unknownThreshold"] < 1
    assert c["candidateMass"] == 0.95 and c["maxCandidates"] == 5
    assert GOLDEN["temperature"] == c["temperature"]


def test_golden_records_are_consistent():
    labels = json.loads((PUBLISHED / "labels.json").read_text())
    assert len(GOLDEN["images"]) == FIXTURE_IMAGES
    assert UNKNOWN_CLASS in {g["class_id"] for g in GOLDEN["images"]}
    t = GOLDEN["temperature"]
    for g in GOLDEN["images"]:
        assert (FIXTURES / g["file"]).exists()
        top = g["top5"]
        assert [labels[x["index"]]["id"] for x in top] == [x["id"] for x in top]
        logits = [x["logit"] for x in top]
        probs = [x["probability"] for x in top]
        assert logits == sorted(logits, reverse=True)
        assert sum(probs) <= 1 + 1e-5
        # softmax(logits / T): the ratio of two probabilities is exp((l_i - l_j) / T).
        for a, b in itertools.pairwise(top):
            if b["probability"] > 1e-4:
                ratio = a["probability"] / b["probability"]
                assert ratio == pytest.approx(np.exp((a["logit"] - b["logit"]) / t), rel=1e-2)


def test_python_matches_the_golden_fixtures():
    """The Python half of the parity test: the committed model, run with onnxruntime on the
    committed images, gives the golden top-5, and preprocessing gives the golden tensors."""
    transform = eval_transform()
    x = np.stack([transform(load(FIXTURES / g["file"])).numpy() for g in GOLDEN["images"]])
    for path in GOLDEN["decoded"]:
        name = path.removeprefix("decoded/").removesuffix(".npy")
        g = next(g for g in GOLDEN["images"] if name in g["file"])
        np.testing.assert_array_equal(
            np.load(FIXTURES / path), np.asarray(load(FIXTURES / g["file"]))
        )
        assert f"tensors/{name}.npy" in GOLDEN["tensors"]
    for path in GOLDEN["tensors"]:
        name = path.removeprefix("tensors/").removesuffix(".npy")
        i = next(k for k, g in enumerate(GOLDEN["images"]) if name in g["file"])
        np.testing.assert_allclose(np.load(FIXTURES / path)[0], x[i], atol=1e-6)
    session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
    logits = session.run(["logits"], {"input": x.astype(np.float32)})[0]
    probs = softmax(logits / GOLDEN["temperature"])
    for g, row, p in zip(GOLDEN["images"], logits, probs):
        top = np.argsort(-row)[:5]
        assert [t["index"] for t in g["top5"]] == top.tolist()
        np.testing.assert_allclose([t["logit"] for t in g["top5"]], row[top], atol=1e-3)
        np.testing.assert_allclose([t["probability"] for t in g["top5"]], p[top], atol=1e-4)
