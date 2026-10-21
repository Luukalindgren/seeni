"""How often each class is observed in Finland, per region and month (#48).

    uv run python -m seeni.occurrence --out ../web/public/occurrence.json

Asks the GBIF occurrence search for counts only: one request per class and region, faceted
by month, from occurrences in Finland licensed CC0 or CC BY. No occurrence record is
downloaded or stored. The web app uses the table to note that a suggested species is rarely
found in the region at that time of year. It never hides or demotes a dangerous class.

The regions are latitude bands, coarse on purpose: the browser reduces a position to one of
them at once and keeps nothing more precise (hard rule 9).
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from seeni.gbif_match import Fetch, fetch_json
from seeni.lajilista import LAJILISTA, classes, read

# South below 62°N (about Jyväskylä), central up to 65°N (about Oulu), north above it.
REGIONS = [
    {"id": "etela", "minLat": 59.0, "maxLat": 62.0},
    {"id": "keski", "minLat": 62.0, "maxLat": 65.0},
    {"id": "pohjoinen", "minLat": 65.0, "maxLat": 71.0},
]
LICENSES = ["CC0_1_0", "CC_BY_4_0"]


def month_counts(taxon_keys: list[int], region: dict, fetch: Fetch) -> list[int]:
    """Occurrences of the taxa in Finland within the region, per month (January first)."""
    params = [
        *[("taxonKey", k) for k in taxon_keys],
        *[("license", x) for x in LICENSES],
        ("country", "FI"),
        # GBIF's range includes both ends; the bands are half-open like regionOf in the app.
        ("decimalLatitude", f"{region['minLat']},{region['maxLat'] - 0.000001}"),
        ("occurrenceStatus", "PRESENT"),
        ("limit", 0),
        ("facet", "month"),
        ("facetLimit", 12),
    ]
    response = fetch("occurrence/search", params)
    counts = [0] * 12
    for facet in response.get("facets", []):
        if facet.get("field") != "MONTH":
            continue
        for c in facet.get("counts", []):
            month = int(c["name"])
            if 1 <= month <= 12:
                counts[month - 1] = int(c["count"])
    return counts


def table(rows, fetch: Fetch, today: date) -> dict:
    out: dict = {
        "source": "GBIF.org occurrence search, Finland, CC0 and CC BY occurrences",
        "accessed": today.isoformat(),
        "regions": REGIONS,
        "classes": {},
    }
    for class_id, members in classes(rows).items():
        keys = sorted({r.taxon_key for r in members if r.taxon_key is not None})
        if not keys:
            continue
        out["classes"][class_id] = [month_counts(keys, region, fetch) for region in REGIONS]
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    result = table(read(args.lajilista), fetch_json, date.today())
    args.out.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    total = sum(sum(map(sum, v)) for v in result["classes"].values())
    print(f"{len(result['classes'])} classes, {total} occurrences -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
