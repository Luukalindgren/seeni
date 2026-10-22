"""Example photos per species for the app's result view and species gallery (#10 UI).

    uv run python -m seeni.species_images

`species/kuvat.json` maps each class id to an image id of the manifest, chosen by hand
among the val and test photos the model was most sure about: a clear, typical view of the
mushroom. This writes each photo, resized, to web/public/species/<class id>.jpg and the
credits to web/public/species/credits.json, which the app shows under the photo.

`species/galleria.json` maps each class id to up to three more image ids for the gallery:
val and test photos of that class with the highest v1 probability for the true class, each
from a different observation than the others and the kuvat.json photo. They are written,
smaller, to web/public/species/gallery/<class id>-<n>.jpg (n = 1..3), with the credits in
web/public/species/gallery.json.

All photos are CC0 or CC-BY (hard rule 1) and are credited in ATTRIBUTIONS.md; the table
rows are printed.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

from seeni.muu import read_manifests
from seeni.paths import REPO_ROOT, data_dir

CHOICES = REPO_ROOT / "species" / "kuvat.json"
GALLERY_CHOICES = REPO_ROOT / "species" / "galleria.json"
OUT = REPO_ROOT / "web" / "public" / "species"
GALLERY_OUT = OUT / "gallery"
WIDTH = 480
GALLERY_WIDTH = 360


def write_photo(m: dict, class_id: str, path: Path, width: int, quality: int) -> tuple:
    """Resize one manifest image to `path`; return its credit and ATTRIBUTIONS.md row."""
    if m["class_id"] != class_id:
        raise SystemExit(f"{m['image']} is {m['class_id']}, not {class_id}")
    with Image.open(data_dir() / m["path"]) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((width, width * 4 // 3), Image.Resampling.LANCZOS)
        im.save(path, quality=quality, optimize=True, progressive=True)
    source = f"https://www.gbif.org/occurrence/{m['gbifID']}"
    credit = {"author": m["rights_holder"], "license": m["license"], "source": source}
    row = (
        f"| `{path.relative_to(REPO_ROOT).as_posix()}` | {m['rights_holder']} | "
        f"{m['license']} | [GBIF {m['gbifID']}]({source}) |"
    )
    return credit, row


def write_credits(path: Path, credits: dict) -> None:
    path.write_text(json.dumps(credits, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main() -> int:
    manifest = {m["image"]: m for m in read_manifests()}
    OUT.mkdir(parents=True, exist_ok=True)
    credits, rows = {}, []
    for class_id, image in json.loads(CHOICES.read_text(encoding="utf-8")).items():
        path = OUT / f"{class_id}.jpg"
        credits[class_id], row = write_photo(manifest[image], class_id, path, WIDTH, 82)
        rows.append(row)
    write_credits(OUT / "credits.json", credits)
    print("\n".join(rows))

    GALLERY_OUT.mkdir(parents=True, exist_ok=True)
    credits, rows = {}, []
    for class_id, images in json.loads(GALLERY_CHOICES.read_text(encoding="utf-8")).items():
        for n, image in enumerate(images, 1):
            key = f"{class_id}-{n}"
            path = GALLERY_OUT / f"{key}.jpg"
            credits[key], row = write_photo(manifest[image], class_id, path, GALLERY_WIDTH, 80)
            rows.append(row)
    # A photo dropped from galleria.json would otherwise stay in the app without its credit.
    for stale in GALLERY_OUT.glob("*.jpg"):
        if stale.stem not in credits:
            stale.unlink()
    write_credits(OUT / "gallery.json", credits)
    print("\n".join(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
