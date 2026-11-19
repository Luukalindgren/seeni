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

import random
from collections.abc import Sequence
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps
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


class ZoomOut:
    """Training augmentation (#137): with probability `p`, the image shrunk to `scale` of
    each side and placed at a random spot on a forest-floor photo, as a mushroom looks in a
    photo taken from standing height. Training otherwise only zooms in, and v2 answered 51 %
    of species photos with the mushroom at 40 % size against 83 % as photographed.

    `backgrounds` are `muu` non-mushroom photos from train (moss, needles, leaves). The
    edge is feathered with a soft ellipse, so that no sharp rectangle gives the paste away.
    Applied after the crop, so the mushroom itself is never cut off. No colour change
    (hard rule 6)."""

    def __init__(
        self,
        backgrounds: Sequence[Path],
        p: float = 0.3,
        scale: tuple[float, float] = (0.4, 0.85),
    ):
        self.backgrounds, self.p, self.scale = list(backgrounds), p, scale

    def __call__(self, image: Image.Image) -> Image.Image:
        if not self.backgrounds or random.random() >= self.p:
            return image
        w, h = image.size
        mode = Image.Resampling.BILINEAR
        out = ImageOps.fit(load(random.choice(self.backgrounds)), (w, h), method=mode)
        s = random.uniform(*self.scale)
        sw, sh = max(1, round(w * s)), max(1, round(h * s))
        small = image.resize((sw, sh), mode, reducing_gap=None)
        mask = Image.new("L", (sw, sh), 0)
        inset = round(min(sw, sh) * 0.04)
        ImageDraw.Draw(mask).ellipse((inset, inset, sw - 1 - inset, sh - 1 - inset), fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(max(1, min(sw, sh) * 0.06)))
        out.paste(small, (random.randint(0, w - sw), random.randint(0, h - sh)), mask)
        return out


def train_transform(backgrounds: Sequence[Path] = (), zoom_out: float = 0.0) -> transforms.Compose:
    """Augmentation for fine-tuning (PLAN.md phase 6): a small rotation, a random crop of
    35–100 % of the image, with probability `zoom_out` the crop shrunk onto a forest-floor
    photo (ZoomOut, #137), horizontal flip, brightness and contrast. No hue jitter."""
    mode = transforms.InterpolationMode(INTERPOLATION)
    return transforms.Compose(
        [
            transforms.RandomRotation(15, interpolation=mode),
            transforms.RandomResizedCrop(CROP, scale=(0.35, 1.0), interpolation=mode),
            ZoomOut(backgrounds, p=zoom_out),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(brightness=0.25, contrast=0.25),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )
