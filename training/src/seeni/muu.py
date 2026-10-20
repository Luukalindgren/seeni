"""Collect images for the unknown class `muu` (phase 7, #7).

`muu` holds (a) a random sample of fungi that are not on the species list and (b)
non-mushrooms from the forest floor: mosses, conifers (cones, needles), heather and
berries, ferns, clubmosses, birch, oak and rose family leaves, grasses and slime moulds.
Same sources and rules as the species images: photographed human observations from FI, SE,
NO and EE, each image's own license CC0 or CC-BY (hard rule 1).

Run from training/ on the desktop (GBIF credentials as for seeni.gbif_download):

    uv run python -m seeni.muu request --dry-run   # print the request body
    uv run python -m seeni.muu request             # send it, remember the key
    uv run python -m seeni.muu fetch --wait        # archive to <data dir>/muu/gbif/, DOI to data-meta
    uv run python -m seeni.muu index               # sample images -> muu/candidates.parquet
    uv run python -m seeni.muu download            # fetch, resize, write muu/manifest.parquet
    uv run python -m seeni.muu dedup               # exclude duplicate photos, also across classes
    uv run python -m seeni.muu sheets              # contact sheets review/muu-*.jpg

Then `seeni.split` assigns the new observations and `seeni.train` trains them as `muu`.

The request leaves out every taxon on the species list and everything below it, and `index`
checks the taxon path again. Fungi count only when identified to species, because a
genus-level "Russula sp." may well be a listed species. The sample takes one image per
observation and goes round the species, so it covers as many species as it can.

Layout under the data directory, next to the species images (hard rule 2, never in git):

    muu/gbif/<key>.zip         the Darwin Core Archive (kept apart from gbif/, whose newest
                               archive is the species download)
    muu/candidates.parquet     images picked by `index`
    muu/images/<image>.jpg
    muu/manifest.parquet       one row per image under muu/images/, also the attribution list

exclude.csv is shared with the species images; files dropped from the manifest move to
unused/muu/.
"""

import argparse
import hashlib
import json
import random
import re
import sys
import time
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from seeni import gbif_download as gd
from seeni import gbif_images as gi
from seeni.lajilista import LAJILISTA, UNKNOWN_CLASS, LajilistaError, Row, read, validate
from seeni.paths import REPO_ROOT, data_dir

FUNGI = 5
# Non-mushrooms, as GBIF keys checked with the species/match API on 2026-10-20.
OTHER_TAXA = {
    35: "Bryophyta",
    194: "Pinopsida",
    2505: "Ericaceae",
    7228684: "Polypodiopsida",
    245: "Lycopodiopsida",
    4688: "Betulaceae",
    4689: "Fagaceae",
    5015: "Rosaceae",
    3073: "Poaceae",
    319: "Myxomycetes",
}
FUNGI_IMAGES = 4000
OTHER_IMAGES = 2000
PER_SPECIES = 4
SPECIES_RANKS = {"SPECIES", "SUBSPECIES", "VARIETY", "FORM"}
COLUMNS = [*gi.CANDIDATE_COLUMNS, "kind", "scientific_name"]


def muu_dir() -> Path:
    return data_dir() / "muu"


def archive_dir() -> Path:
    return muu_dir() / "gbif"


def listed_keys(rows: list[Row]) -> set[int]:
    return {r.taxon_key for r in rows if r.taxon_key is not None}


def predicate(rows: list[Row], countries: list[str]) -> dict:
    listed = sorted(listed_keys(rows))
    return {
        "type": "and",
        "predicates": [
            {"type": "in", "key": "TAXON_KEY", "values": [str(k) for k in [FUNGI, *OTHER_TAXA]]},
            # TAXON_KEY matches the taxon and everything below it, so this leaves out the
            # listed species and the genus classes' species.
            {
                "type": "not",
                "predicate": {"type": "in", "key": "TAXON_KEY", "values": [str(k) for k in listed]},
            },
            {"type": "in", "key": "COUNTRY", "values": countries},
            {"type": "equals", "key": "MEDIA_TYPE", "value": "StillImage"},
            {"type": "equals", "key": "BASIS_OF_RECORD", "value": "HUMAN_OBSERVATION"},
            {"type": "equals", "key": "OCCURRENCE_STATUS", "value": "PRESENT"},
            # Only narrows the archive: `index` still takes each image's own license.
            {"type": "in", "key": "LICENSE", "values": ["CC0_1_0", "CC_BY_4_0"]},
        ],
    }


