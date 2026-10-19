"""Look up GBIF taxonKeys for data-meta/lajilista.csv and write a report to check by hand.

Needs api.gbif.org, so run it on the desktop, not in a cloud session. Run from training/:

    uv run python -m seeni.gbif_match                 # report only
    uv run python -m seeni.gbif_match --fill          # also fill empty, unambiguous taxonKeys

The report (CSV, default ~/seeni-data/lajilista_gbif.csv) has one row per taxon with the
GBIF match, the proposed key, GBIF's Finnish vernacular names and a `flags` column. Every
row must still be checked by hand (phase 3, step 2); --fill never overwrites a key and only
fills rows whose match is exact, accepted and of the expected rank.
"""

import argparse
import csv
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

from seeni.lajilista import LAJILISTA, LajilistaError, Row, read, validate
from seeni.paths import data_dir

API = "https://api.gbif.org/v1"
USER_AGENT = "seeni-species-list (+https://github.com/Luukalindgren/seeni)"
LINEAGE = ["kingdomKey", "phylumKey", "classKey", "orderKey", "familyKey", "genusKey", "speciesKey"]

REPORT_COLUMNS = [
    "line",
    "class_id",
    "tieteellinen",
    "nimi",
    "taxonKey",
    "proposed_key",
    "matchType",
    "status",
    "confidence",
    "gbif_name",
    "gbif_rank",
    "accepted_name",
    "family",
    "gbif_nimet",
    "flags",
]

Fetch = Callable[[str, dict], dict | list]


def fetch_json(path: str, params: dict) -> dict | list:
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500 or attempt == 3:
                raise
        except OSError:
            if attempt == 3:
                raise
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def expected_rank(row: Row) -> str:
    return "GENUS" if row.is_genus else "SPECIES"


def match(row: Row, fetch: Fetch) -> dict:
    return fetch(
        "species/match",
        {
            "name": row.tieteellinen,
            "kingdom": "Fungi",
            "rank": expected_rank(row),
            "strict": "true",
        },
    )


def proposed_key(m: dict) -> int | None:
    """The accepted taxon's key: a synonym's key would miss most occurrences in the download."""
    if m.get("matchType") in (None, "NONE"):
        return None
    return m.get("acceptedUsageKey") or m.get("usageKey")


def finnish_names(key: int, fetch: Fetch) -> list[str]:
    data = fetch(f"species/{key}/vernacularNames", {"limit": 300})
    return sorted(
        {
            v["vernacularName"].strip().lower()
            for v in data.get("results", [])
            if v.get("vernacularName") and v.get("language") in ("fin", "fi")
        }
    )


def assess(row: Row, m: dict, fi_names: list[str]) -> list[str]:
    """Reasons a human must look at this row. An empty list still needs a quick check."""
    flags = []
    key = proposed_key(m)
    if key is None:
        return ["no-match"]
    if m.get("matchType") != "EXACT":
        flags.append(f"match-{m.get('matchType', '?').lower()}")
    if m.get("status") != "ACCEPTED":
        flags.append(f"status-{m.get('status', '?').lower()}")
    if m.get("rank") != expected_rank(row):
        flags.append(f"rank-{m.get('rank', '?').lower()}")
    if m.get("kingdom") != "Fungi":
        flags.append("not-fungi")
    if row.taxon_key is not None and row.taxon_key != key:
        flags.append("key-differs")
    if row.nimi and fi_names and row.nimi.lower() not in fi_names:
        flags.append("nimi-differs")
    return flags


def overlaps(rows: list[Row], matches: dict[int, dict]) -> dict[int, list[str]]:
    """Rows whose GBIF lineage contains another class's taxon (hard rule 5)."""
    key_owner = {}
    for row in rows:
        m = matches.get(row.line, {})
        # A match that fell back to a higher rank or a fuzzy name does not own its key.
        clean = m.get("matchType") == "EXACT" and m.get("rank") == expected_rank(row)
        key = row.taxon_key or (proposed_key(m) if clean else None)
        if key:
            key_owner[key] = row
    found: dict[int, list[str]] = {}
    for row in rows:
        m = matches.get(row.line, {})
        own = proposed_key(m)
        for field in LINEAGE:
            owner = key_owner.get(m.get(field))
            if owner and m.get(field) != own and owner.class_id != row.class_id:
                found.setdefault(row.line, []).append(f"inside-{owner.class_id}")
    return found


