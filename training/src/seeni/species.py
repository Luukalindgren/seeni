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

species.en.json holds the English texts (#52): per record id its `nimi` and `tuntomerkit`,
per check id its `kysymys` and, under each Finnish answer key, the English answer. The keys
stay the logic, so `check` requires the translation to cover exactly the records and checks.
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
SPECIES_EN = REPO_ROOT / "species" / "species.en.json"
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
# Text the app shows must never state edibility (hard rule 8). web/tests/flow.test.ts uses
# the same pattern for the result texts.
# The English part leaves out a plain "eat", which the warnings need.
EDIBLE = re.compile(
    r"syötäv|syödä|syöd|ruokasien|herkullinen|maukas"
    r"|edib|eaten|eatable|culinary|\bchoice\b|delicious|tasty|food mushroom|good to eat|safe to eat",
    re.IGNORECASE,
)
# Checks on features a beginner can see reliably. Only these may rule out a dangerous class
# (tappava, myrkyllinen, esikäsiteltävä); in every other check a dangerous class that the
# check mentions is listed under every answer (species/README.md).
RELIABLE_CHECKS = {"alapinta", "itiopoly", "maitiaisneste", "halkaisu"}


def derived(members: list[Row]) -> dict:
    return {
        "id": members[0].class_id,
        "taxonKeys": sorted({r.taxon_key for r in members if r.taxon_key is not None}),
        "ryhma": class_group(members),
        "kaksoisolennot": class_lookalikes(members),
    }


def sync(records: list[dict], rows: list[Row]) -> list[dict]:
    """Records for every class of the list, in list order, derived fields refreshed.
    Refuses to drop a record whose class is no longer on the list, since its hand-written
    content and review would be lost: rename or remove it by hand."""
    by_id = {r["id"]: r for r in records}
    orphans = sorted(set(by_id) - set(classes(rows)))
    if orphans:
        raise SystemExit(f"records for classes not on the list: {orphans}; move or delete them")
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
    yield record.get("nimi", "")
    yield record.get("tieteellinen", "")
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
    classes_group = {c: class_group(m) for c, m in by_class.items()}
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
            if not any(mentioned - set(fits) for fits in answers.values()):
                errors.append(f"{at}: check {cid} can never rule anything out")
            if cid not in RELIABLE_CHECKS:
                group = {x: classes_group.get(x) for x in mentioned}
                for answer, fits in answers.items():
                    for x in sorted(m for m in mentioned - set(fits) if group[m] in DANGEROUS):
                        errors.append(
                            f"{at}: check {cid} answer {answer!r} rules out the dangerous {x}, "
                            "but the check is not a reliable one"
                        )
            if cid in seen_checks and seen_checks[cid] != c:
                errors.append(f"{at}: check {cid} differs from the one with the same id elsewhere")
            seen_checks.setdefault(cid, c)
        for text in texts(r):
            if EDIBLE.search(text):
                errors.append(f"{at}: text states edibility: {text!r}")
    return errors


def check_translation(records: list[dict], en: dict) -> list[str]:
    """Problems in species.en.json: a missing or extra record or check, a missing answer, a
    feature list of another length, or English text that states edibility."""
    errors = []
    tr_records = en.get("records", {})
    tr_checks = en.get("checks", {})
    checks: dict[str, dict] = {}
    for r in records:
        rid = r["id"]
        tr = tr_records.get(rid)
        if not tr or not tr.get("nimi"):
            errors.append(f"{rid}: no English name in species.en.json")
            continue
        if len(tr.get("tuntomerkit", [])) != len(r.get("tuntomerkit", [])):
            errors.append(f"{rid}: English features differ in number from the Finnish")
        for text in [tr["nimi"], *tr.get("tuntomerkit", [])]:
            if EDIBLE.search(text):
                errors.append(f"{rid}: English text states edibility: {text!r}")
        for c in r.get("tarkistukset", []):
            checks.setdefault(c["id"], c)
    for rid in sorted(set(tr_records) - {r["id"] for r in records}):
        errors.append(f"{rid}: in species.en.json but has no record")
    for cid, c in checks.items():
        tr = tr_checks.get(cid)
        if not tr or not tr.get("kysymys"):
            errors.append(f"check {cid}: no English question in species.en.json")
            continue
        answers = tr.get("vastaukset", {})
        if set(answers) != set(c.get("vastaukset", {})):
            errors.append(f"check {cid}: English answers must have exactly the Finnish answer keys")
        for text in [tr["kysymys"], *answers.values()]:
            if not text or EDIBLE.search(text):
                errors.append(f"check {cid}: English text is empty or states edibility: {text!r}")
    for cid in sorted(set(tr_checks) - set(checks)):
        errors.append(f"check {cid}: in species.en.json but no record has it")
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
    parser.add_argument("--species-en", type=Path, default=SPECIES_EN)
    args = parser.parse_args(argv)
    rows = read(args.lajilista)
    records = load(args.species)
    if args.command == "sync":
        records = sync(records, rows)
        save(records, args.species)
    errors = check(records, rows)
    if args.species_en.exists():
        errors += check_translation(
            records, json.loads(args.species_en.read_text(encoding="utf-8"))
        )
    else:
        errors.append(f"{args.species_en} is missing")
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    drafts = sum(1 for r in records if not r.get("tarkistanut"))
    print(f"{len(records)} records, {drafts} drafts without expert review, {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