def kind_of(occurrence: dict, listed: set[int]) -> tuple[str, int, str] | None:
    """("fungi" or "other", species key, name) for an occurrence muu may use, else None."""
    path = set()
    for field in gi.LINEAGE:
        value = occurrence.get(field, "").strip()
        if value.isdigit():
            path.add(int(value))
    if path & listed:
        return None
    species = occurrence.get("speciesKey", "").strip() or occurrence.get("taxonKey", "").strip()
    if not species.isdigit():
        return None
    name = occurrence.get("species", "").strip() or occurrence.get("scientificName", "").strip()
    if FUNGI in path:
        if occurrence.get("taxonRank", "").strip().upper() not in SPECIES_RANKS:
            return None
        return "fungi", int(species), name
    if path & set(OTHER_TAXA):
        return "other", int(species), name
    return None


def order(value: str) -> str:
    """A fixed pseudo-random order, so a re-run picks the same images."""
    return hashlib.sha1(f"muu:{value}".encode()).hexdigest()


def sample(by_species: dict[int, list[dict]], total: int, per_species: int) -> list[dict]:
    """Round-robin over the species in a fixed random order: every species gets its first
    observation before any gets a second, up to per_species each."""
    species = sorted(by_species, key=lambda s: order(str(s)))
    queues = {s: sorted(by_species[s], key=lambda c: order(str(c["gbifID"]))) for s in species}
    out = []
    for depth in range(per_species):
        for s in species:
            if len(out) >= total:
                return out
            if depth < len(queues[s]):
                out.append(queues[s][depth])
    return out


def index(
    archive_path: Path,
    rows: list[Row],
    exclude: dict[str, str],
    fungi: int = FUNGI_IMAGES,
    other: int = OTHER_IMAGES,
    per_species: int = PER_SPECIES,
) -> tuple[list[dict], dict[str, int]]:
    """Pick one licensed image per observation, then sample. Returns (candidates, stats)."""
    listed = listed_keys(rows)
    stats: dict[str, int] = defaultdict(int)
    occurrences: dict[int, tuple] = {}
    with zipfile.ZipFile(archive_path) as archive:
        for occ in gi.read_tsv(archive, "occurrence.txt"):
            found = kind_of(occ, listed)
            if found is None:
                stats["skipped_observations"] += 1
                continue
            stats[f"{found[0]}_observations"] += 1
            occurrences[int(occ["gbifID"])] = (
                *found,
                occ.get("countryCode", ""),
                occ.get("eventDate", ""),
                occ.get("datasetKey", ""),
            )
        first: dict[int, dict] = {}
        position: dict[int, int] = defaultdict(int)
        for media in gi.read_tsv(archive, "multimedia.txt"):
            gbif_id = int(media["gbifID"])
            if gbif_id not in occurrences or media.get("type", "") != "StillImage":
                continue
            n = position[gbif_id]
            position[gbif_id] += 1
            if gbif_id in first:
                continue
            url = media.get("identifier", "").strip()
            license_ = gi.normalize_license(media.get("license", ""))
            holder = media.get("rightsHolder", "").strip() or media.get("creator", "").strip()
            if license_ is None or not holder or not re.match(r"https?://", url):
                stats["rejected_images"] += 1
                continue
            image = gi.image_id(gbif_id, url)
            if image in exclude:
                stats["excluded_images"] += 1
                continue
            kind, species, name, country, event_date, dataset_key = occurrences[gbif_id]
            first[gbif_id] = {
                "path": f"muu/images/{image}.jpg",
                "image": image,
                "taxonKey": species,
                "class_id": UNKNOWN_CLASS,
                "gbifID": gbif_id,
                "n": n,
                "license": license_,
                "license_url": media.get("license", "").strip(),
                "rights_holder": holder,
                "creator": media.get("creator", "").strip(),
                "country": country,
                "event_date": event_date,
                "dataset_key": dataset_key,
                "url": url,
                "download_url": gi.download_url(url),
                "gbif_download": archive_path.stem,
                "kind": kind,
                "scientific_name": name,
            }
    candidates = []
    for kind, total in (("fungi", fungi), ("other", other)):
        by_species: dict[int, list[dict]] = defaultdict(list)
        for c in first.values():
            if c["kind"] == kind:
                by_species[c["taxonKey"]].append(c)
        picked = sample(by_species, total, per_species)
        stats[f"{kind}_species"] = len(by_species)
        stats[f"{kind}_selected"] = len(picked)
        stats[f"{kind}_selected_species"] = len({c["taxonKey"] for c in picked})
        candidates.extend(picked)
    candidates.sort(key=lambda c: c["path"])
    return candidates, dict(stats)


