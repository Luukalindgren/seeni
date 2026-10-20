"""Keep species/species.json in step with the species list, and validate it (phase 9, #9).

    uv run python -m seeni.species sync    # fill the fields that come from lajilista.csv
    uv run python -m seeni.species check   # validate; CI runs the same check in pytest

species.json is a list of records, one per class id, in lajilista order. `sync` writes the
fields that follow from lajilista.csv: `id`, `taxonKeys`, `ryhma` (the merged group, hard
rule 8), `kaksoisolennot` (the union of the rows' lookalikes) and, when a record has none,
`tieteellinen` and `nimi` from the class's first row. The hand-written fields stay as they
are: `tuntomerkit`, `tarkistukset`, `lahteet`, `tarkistanut`, and `nimi` or `tieteellinen`
when they are set by hand (an aggregate is "herkkutatit", not its first row's name).

A record whose class is not in the model (`in_model` false) is a warning-only record. `muu`
has no record. Every record is a draft until an expert fills `tarkistanut`.

A check (`tarkistukset`) may appear in several records under the same `id`; then it must be
the same check everywhere, since the app asks it once.
"""

import argparse
import json
import re
import sys
from pathlib import Path

from seeni.lajilista import (
    DANGEROUS,
    GROUPS,
    LAJILISTA,
    UNKNOWN_CLASS,
    Row,
    class_group,
    class_lookalikes,
    classes,
    read,
)
from seeni.paths import REPO_ROOT

SPECIES = REPO_ROOT / "species" / "species.json"
FIELDS = [
    "id",
    "taxonKeys",
    "tieteellinen",
    "nimi",
    "ryhma",
    "tuntomerkit",
    "kaksoisolennot",
    "tarkistukset",
    "lahteet",
    "tarkistanut",
]
CHECK_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
# Text the app shows must never state edibility (hard rule 8).
EDIBLE = re.compile(r"syötäv|syödä|syöd|ruokasien|herkullinen|maukas", re.IGNORECASE)


def derived(members: list[Row]) -> dict:
    return {
        "id": members[0].class_id,
        "taxonKeys": sorted({r.taxon_key for r in members if r.taxon_key is not None}),
        "ryhma": class_group(members),
        "kaksoisolennot": class_lookalikes(members),
    }


def sync(records: list[dict], rows: list[Row]) -> list[dict]:
    """Records for every class of the list, in list order, derived fields refreshed."""
    by_id = {r["id"]: r for r in records}
    out = []
    for class_id, members in classes(rows).items():
        old = by_id.get(class_id, {})
        record = {
            "tuntomerkit": [],
            "tarkistukset": [],
            "lahteet": [],
            "tarkistanut": "",
            **old,
            **derived(members),
        }
        record.setdefault("tieteellinen", members[0].tieteellinen)
        record.setdefault("nimi", members[0].nimi)
        out.append({k: record[k] for k in FIELDS})
    return out


def texts(record: dict):
    """Every string of a record that the app shows to the user."""
    yield from record.get("tuntomerkit", [])
    for c in record.get("tarkistukset", []):
        yield c.get("kysymys", "")
        yield from c.get("vastaukset", {})


def check(records: list[dict], rows: list[Row]) -> list[str]:
    errors = []
    by_class = classes(rows)
    in_model = {c for c, m in by_class.items() if m[0].in_model}
    ids = [r.get("id") for r in records]
    known = set(ids)
    if len(ids) != len(known):
        errors.append("a class id has two records")
    for c in sorted(in_model - known):
        errors.append(f"{c}: model class has no record")
    if UNKNOWN_CLASS in known:
        errors.append(f"{UNKNOWN_CLASS} must not have a record")
    seen_checks: dict[str, dict] = {}
    listed_by_model = {x for c in in_model for x in class_lookalikes(by_class[c])}
    for r in records:
        rid = r.get("id")
        at = f"{rid}"
        if rid not in by_class:
            errors.append(f"{at}: not a class_id in lajilista.csv")
            continue
        if list(r) != FIELDS:
            errors.append(f"{at}: fields must be {FIELDS}, in that order")
        expected = derived(by_class[rid])
        for k, v in expected.items():
            if r.get(k) != v:
                errors.append(f"{at}: {k} is {r.get(k)!r}, lajilista gives {v!r}; run sync")
        if r.get("ryhma") not in GROUPS:
            errors.append(f"{at}: ryhma {r.get('ryhma')!r} is not one of {GROUPS}")
        for x in r.get("kaksoisolennot", []):
            if x not in known:
                errors.append(f"{at}: lookalike {x} has no record")
        if rid not in in_model:
            if r.get("ryhma") not in DANGEROUS:
                errors.append(f"{at}: warning-only record but not a dangerous lookalike")
            if rid not in listed_by_model:
                errors.append(f"{at}: warning-only record that no model class lists as a lookalike")
        if not isinstance(r.get("tarkistanut"), str):
            errors.append(f"{at}: tarkistanut must be a string (empty for a draft)")
        for c in r.get("tarkistukset", []):
            cid = c.get("id", "")
            if not CHECK_ID.match(cid):
                errors.append(f"{at}: check id {cid!r} is not lowercase with hyphens")
            answers = c.get("vastaukset", {})
            if len(answers) < 2:
                errors.append(f"{at}: check {cid} needs at least two answers")
            mentioned = set()
            for answer, fits in answers.items():
                if not fits:
                    errors.append(f"{at}: check {cid} answer {answer!r} lists no class")
                for x in fits:
                    if x not in known:
                        errors.append(f"{at}: check {cid} answer {answer!r}: {x} has no record")
                mentioned.update(fits)
            if rid not in mentioned:
                errors.append(f"{at}: check {cid} does not mention its own class")
            if cid in seen_checks and seen_checks[cid] != c:
                errors.append(f"{at}: check {cid} differs from the one with the same id elsewhere")
            seen_checks.setdefault(cid, c)
        for text in texts(r):
            if EDIBLE.search(text):
                errors.append(f"{at}: text states edibility: {text!r}")
    return errors


def load(path: Path = SPECIES) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def save(records: list[dict], path: Path = SPECIES) -> None:
    path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=["sync", "check"])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    parser.add_argument("--species", type=Path, default=SPECIES)
    args = parser.parse_args(argv)
    rows = read(args.lajilista)
    records = load(args.species)
    if args.command == "sync":
        records = sync(records, rows)
        save(records, args.species)
    errors = check(records, rows)
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    drafts = sum(1 for r in records if not r.get("tarkistanut"))
    print(f"{len(records)} records, {drafts} drafts without expert review, {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
