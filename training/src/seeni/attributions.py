"""Attribution data for the app and the repository (phase 11, #11).

    uv run python -m seeni.attributions

The model is derived from every image in the manifests (species and `muu`), so every
photographer is credited (ATTRIBUTIONS.md). It writes:

    web/public/attributions.json        what the app's about page shows: the GBIF download
                                        citations and each rights holder with their image
                                        count and licenses
    data-meta/attributions.parquet      one row per image: image, gbifID, class, license,
                                        license URL, rights holder, creator, source URL
"""

import json
import sys
from collections import Counter, defaultdict

import pyarrow as pa
import pyarrow.parquet as pq

from seeni.gbif_download import DOWNLOAD_RECORD
from seeni.muu import read_manifests
from seeni.paths import REPO_ROOT

WEB = REPO_ROOT / "web" / "public" / "attributions.json"
TABLE = REPO_ROOT / "data-meta" / "attributions.parquet"
COLUMNS = [
    "image",
    "gbifID",
    "class_id",
    "license",
    "license_url",
    "rights_holder",
    "creator",
    "url",
]


def photographers(manifest: list[dict]) -> list[dict]:
    images: Counter = Counter()
    licenses: dict[str, set[str]] = defaultdict(set)
    for m in manifest:
        images[m["rights_holder"]] += 1
        licenses[m["rights_holder"]].add(m["license"])
    return [
        {"name": name, "images": images[name], "licenses": sorted(licenses[name])}
        for name in sorted(images, key=lambda n: (n.casefold(), n))
    ]


def main() -> int:
    manifest = read_manifests()
    downloads = json.loads(DOWNLOAD_RECORD.read_text(encoding="utf-8"))["downloads"]
    record = {
        "images": len(manifest),
        "licenses": dict(Counter(m["license"] for m in manifest).most_common()),
        "downloads": [{"doi": d["doi"], "citation": d["citation"]} for d in downloads],
        "photographers": photographers(manifest),
    }
    WEB.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    rows = sorted(({c: m[c] for c in COLUMNS} for m in manifest), key=lambda r: r["image"])
    pq.write_table(pa.Table.from_pylist(rows), TABLE)
    print(f"{len(manifest)} images by {len(record['photographers'])} rights holders")
    print(f"wrote {WEB.relative_to(REPO_ROOT)} and {TABLE.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