def build_manifest(root: Path) -> list[dict]:
    """muu/manifest.parquet: candidates on disk and not excluded. Other files under
    muu/images/ move to unused/muu/."""
    candidates = gi.read_table(root / "muu" / "candidates.parquet")
    exclude = gi.read_exclude(root / "exclude.csv")
    keep = [c for c in candidates if c["image"] not in exclude and (root / c["path"]).exists()]
    wanted = {c["path"] for c in keep}
    images = root / "muu" / "images"
    for file in sorted(images.iterdir()) if images.exists() else []:
        if file.is_file() and file.relative_to(root).as_posix() not in wanted:
            target = root / "unused" / "muu" / file.name
            target.parent.mkdir(parents=True, exist_ok=True)
            file.replace(target)
    gi.write_table(keep, root / "muu" / "manifest.parquet", COLUMNS)
    return keep


def read_manifests(root: Path | None = None) -> list[dict]:
    """The species manifest followed by the muu manifest, if there is one."""
    root = root or data_dir()
    rows = gi.read_table(root / "manifest.parquet")
    if (root / "muu" / "manifest.parquet").exists():
        rows += gi.read_table(root / "muu" / "manifest.parquet")
    return rows


# --- Commands ----------------------------------------------------------------------------


def checked_rows(path: Path) -> list[Row]:
    try:
        rows = read(path)
        errors, _ = validate(rows, require_keys=True)
    except LajilistaError as e:
        errors = e.errors
    if errors:
        raise SystemExit("lajilista.csv is not valid:\n" + "\n".join(errors))
    return rows


