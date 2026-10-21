"""One example photo per species for the app's result view (#10 UI).

    uv run python -m seeni.species_images

`species/kuvat.json` maps each class id to an image id of the manifest, chosen by hand
among the val and test photos the model was most sure about: a clear, typical view of the
mushroom. This writes each photo, resized, to web/public/species/<class id>.jpg and the
credits to web/public/species/credits.json, which the app shows under the photo. The
photos are CC0 or CC-BY (hard rule 1) and are credited in ATTRIBUTIONS.md.
"""

import json
import sys

from PIL import Image, ImageOps

from seeni.muu import read_manifests
from seeni.paths import REPO_ROOT, data_dir

CHOICES = REPO_ROOT / "species" / "kuvat.json"
OUT = REPO_ROOT / "web" / "public" / "species"
WIDTH = 480


def main() -> int:
    choices = json.loads(CHOICES.read_text(encoding="utf-8"))
    manifest = {m["image"]: m for m in read_manifests()}
    OUT.mkdir(parents=True, exist_ok=True)
    credits, rows = {}, []
    for class_id, image in choices.items():
        m = manifest[image]
        if m["class_id"] != class_id:
            raise SystemExit(f"{image} is {m['class_id']}, not {class_id}")
        with Image.open(data_dir() / m["path"]) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((WIDTH, WIDTH * 4 // 3), Image.Resampling.LANCZOS)
            im.save(OUT / f"{class_id}.jpg", quality=82, optimize=True, progressive=True)
        source = f"https://www.gbif.org/occurrence/{m['gbifID']}"
        credits[class_id] = {
            "author": m["rights_holder"],
            "license": m["license"],
            "source": source,
        }
        rows.append(
            f"| `web/public/species/{class_id}.jpg` | {m['rights_holder']} | {m['license']} | "
            f"[GBIF {m['gbifID']}]({source}) |"
        )
    (OUT / "credits.json").write_text(
        json.dumps(credits, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print("\n".join(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