def run(rows: list[Row], fetch: Fetch, pause: float = 0.2) -> list[dict]:
    matches, report = {}, []
    for row in rows:
        m = match(row, fetch)
        matches[row.line] = m
        key = proposed_key(m)
        fi = finnish_names(key, fetch) if key else []
        report.append(
            {
                "line": row.line,
                "class_id": row.class_id,
                "tieteellinen": row.tieteellinen,
                "nimi": row.nimi,
                "taxonKey": row.taxon_key or "",
                "proposed_key": key or "",
                "matchType": m.get("matchType", ""),
                "status": m.get("status", ""),
                "confidence": m.get("confidence", ""),
                "gbif_name": m.get("scientificName", ""),
                "gbif_rank": m.get("rank", ""),
                "accepted_name": m.get("accepted", ""),
                "family": m.get("family", ""),
                "gbif_nimet": "; ".join(fi),
                "flags": assess(row, m, fi),
            }
        )
        time.sleep(pause)
    by_line = {r["line"]: r for r in report}
    for line, extra in overlaps(rows, matches).items():
        by_line[line]["flags"].extend(extra)
    by_key: dict[int, list[dict]] = {}
    for r in report:
        if r["proposed_key"]:
            by_key.setdefault(r["proposed_key"], []).append(r)
    for same in by_key.values():
        if len(same) > 1:
            for r in same:
                r["flags"].append("duplicate-key")
    for r in report:
        r["flags"] = "; ".join(r["flags"])
    return report


def fill_keys(path: Path, report: list[dict]) -> int:
    """Write proposed keys into empty taxonKey cells of rows that have no flags.

    Only the filled lines are rewritten, so the rest of the file keeps its formatting.
    """
    fill = {r["line"]: r for r in report if not r["flags"] and not r["taxonKey"]}
    if not fill:
        return 0
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    header = next(csv.reader([lines[0]]))
    key_col, name_col = header.index("taxonKey"), header.index("tieteellinen")
    filled = 0
    for line, r in fill.items():
        text = lines[line - 1]
        fields = next(csv.reader([text]))
        # Skip anything that is not a whole one-line record of the same taxon.
        if (
            len(fields) != len(header)
            or " ".join(fields[name_col].split()) != r["tieteellinen"]
            or fields[key_col].strip()
        ):
            continue
        fields[key_col] = str(r["proposed_key"])
        out = io.StringIO()
        ending = text[len(text.rstrip("\r\n")) :]
        csv.writer(out, lineterminator=ending).writerow(fields)
        lines[line - 1] = out.getvalue()
        filled += 1
    path.write_text("".join(lines), encoding="utf-8")
    return filled


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    parser.add_argument("--report", type=Path, help="default: <data dir>/lajilista_gbif.csv")
    parser.add_argument("--fill", action="store_true", help="fill empty, unflagged taxonKeys")
    args = parser.parse_args(argv)

    try:
        rows = read(args.lajilista)
        errors, _ = validate(rows)
    except LajilistaError as e:
        errors = e.errors
    if errors:
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        print("fix the list first: uv run python -m seeni.lajilista", file=sys.stderr)
        return 1
    report = run(rows, fetch_json)
    out = args.report or data_dir() / "lajilista_gbif.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=REPORT_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(report)

    flagged = [r for r in report if r["flags"]]
    for r in flagged:
        print(f"line {r['line']}: {r['tieteellinen']}: {r['flags']}")
    print(f"{len(report)} taxa, {len(flagged)} flagged. Report: {out}")
    if args.fill:
        print(f"filled {fill_keys(args.lajilista, report)} taxonKeys in {args.lajilista}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
