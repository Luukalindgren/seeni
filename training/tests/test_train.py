import math

import torch

from seeni.lajilista import Row
from seeni.preprocess import CROP, eval_transform, spec
from seeni.train import (
    confusion_matrix,
    labels,
    macro_f1,
    sample_weights,
    target,
    warmup_cosine,
)


def row(class_id: str, key: int | None, in_model: bool = True) -> Row:
    return Row(1, class_id, "X y", "", key, "syötävä", (), in_model)


def test_labels_keep_list_order_and_end_with_muu():
    rows = [row("b", 2), row("a", 1), row("b", 3), row("c", 4, in_model=False), row("d", None)]
    assert labels(rows) == [
        {"id": "b", "taxonKeys": [2, 3]},
        {"id": "a", "taxonKeys": [1]},
        {"id": "d", "taxonKeys": []},
        {"id": "muu", "taxonKeys": []},
    ]


def test_classes_outside_the_model_train_as_muu():
    index = {"a": 0, "muu": 1}
    assert target("a", index) == 0
    assert target("not-in-model", index) == 1


def test_sample_weights_are_inverse_sqrt_of_class_size():
    w = sample_weights([0, 0, 0, 0, 1])
    assert w[0] == 0.5 and w[4] == 1.0
    # A class is drawn in proportion to sqrt(its size): 4 images -> 2, 1 image -> 1.
    assert math.isclose(sum(w[:4]) / w[4], 2.0)


def test_warmup_cosine():
    assert warmup_cosine(0, 10, 100) == 0.1
    assert warmup_cosine(9, 10, 100) == 1.0
    assert math.isclose(warmup_cosine(55, 10, 100), 0.5)
    assert math.isclose(warmup_cosine(100, 10, 100), 0.0, abs_tol=1e-12)


def test_macro_f1_ignores_classes_without_val_images():
    y = torch.tensor([0, 0, 1, 1])
    pred = torch.tensor([0, 1, 1, 1])
    c = confusion_matrix(y, pred, 3)
    assert c.tolist() == [[1, 1, 0], [0, 2, 0], [0, 0, 0]]
    f1_0, f1_1 = 2 / 3, 0.8  # P 1, R 0.5; P 2/3, R 1
    assert math.isclose(macro_f1(c), (f1_0 + f1_1) / 2)


def test_spec_matches_eval_transform():
    s = spec()
    assert s["resize"] == {"shorterSide": 256, "interpolation": "bilinear", "antialias": True}
    resize, crop, _, normalize = eval_transform().transforms
    assert resize.size == s["resize"]["shorterSide"]
    assert resize.interpolation.value == s["resize"]["interpolation"]
    assert resize.antialias is s["resize"]["antialias"]
    assert crop.size == (CROP, CROP) == (s["centerCrop"],) * 2
    assert list(normalize.mean) == s["mean"] and list(normalize.std) == s["std"]
