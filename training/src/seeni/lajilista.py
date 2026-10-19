"""Read and validate data-meta/lajilista.csv, the species list (phase 3, hard rules 5 and 8).

Run from training/:

    uv run python -m seeni.lajilista            # validate, taxonKeys may still be empty
    uv run python -m seeni.lajilista --strict   # also require every taxonKey (before #4)
"""

import argparse
import csv
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from seeni.paths import REPO_ROOT

LAJILISTA = REPO_ROOT / "data-meta" / "lajilista.csv"

COLUMNS = ["class_id", "tieteellinen", "nimi", "taxonKey", "ryhma", "kaksoisolennot", "in_model"]
OPTIONAL_COLUMNS = ["huomio"]

# Most cautious first: the order in which a group says not to eat (hard rule 8).
GROUPS = ["tappava", "myrkyllinen", "ei ruokasieni", "esikäsiteltävä", "syötävä"]
FOOD = {"syötävä", "esikäsiteltävä"}
DANGEROUS = {"tappava", "myrkyllinen", "esikäsiteltävä"}

UNKNOWN_CLASS = "muu"
CLASS_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


@dataclass(frozen=True)
class Row:
    line: int
    class_id: str
    tieteellinen: str
    nimi: str
    taxon_key: int | None
    ryhma: str
    kaksoisolennot: tuple[str, ...]
    in_model: bool
    huomio: str = ""

    @property
    def genus(self) -> str:
        return self.tieteellinen.split()[0]

    @property
    def is_genus(self) -> bool:
        return len(self.tieteellinen.split()) == 1


class LajilistaError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("\n".join(errors))
        self.errors = errors


def read(path: Path = LAJILISTA) -> list[Row]:
    """Parse the CSV. Raises LajilistaError for rows that cannot be parsed at all."""
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        missing = [c for c in COLUMNS if c not in header]
        unknown = [c for c in header if c not in COLUMNS + OPTIONAL_COLUMNS]
        if missing or unknown:
            raise LajilistaError(
                [
                    f"header: missing columns {missing}, unknown columns {unknown}, expected {COLUMNS}"
                ]
            )
        rows, errors = [], []
        for line, raw in enumerate(reader, start=2):
            if None in raw or any(v is None for v in raw.values()):
                errors.append(f"line {line}: wrong number of fields")
                continue
            raw = {k: v.strip() for k, v in raw.items()}
            key = raw["taxonKey"]
            if key and not key.isdigit():
                errors.append(f"line {line}: taxonKey {key!r} is not a positive integer")
                continue
            if raw["in_model"] not in ("true", "false"):
                errors.append(
                    f"line {line}: in_model must be true or false, got {raw['in_model']!r}"
                )
                continue
            rows.append(
                Row(
                    line=line,
                    class_id=raw["class_id"],
                    tieteellinen=" ".join(raw["tieteellinen"].split()),
                    nimi=raw["nimi"],
                    taxon_key=int(key) if key else None,
                    ryhma=raw["ryhma"],
                    kaksoisolennot=tuple(
                        s.strip() for s in raw["kaksoisolennot"].split(";") if s.strip()
                    ),
                    in_model=raw["in_model"] == "true",
                    huomio=raw.get("huomio", ""),
                )
            )
    if errors:
        raise LajilistaError(errors)
    return rows


def classes(rows: list[Row]) -> dict[str, list[Row]]:
    by_class: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        by_class[row.class_id].append(row)
    return dict(by_class)


def class_group(rows: list[Row]) -> str:
    """The most cautious group among a class's taxa (hard rule 8)."""
    return min((r.ryhma for r in rows), key=GROUPS.index)


def class_lookalikes(rows: list[Row]) -> list[str]:
    """Union of the class's rows' lookalikes, in first-seen order."""
    return list(dict.fromkeys(c for r in rows for c in r.kaksoisolennot))


