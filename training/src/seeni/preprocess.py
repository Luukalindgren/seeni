"""The one preprocessing definition (hard rule 4).

Eval transform: resize the shorter side to 256 → center crop 224 → RGB / 255 → normalize
with mean/std → NCHW float32. The resize is bilinear with antialiasing (torchvision's
default for PIL images). #14 pins this down for the browser and exports it to
preprocess.json in #6; until then this module is the reference.
"""

from pathlib import Path

from PIL import Image, ImageOps
from torchvision import transforms

RESIZE = 256
CROP = 224
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def load(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def eval_transform() -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize(
                RESIZE, interpolation=transforms.InterpolationMode.BILINEAR, antialias=True
            ),
            transforms.CenterCrop(CROP),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )
