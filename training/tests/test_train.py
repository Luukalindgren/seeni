import math

import pytest
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


def test_classes_outside_the_model_are_not_trained_and_muu_images_are():
    index = {"a": 0, "muu": 1}
    taxon_class = {1: "a", 2: "not-in-model"}
    assert target(1, "a", taxon_class, index) == 0
    assert target(2, "not-in-model", taxon_class, index) is None
    assert target(77, "muu", taxon_class, index) == 1


def test_a_listed_taxon_in_muu_fails():
    with pytest.raises(SystemExit):
        target(1, "muu", {1: "a"}, {"a": 0, "muu": 1})


def test_a_renamed_class_fails_instead_of_training_as_muu():
    with pytest.raises(SystemExit):
        target(1, "old-name", {1: "a"}, {"a": 0, "muu": 1})
    with pytest.raises(SystemExit):
        target(3, "a", {1: "a"}, {"a": 0, "muu": 1})


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


def test_zoom_takes_the_centre_in_whole_pixels():
    from PIL import Image

    from seeni.preprocess import zoom

    image = Image.new("RGB", (101, 50))
    for x in range(101):
        image.putpixel((x, 25), (x, 0, 0))
    z = zoom(image, 0.6)
    # width round(60.6) = 61, left (101 - 61) // 2 = 20; height 30, top 10
    assert z.size == (61, 30)
    assert z.getpixel((0, 15)) == (20, 0, 0)
    assert z.getpixel((60, 15)) == (80, 0, 0)


def test_zoom_out_puts_a_smaller_image_on_a_background(tmp_path):
    import random

    from PIL import Image

    from seeni.preprocess import ZoomOut

    floor = tmp_path / "floor.jpg"
    Image.new("RGB", (300, 200), (0, 0, 255)).save(floor)
    image = Image.new("RGB", (224, 224), (255, 0, 0))
    assert ZoomOut([floor], p=0.0)(image) is image
    assert ZoomOut([], p=1.0)(image) is image
    random.seed(1)
    out = ZoomOut([floor], p=1.0, scale=(0.5, 0.5))(image)
    assert out.size == (224, 224)
    pixels = [out.getpixel((x, y)) for x in range(224) for y in range(224)]
    red = sum(r > 200 and b < 60 for r, _, b in pixels)
    # About the ellipse inside a 112 × 112 paste, never the whole frame.
    assert 0.1 * 224 * 224 < red < 0.25 * 224 * 224
    corners = [out.getpixel(c) for c in ((0, 0), (223, 0), (0, 223), (223, 223))]
    assert sum(c[2] > 200 for c in corners) >= 3