def validate(rows: list[Row], require_keys: bool = False) -> tuple[list[str], list[str]]:
    """Return (errors, warnings). Errors break hard rules 5 or 8; warnings need a human look."""
    errors: list[str] = []
    warnings: list[str] = []
    by_class = classes(rows)

    for row in rows:
        at = f"line {row.line} ({row.tieteellinen or row.class_id})"
        if not CLASS_ID.match(row.class_id):
            errors.append(f"{at}: class_id {row.class_id!r} is not lowercase ASCII with hyphens")
        if row.class_id == UNKNOWN_CLASS:
            errors.append(f"{at}: {UNKNOWN_CLASS!r} is added by training and is not on the list")
        if not row.tieteellinen:
            errors.append(f"{at}: scientific name is empty")
        if row.ryhma not in GROUPS:
            errors.append(f"{at}: ryhma {row.ryhma!r} is not one of {GROUPS}")
        if row.taxon_key is None:
            (errors if require_keys else warnings).append(f"{at}: taxonKey is empty")
        if not row.nimi:
            warnings.append(f"{at}: Finnish name is empty")
        for other in row.kaksoisolennot:
            if other == row.class_id:
                errors.append(f"{at}: lists its own class as a lookalike")
            elif other not in by_class:
                errors.append(f"{at}: lookalike {other!r} is not a class_id on the list")
        if len(set(row.kaksoisolennot)) != len(row.kaksoisolennot):
            errors.append(f"{at}: lookalike listed twice")

    def duplicates(values):
        seen: dict = {}
        for row, value in values:
            if value in seen:
                errors.append(
                    f"line {row.line}: {value!r} is already on line {seen[value].line}; "
                    "a taxon belongs to one row and one class"
                )
            else:
                seen[value] = row

    duplicates((r, r.tieteellinen.lower()) for r in rows if r.tieteellinen)
    duplicates((r, r.taxon_key) for r in rows if r.taxon_key is not None)

    # Overlap through a genus: a genus row covers every species of that genus (hard rule 5).
    # The GBIF script checks the same against the real taxonomy, which names alone cannot.
    genus_rows = {r.genus.lower(): r for r in rows if r.is_genus}
    for row in rows:
        owner = genus_rows.get(row.genus.lower())
        if owner and owner is not row and owner.class_id != row.class_id:
            errors.append(
                f"line {row.line}: {row.tieteellinen} ({row.class_id}) overlaps genus "
                f"{owner.tieteellinen} ({owner.class_id}) on line {owner.line}"
            )

    for class_id, members in by_class.items():
        if len({r.in_model for r in members}) > 1:
            errors.append(f"class {class_id}: in_model differs between its rows")
        if any(r.ryhma not in GROUPS for r in members):
            continue
        group = class_group(members)
        lookalikes = class_lookalikes(members)
        if group in FOOD:
            dangerous = [
                c
                for c in lookalikes
                if c in by_class
                and all(r.ryhma in GROUPS for r in by_class[c])
                and class_group(by_class[c]) in DANGEROUS
            ]
            if not dangerous:
                warnings.append(
                    f"class {class_id}: food mushroom with no dangerous lookalike listed"
                )
        if group in DANGEROUS and not any(
            class_id in class_lookalikes(m) for m in by_class.values()
        ):
            warnings.append(f"class {class_id}: dangerous, but no class lists it as a lookalike")

    return errors, warnings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("path", nargs="?", type=Path, default=LAJILISTA)
    parser.add_argument("--strict", action="store_true", help="require every taxonKey")
    parser.add_argument("-q", "--quiet", action="store_true", help="do not print warnings")
    args = parser.parse_args(argv)

    try:
        rows = read(args.path)
        errors, warnings = validate(rows, require_keys=args.strict)
    except LajilistaError as e:
        errors, warnings, rows = e.errors, [], []
    if not args.quiet:
        for w in warnings:
            print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    n_classes = len(classes(rows))
    n_model = len({r.class_id for r in rows if r.in_model})
    print(
        f"{args.path.name}: {len(rows)} taxa, {n_classes} classes ({n_model} in model), "
        f"{len(errors)} errors, {len(warnings)} warnings"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
