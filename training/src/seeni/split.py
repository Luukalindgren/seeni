"""Split the manifest into train / val / test by observation (phase 5, #5, hard rule 3).

Run from training/ on the desktop, after the phase 4 manifest is final:

    uv run python -m seeni.split          # write or extend data-meta/split.csv
    uv run python -m seeni.split --check  # fail if split.csv is missing an observation

Every image of an observation (gbifID) lands in the same set, so photos of one specimen
never end up on both sides. The split is stratified by class: within each class the
observations are taken in a fixed pseudo-random order (from the seed) and each one goes to
the set that is furthest below its share of 80 / 10 / 10. A class with at least three
observations always gets one in val and one in test.

An observation keeps its set once it is in split.csv. A later download only adds new
observations, so a test image never moves into training. Observations that are no longer
in the manifest stay in the file; nothing reads them.
"""

import argparse
import csv
import hashlib
import sys
from collections import Counter, defaultdict
from pathlib import Path

from seeni.gbif_images import read_table
from seeni.paths import REPO_ROOT, data_dir

SPLIT = REPO_ROOT / "data-meta" / "split.csv"
SETS = {"train": 0.8, "val": 0.1, "test": 0.1}
SEED = 0
MIN_OBSERVATIONS = 3


def order(gbif_id: int, seed: int = SEED) -> str:
    return hashlib.sha256(f"{seed}:{gbif_id}".encode()).hexdigest()


def observations(manifest: list[dict]) -> dict[int, str]:
    """gbifID -> class_id. Raises ValueError if one observation is in two classes."""
    out: dict[int, str] = {}
    for m in manifest:
        gbif_id, class_id = int(m["gbifID"]), m["class_id"]
        if out.setdefault(gbif_id, class_id) != class_id:
            raise ValueError(f"gbifID {gbif_id} is in {out[gbif_id]} and {class_id}")
    return out


def assign(
    obs: dict[int, str], existing: dict[int, tuple[str, str]], seed: int = SEED
) -> dict[int, tuple[str, str]]:
    """gbifID -> (class_id, set) for every observation, keeping the sets in `existing`."""
    result = dict(existing)
    by_class: dict[str, list[int]] = defaultdict(list)
    for gbif_id, class_id in obs.items():
        if gbif_id in existing:
            if existing[gbif_id][0] != class_id:
                raise ValueError(
                    f"gbifID {gbif_id} is {existing[gbif_id][0]} in split.csv but {class_id} "
                    "in the manifest; a class whose taxa change gets a new id (hard rule 5)"
                )
        else:
            by_class[class_id].append(gbif_id)
    current = Counter((c, s) for g, (c, s) in existing.items() if obs.get(g) == c)
    total = Counter(obs.values())
    names = list(SETS)

    def target(s: str, n: int) -> float:
        # A class with at least MIN_OBSERVATIONS gets one val and one test observation.
        if s != "train" and n >= MIN_OBSERVATIONS:
            return max(SETS[s] * n, 1)
        return SETS[s] * n

    for class_id, new in sorted(by_class.items()):
        n = total[class_id]
        for gbif_id in sorted(new, key=lambda g: order(g, seed)):
            # Furthest below its target; ties go to the smaller set (test, then val).
            best = max(names, key=lambda s: (target(s, n) - current[class_id, s], names.index(s)))
            current[class_id, best] += 1
            result[gbif_id] = (class_id, best)
    return result


def read_split(path: Path = SPLIT) -> dict[int, tuple[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        return {int(r["gbifID"]): (r["class_id"], r["split"]) for r in csv.DictReader(f)}


def write_split(split: dict[int, tuple[str, str]], path: Path = SPLIT) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["gbifID", "class_id", "split"])
        for gbif_id in sorted(split):
            writer.writerow([gbif_id, *split[gbif_id]])


def summary(manifest: list[dict], split: dict[int, tuple[str, str]]) -> list[str]:
    obs, images = Counter(), Counter()
    seen = set()
    for m in manifest:
        gbif_id = int(m["gbifID"])
        s = split[gbif_id][1]
        images[s] += 1
        if gbif_id not in seen:
            seen.add(gbif_id)
            obs[s] += 1
    return [f"{s}: {obs[s]} observations, {images[s]} images" for s in SETS]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--check", action="store_true", help="only check split.csv")
    args = parser.parse_args(argv)
    manifest = read_table(data_dir() / "manifest.parquet")
    obs = observations(manifest)
    existing = read_split()
    missing = [g for g in obs if g not in existing]
    if args.check:
        if missing:
            print(f"{len(missing)} observations are not in {SPLIT.name}; run seeni.split")
            return 1
        print("\n".join(summary(manifest, existing)))
        return 0
    split = assign(obs, existing, args.seed)
    write_split(split)
    print(f"{len(missing)} new observations assigned, {len(split)} in {SPLIT.name}")
    print("\n".join(summary(manifest, split)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