def cmd_request(args) -> int:
    rows = checked_rows(args.lajilista)
    if args.dry_run:
        body = {
            "creator": "<GBIF_USER>",
            "format": "DWCA",
            "predicate": predicate(rows, args.country),
        }
        print(json.dumps(body, indent=2))
        return 0
    user, password, email = gd.credentials()
    body = {"creator": user, "format": "DWCA", "predicate": predicate(rows, args.country)}
    if email:
        body["notificationAddresses"] = [email]
        body["sendNotification"] = True
    key = gd.send_request(body, user, password)
    archive_dir().mkdir(parents=True, exist_ok=True)
    (archive_dir() / "request.json").write_text(
        json.dumps({"key": key, "predicate": body["predicate"]}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"requested download {key}. Then run `fetch --wait`.")
    return 0


def cmd_fetch(args) -> int:
    path = archive_dir() / "request.json"
    if not args.key and not path.exists():
        raise SystemExit("no muu download requested yet: run `request` first or pass --key")
    key = args.key or json.loads(path.read_text(encoding="utf-8"))["key"]
    while True:
        meta = gd.status(key)
        state = meta.get("status", "?")
        if state in gd.FINISHED or state in gd.FAILED or not args.wait:
            break
        print(f"{key}: {state}, checking again in {args.interval} s", flush=True)
        time.sleep(args.interval)
    if state not in gd.FINISHED:
        print(f"{key}: {state}", file=sys.stderr)
        return 1
    dest = archive_dir() / f"{key}.zip"
    gd.download_zip(meta, dest)
    entry = gd.record_download(meta)
    print(f"{dest} ({meta.get('totalRecords')} occurrences)")
    print(f"DOI {entry['doi']} saved to {gd.DOWNLOAD_RECORD.relative_to(REPO_ROOT)}; commit it.")
    return 0


def latest_archive() -> Path:
    archives = sorted(archive_dir().glob("*.zip"), key=lambda p: p.stat().st_mtime)
    if not archives:
        raise SystemExit("no archive under <data dir>/muu/gbif; run `fetch`")
    return archives[-1]


def cmd_index(args) -> int:
    root = data_dir()
    rows = checked_rows(args.lajilista)
    archive = args.archive or latest_archive()
    candidates, stats = index(
        archive,
        rows,
        gi.read_exclude(root / "exclude.csv"),
        args.fungi,
        args.other,
        args.per_species,
    )
    muu_dir().mkdir(parents=True, exist_ok=True)
    gi.write_table(candidates, muu_dir() / "candidates.parquet", COLUMNS)
    for k, v in sorted(stats.items()):
        print(f"{k}\t{v}")
    print(f"{len(candidates)} images picked from {archive.name}")
    return 0


def cmd_download(args) -> int:
    root = data_dir()
    exclude = gi.read_exclude(root / "exclude.csv")
    candidates = [
        c for c in gi.read_table(muu_dir() / "candidates.parquet") if c["image"] not in exclude
    ]
    tried, failures = gi.download(candidates, root, workers=args.workers)
    manifest = build_manifest(root)
    print(f"{tried - len(failures)}/{tried} new images, {len(failures)} failed")
    print(f"muu manifest: {len(manifest)} images")
    return 0


def cmd_dedup(args) -> int:
    """Duplicates within muu, and photos that are both in muu and in a species class."""
    root = data_dir()
    manifest = read_manifests(root)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        hashes = pool.map(gi.hash_file, (root / m["path"] for m in manifest))
        by_image = {m["image"]: (h, m["class_id"]) for m, h in zip(manifest, hashes)}
    muu_images = {m["image"] for m in manifest if m["class_id"] == UNKNOWN_CLASS}
    found = [
        d for d in gi.duplicates(by_image) if d[0] not in gi.read_exclude(root / "exclude.csv")
    ]
    found = [d for d in found if d[0] in muu_images or d[1] == "duplicate across classes"]
    gi.append_exclude(root / "exclude.csv", found)
    species = sum(1 for image, _ in found if image not in muu_images)
    if species:
        gi.build_manifest(root)
    muu = build_manifest(root)
    print(f"excluded {len(found)} duplicates ({species} species images); muu: {len(muu)} images")
    return 0


def cmd_sheets(args) -> int:
    root = data_dir()
    manifest = gi.read_table(muu_dir() / "manifest.parquet")
    out = root / "review"
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    for kind in ("fungi", "other"):
        items = [m for m in manifest if m["kind"] == kind]
        for page in range(args.pages):
            pick = sorted(rng.sample(items, min(args.sample, len(items))), key=lambda m: m["path"])
            sheet = gi.contact_sheet([root / m["path"] for m in pick], [m["image"] for m in pick])
            sheet.save(out / f"muu-{kind}-{page + 1}.jpg", quality=85)
    print(f"sheets in {out}. Add bad images to exclude.csv and run `download` again.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("request", help="send the download request")
    p.add_argument("--country", nargs="+", default=gd.COUNTRIES)
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_request)
    p = sub.add_parser("fetch", help="download the archive once GBIF has prepared it")
    p.add_argument("--key")
    p.add_argument("--wait", action="store_true")
    p.add_argument("--interval", type=int, default=120)
    p.set_defaults(func=cmd_fetch)
    p = sub.add_parser("index", help="sample licensed images from the archive")
    p.add_argument("--archive", type=Path)
    p.add_argument("--fungi", type=int, default=FUNGI_IMAGES)
    p.add_argument("--other", type=int, default=OTHER_IMAGES)
    p.add_argument("--per-species", type=int, default=PER_SPECIES)
    p.set_defaults(func=cmd_index)
    p = sub.add_parser("download", help="fetch and resize images, write the muu manifest")
    p.add_argument("--workers", type=int, default=gi.WORKERS)
    p.set_defaults(func=cmd_download)
    p = sub.add_parser("dedup", help="exclude duplicate photos")
    p.add_argument("--workers", type=int, default=gi.WORKERS)
    p.set_defaults(func=cmd_dedup)
    p = sub.add_parser("sheets", help="contact sheets for review")
    p.add_argument("--sample", type=int, default=100)
    p.add_argument("--pages", type=int, default=2)
    p.add_argument("--seed", type=int, default=0)
    p.set_defaults(func=cmd_sheets)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
