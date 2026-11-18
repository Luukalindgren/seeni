"""The one preprocessing definition (hard rule 4, #14).

Eval transform: decode with EXIF orientation applied → RGB → resize the shorter side to 256
with antialiased bilinear interpolation (PIL's, which torchvision uses for PIL images) →
center crop 224 → / 255 → normalize with mean/std → NCHW float32. `spec()` is this
definition as data; training writes it to preprocess.json next to the checkpoint and the
export (#8) ships it. The browser reproduces it from there, including the resize method,
instead of relying on canvas scaling.

The training augmentation lives here too, so it shares the crop size and normalization.
It never changes hue or saturation (hard rule 6): colour is a diagnostic feature.
"""

from pathlib import Path

from PIL import Image, ImageOps
from torchvision import transforms

RESIZE = 256
CROP = 224
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
INTERPOLATION = "bilinear"
ANTIALIAS = True
# The zoomed view (#137): the centre ZOOM of each side of the decoded image, before the eval
# transform. A mushroom photographed from standing height is small in the centre crop, and
# the model then leans to `muu` or stays unsure; the zoomed view shows it larger.
ZOOM = 0.6


def load(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def spec() -> dict:
    """The eval transform as data: the content of preprocess.json."""
    return {
        "exifOrientation": True,
        "colorSpace": "RGB",
        "resize": {"shorterSide": RESIZE, "interpolation": INTERPOLATION, "antialias": ANTIALIAS},
        "centerCrop": CROP,
        "scale": 1 / 255,
        "mean": list(MEAN),
        "std": list(STD),
        "layout": "NCHW",
        "dtype": "float32",
    }


def zoom(image: Image.Image, scale: float = ZOOM) -> Image.Image:
    """The centre `scale` of each side, in whole pixels: width round(w * scale), left
    (w - width) // 2, and the same for the height."""
    w, h = image.size
    cw, ch = max(1, round(w * scale)), max(1, round(h * scale))
    left, top = (w - cw) // 2, (h - ch) // 2
    return image.crop((left, top, left + cw, top + ch))


class Zoom:
    """`zoom` as a transform (a class, so DataLoader workers can pickle it)."""

    def __init__(self, scale: float = ZOOM):
        self.scale = scale

    def __call__(self, image: Image.Image) -> Image.Image:
        return zoom(image, self.scale)


def zoom_transform(scale: float = ZOOM) -> transforms.Compose:
    """The zoomed view: `zoom`, then the eval transform."""
    return transforms.Compose([Zoom(scale), *eval_transform().transforms])


def eval_transform() -> transforms.Compose:
    return transforms.Compose(
        [
            transforms.Resize(
                RESIZE,
                interpolation=transforms.InterpolationMode(INTERPOLATION),
                antialias=ANTIALIAS,
            ),
            transforms.CenterCrop(CROP),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )


def train_transform() -> transforms.Compose:
    """Augmentation for fine-tuning (PLAN.md phase 6): a small rotation, a random crop of
    35–100 % of the image, horizontal flip, brightness and contrast. No hue jitter."""
    mode = transforms.InterpolationMode(INTERPOLATION)
    return transforms.Compose(
        [
            transforms.RandomRotation(15, interpolation=mode),
            transforms.RandomResizedCrop(CROP, scale=(0.35, 1.0), interpolation=mode),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.25, contrast=0.25),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )
