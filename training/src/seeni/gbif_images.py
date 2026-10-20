"""Turn the GBIF download into licensed, resized images and a manifest (phase 4, #4).

Run from training/ on the desktop, after `seeni.gbif_download fetch`:

    uv run python -m seeni.gbif_images index      # pick images: license, caps -> candidates
    uv run python -m seeni.gbif_images download   # fetch, resize, write manifest.parquet
    uv run python -m seeni.gbif_images dedup      # exclude duplicate photos (perceptual hash)
    uv run python -m seeni.gbif_images sheets     # contact sheets to browse every class
    uv run python -m seeni.gbif_images report     # images per class against the target

Every step can be re-run. `download` skips images that are already on disk.

Licenses (hard rule 1): each image's own license comes from the archive's multimedia.txt,
never from the occurrence. Only CC0 and CC-BY are kept, and an image needs a rights holder.

Layout under the data directory (hard rule 2, never in git):

    gbif/<key>.zip           the Darwin Core Archive
    candidates.parquet       images picked by `index`
    images/<taxonKey>/<gbifID>_<n>.jpg
    manifest.parquet         one row per image under images/, also the attribution list
    exclude.csv              gbifID,n,reason: images to leave out (duplicates, microscope
                             shots, spore prints, drawings). Add rows by hand after `sheets`.
    unused/                  files moved out of images/ because they are excluded or no
                             longer picked
    review/<class_id>.jpg    contact sheets from `sheets`

<taxonKey> is the species list row's key, not the occurrence's own key: an occurrence
belongs to the row whose key is in its taxon path, which matters for genus-level classes.
"""

import argparse
import csv
import hashlib
import io
import random
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from collections import Counter, defaultdict
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from PIL import Image, ImageDraw, ImageOps

from seeni.gbif_download import gbif_dir, user_agent
from seeni.lajilista import LAJILISTA, Row, read
from seeni.paths import data_dir

SHORT_SIDE = 512
PER_TAXON = 1500
PER_OBSERVATION = 3
TARGET_PER_CLASS = 100
WORKERS = 8

# Occurrence fields that can hold a species list row's key: the taxon path (#4 step 4).
LINEAGE = [
    "taxonKey",
    "acceptedTaxonKey",
    "speciesKey",
    "genusKey",
    "familyKey",
    "orderKey",
    "classKey",
    "phylumKey",
    "kingdomKey",
]

CANDIDATE_COLUMNS = [
    "path",
    "taxonKey",
    "class_id",
    "gbifID",
    "n",
    "license",
    "license_url",
    "rights_holder",
    "creator",
    "country",
    "event_date",
    "dataset_key",
    "url",
    "download_url",
    "gbif_download",
]

Get = Callable[[str], bytes]


# --- Licenses and URLs -------------------------------------------------------------------


def normalize_license(raw: str) -> str | None:
    """CC0-1.0 or CC-BY[-version] for an allowed license, None for anything else.

    GBIF archives hold license URLs (http://creativecommons.org/licenses/by/4.0/), codes
    (CC_BY_4_0, CC0_1_0) and free text (CC BY 4.0). NC, ND, SA, the Public Domain Mark and
    "all rights reserved" are all rejected.
    """
    s = raw.strip().lower()
    s = re.sub(r"^https?://", "", s).removeprefix("www.").rstrip("/")
    if re.fullmatch(r"creativecommons\.org/publicdomain/zero/1\.0(/.*)?", s):
        return "CC0-1.0"
    if re.fullmatch(r"cc[-_ ]?0([-_ ]1[._]0)?", s):
        return "CC0-1.0"
    m = re.fullmatch(r"creativecommons\.org/licenses/by/(\d\.\d)(/.*)?", s)
    if m:
        return f"CC-BY-{m.group(1)}"
    m = re.fullmatch(r"cc[-_ ]by(?:[-_ ](\d)[._](\d))?", s)
    if m:
        return f"CC-BY-{m.group(1)}.{m.group(2)}" if m.group(1) else "CC-BY"
    return None


def download_url(url: str) -> str:
    """iNaturalist serves originals of several MB; `large` is about 1024 px, enough for 512."""
    if re.match(
        r"https?://(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)/", url
    ):
        return re.sub(r"/original(\.\w+)$", r"/large\1", url)
    return url


# --- Index: archive -> candidates --------------------------------------------------------


def read_tsv(archive: zipfile.ZipFile, name: str) -> Iterator[dict]:
    csv.field_size_limit(sys.maxsize)
    with archive.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
        yield from csv.DictReader(text, delimiter="\t", quoting=csv.QUOTE_NONE)


def row_for(occurrence: dict, by_key: dict[int, Row]) -> Row | None | str:
    """The species list row whose key is in the occurrence's taxon path.

    Returns None for no match and "ambiguous" when rows of different classes match, which
    the species list validation should make impossible.
    """
    found = {}
    for field in LINEAGE:
        value = occurrence.get(field, "").strip()
        if value.isdigit() and int(value) in by_key:
            row = by_key[int(value)]
            found[row.class_id] = found.get(row.class_id, row)
    if not found:
        return None
    if len(found) > 1:
        return "ambiguous"
    return next(iter(found.values()))


def read_exclude(path: Path) -> dict[tuple[int, int], str]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as f:
        return {(int(r["gbifID"]), int(r["n"])): r["reason"] for r in csv.DictReader(f)}


def append_exclude(path: Path, rows: list[tuple[int, int, str]]) -> None:
    new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        if new:
            writer.writerow(["gbifID", "n", "reason"])
        writer.writerows(rows)


def observation_order(gbif_id: int) -> str:
    """A fixed pseudo-random order, so a re-run picks the same observations."""
    return hashlib.sha1(str(gbif_id).encode()).hexdigest()


def index(
    archive_path: Path,
    rows: list[Row],
    exclude: dict[tuple[int, int], str],
    per_taxon: int = PER_TAXON,
    per_observation: int = PER_OBSERVATION,
) -> tuple[list[dict], dict[str, Counter]]:
    """Pick images from the archive. Returns (candidates, per-class counts of each stage)."""
    by_key = {r.taxon_key: r for r in rows if r.taxon_key is not None}
    stats: dict[str, Counter] = defaultdict(Counter)
    occurrences: dict[int, tuple[Row, dict]] = {}
    with zipfile.ZipFile(archive_path) as archive:
        for occ in read_tsv(archive, "occurrence.txt"):
            row = row_for(occ, by_key)
            if row is None:
                continue
            if row == "ambiguous":
                stats["?"]["ambiguous_taxon"] += 1
                continue
            stats[row.class_id]["observations"] += 1
            occurrences[int(occ["gbifID"])] = (row, occ)

        images: dict[int, list[dict]] = defaultdict(list)
        position: Counter = Counter()
        for media in read_tsv(archive, "multimedia.txt"):
            gbif_id = int(media["gbifID"])
            if gbif_id not in occurrences or media.get("type", "") != "StillImage":
                continue
            n = position[gbif_id]
            position[gbif_id] += 1
            row, occ = occurrences[gbif_id]
            counts = stats[row.class_id]
            counts["images"] += 1
            url = media.get("identifier", "").strip()
            license_ = normalize_license(media.get("license", ""))
            holder = media.get("rightsHolder", "").strip() or media.get("creator", "").strip()
            if license_ is None:
                counts["rejected_license"] += 1
                continue
            if not holder:
                counts["rejected_no_rights_holder"] += 1
                continue
            if not re.match(r"https?://", url):
                counts["rejected_no_url"] += 1
                continue
            if (gbif_id, n) in exclude:
                counts["excluded"] += 1
                continue
            images[gbif_id].append(
                {
                    "path": f"images/{row.taxon_key}/{gbif_id}_{n}.jpg",
                    "taxonKey": row.taxon_key,
                    "class_id": row.class_id,
                    "gbifID": gbif_id,
                    "n": n,
                    "license": license_,
                    "license_url": media.get("license", "").strip(),
                    "rights_holder": holder,
                    "creator": media.get("creator", "").strip(),
                    "country": occ.get("countryCode", ""),
                    "event_date": occ.get("eventDate", ""),
                    "dataset_key": occ.get("datasetKey", ""),
                    "url": url,
                    "download_url": download_url(url),
                    "gbif_download": archive_path.stem,
                }
            )

    by_taxon: dict[int, list[int]] = defaultdict(list)
    for gbif_id, found in images.items():
        by_taxon[found[0]["taxonKey"]].append(gbif_id)
    candidates = []
    for taxon_ids in by_taxon.values():
        taken = 0
        for gbif_id in sorted(taxon_ids, key=observation_order):
            if taken >= per_taxon:
                break
            picked = sorted(images[gbif_id], key=lambda c: c["n"])[:per_observation]
            picked = picked[: per_taxon - taken]
            taken += len(picked)
            candidates.extend(picked)
            stats[picked[0]["class_id"]]["selected"] += len(picked)
    candidates.sort(key=lambda c: c["path"])
    return candidates, stats


def write_table(rows: list[dict], path: Path, columns: list[str]) -> None:
    table = pa.Table.from_pylist([{c: r[c] for c in columns} for r in rows])
    if not rows:
        table = pa.table({c: pa.array([], pa.string()) for c in columns})
    tmp = path.with_suffix(".parquet.tmp")
    pq.write_table(table, tmp)
    tmp.replace(path)


def read_table(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"{path} is missing; run the earlier steps first")
    return pq.read_table(path).to_pylist()


# --- Download, resize, manifest ----------------------------------------------------------


def http_get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": user_agent()})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500 or attempt == 3:
                raise
        except OSError:
            if attempt == 3:
                raise
        time.sleep(2 ** (attempt + 1))
    raise AssertionError("unreachable")


def resize(data: bytes, short_side: int = SHORT_SIDE) -> Image.Image:
    """Upright RGB image whose shorter side is short_side. Smaller images are not enlarged."""
    image = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    image = image.convert("RGB")
    scale = short_side / min(image.size)
    if scale < 1:
        size = (round(image.width * scale), round(image.height * scale))
        image = image.resize(size, Image.Resampling.LANCZOS)
    return image


def fetch_one(candidate: dict, root: Path, get: Get) -> str | None:
    """Download one image unless it is already there. Returns an error message or None."""
    dest = root / candidate["path"]
    if dest.exists():
        return None
    try:
        image = resize(get(candidate["download_url"]))
    except (OSError, ValueError, Image.DecompressionBombError) as e:  # skip, retry next run
        return f"{type(e).__name__}: {e}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    image.save(tmp, "JPEG", quality=90)
    tmp.replace(dest)
    return None


def download(candidates: list[dict], root: Path, get: Get = http_get, workers: int = WORKERS):
    todo = [c for c in candidates if not (root / c["path"]).exists()]
    failures = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for i, (c, error) in enumerate(
            zip(todo, pool.map(lambda c: fetch_one(c, root, get), todo))
        ):
            if error:
                failures.append({"path": c["path"], "url": c["download_url"], "error": error})
            if (i + 1) % 500 == 0:
                print(f"{i + 1}/{len(todo)} images, {len(failures)} failed", flush=True)
    return len(todo), failures


def build_manifest(root: Path) -> list[dict]:
    """Write manifest.parquet: the candidates that are on disk and not excluded.

    Files under images/ without a manifest row (excluded, or no longer picked) move to
    unused/, so every image under images/ has a row with its license (#4 done criteria).
    """
    candidates = read_table(root / "candidates.parquet")
    exclude = read_exclude(root / "exclude.csv")
    keep = [
        c
        for c in candidates
        if (c["gbifID"], c["n"]) not in exclude and (root / c["path"]).exists()
    ]
    wanted = {c["path"] for c in keep}
    images = root / "images"
    for file in sorted(images.rglob("*")) if images.exists() else []:
        rel = file.relative_to(root).as_posix()
        if file.is_file() and rel not in wanted:
            target = root / "unused" / file.relative_to(images)
            target.parent.mkdir(parents=True, exist_ok=True)
            file.replace(target)
    write_table(keep, root / "manifest.parquet", CANDIDATE_COLUMNS)
    return keep


# --- Duplicates --------------------------------------------------------------------------


def dhash(image: Image.Image) -> int:
    """64-bit difference hash: survives resizing and recompression, not crops."""
    small = image.convert("L").resize((9, 8), Image.Resampling.BILINEAR)
    px = small.load()
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = bits << 1 | (px[x + 1, y] > px[x, y])
    return bits


def duplicates(hashes: dict[str, tuple[int, str]]) -> list[tuple[str, str]]:
    """(path, reason) for each image to exclude, given path -> (hash, class_id).

    Within a class the first path of a group stays. A photo that appears in two classes
    has conflicting labels, so every copy goes.
    """
    groups: dict[int, list[str]] = defaultdict(list)
    for path, (h, _) in sorted(hashes.items()):
        groups[h].append(path)
    out = []
    for paths in groups.values():
        if len(paths) < 2:
            continue
        if len({hashes[p][1] for p in paths}) > 1:
            out.extend((p, "duplicate across classes") for p in paths)
        else:
            out.extend((p, f"duplicate of {paths[0]}") for p in paths[1:])
    return out


def hash_file(path: Path) -> int:
    with Image.open(path) as image:
        return dhash(image)


# --- Review and report -------------------------------------------------------------------


def contact_sheet(paths: list[Path], labels: list[str], thumb: int = 200, cols: int = 10):
    rows = max(1, -(-len(paths) // cols))
    sheet = Image.new("RGB", (cols * thumb, rows * (thumb + 14)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (path, label) in enumerate(zip(paths, labels)):
        x, y = i % cols * thumb, i // cols * (thumb + 14)
        with Image.open(path) as image:
            image = ImageOps.fit(image.convert("RGB"), (thumb, thumb))
        sheet.paste(image, (x, y))
        draw.text((x + 2, y + thumb), label, fill="black")
    return sheet


def report_rows(manifest: list[dict], rows: list[Row], target: int = TARGET_PER_CLASS):
    images, observations = Counter(), defaultdict(set)
    for m in manifest:
        images[m["class_id"]] += 1
        observations[m["class_id"]].add(m["gbifID"])
    in_model = {r.class_id: r.in_model for r in rows}
    out = []
    for class_id in dict.fromkeys(r.class_id for r in rows):
        n = images[class_id]
        out.append(
            {
                "class_id": class_id,
                "in_model": in_model[class_id],
                "images": n,
                "observations": len(observations[class_id]),
                "ok": n >= target,
            }
        )
    return out


# --- Commands ----------------------------------------------------------------------------


def latest_archive() -> Path:
    archives = sorted(gbif_dir().glob("*.zip"), key=lambda p: p.stat().st_mtime)
    if not archives:
        raise SystemExit("no archive under <data dir>/gbif; run seeni.gbif_download fetch")
    return archives[-1]


def cmd_index(args) -> int:
    root = data_dir()
    archive = args.archive or latest_archive()
    rows = read(args.lajilista)
    candidates, stats = index(
        archive, rows, read_exclude(root / "exclude.csv"), args.per_taxon, args.per_observation
    )
    root.mkdir(parents=True, exist_ok=True)
    write_table(candidates, root / "candidates.parquet", CANDIDATE_COLUMNS)
    fields = [
        "observations",
        "images",
        "rejected_license",
        "rejected_no_rights_holder",
        "rejected_no_url",
        "excluded",
        "selected",
    ]
    print("class_id\t" + "\t".join(fields))
    for class_id in sorted(stats):
        print(class_id + "\t" + "\t".join(str(stats[class_id][f]) for f in fields))
    if stats["?"]["ambiguous_taxon"]:
        print(f"warning: {stats['?']['ambiguous_taxon']} occurrences match two classes")
    print(f"{len(candidates)} images picked from {archive.name}")
    return 0


def cmd_download(args) -> int:
    root = data_dir()
    candidates = read_table(root / "candidates.parquet")
    exclude = read_exclude(root / "exclude.csv")
    candidates = [c for c in candidates if (c["gbifID"], c["n"]) not in exclude]
    tried, failures = download(candidates, root, workers=args.workers)
    with (root / "download_failures.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, ["path", "url", "error"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(failures)
    manifest = build_manifest(root)
    print(f"{tried - len(failures)}/{tried} new images, {len(failures)} failed")
    print(f"manifest: {len(manifest)} images")
    return 0


def cmd_dedup(args) -> int:
    root = data_dir()
    manifest = read_table(root / "manifest.parquet")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        hashes = pool.map(hash_file, (root / m["path"] for m in manifest))
        by_path = {m["path"]: (h, m["class_id"]) for m, h in zip(manifest, hashes)}
    found = duplicates(by_path)
    keys = {m["path"]: (m["gbifID"], m["n"]) for m in manifest}
    append_exclude(root / "exclude.csv", [(*keys[p], reason) for p, reason in found])
    manifest = build_manifest(root)
    print(f"excluded {len(found)} duplicates; manifest: {len(manifest)} images")
    return 0


def cmd_sheets(args) -> int:
    root = data_dir()
    manifest = read_table(root / "manifest.parquet")
    by_class = defaultdict(list)
    for m in manifest:
        by_class[m["class_id"]].append(m)
    out = root / "review"
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    for class_id, items in sorted(by_class.items()):
        sample = sorted(rng.sample(items, min(args.sample, len(items))), key=lambda m: m["path"])
        sheet = contact_sheet(
            [root / m["path"] for m in sample], [f"{m['gbifID']}_{m['n']}" for m in sample]
        )
        sheet.save(out / f"{class_id}.jpg", quality=85)
    print(f"{len(by_class)} sheets in {out}. Add bad images to exclude.csv as gbifID,n,reason")
    print("and run `download` again to update the manifest.")
    return 0


def cmd_report(args) -> int:
    rows = read(args.lajilista)
    manifest = read_table(data_dir() / "manifest.parquet")
    print(f"| class_id | in_model | images | observations | ≥ {TARGET_PER_CLASS} |")
    print("| --- | --- | ---: | ---: | --- |")
    for r in report_rows(manifest, rows):
        mark = "yes" if r["ok"] else "**no**"
        print(
            f"| {r['class_id']} | {r['in_model']} | {r['images']} | {r['observations']} | {mark} |"
        )
    licenses = Counter(m["license"] for m in manifest)
    print("\nlicenses: " + ", ".join(f"{k} {v}" for k, v in licenses.most_common()))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--lajilista", type=Path, default=LAJILISTA)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("index", help="pick licensed images from the archive")
    p.add_argument("--archive", type=Path, help="default: the newest <data dir>/gbif/*.zip")
    p.add_argument("--per-taxon", type=int, default=PER_TAXON)
    p.add_argument("--per-observation", type=int, default=PER_OBSERVATION)
    p.set_defaults(func=cmd_index)
    p = sub.add_parser("download", help="fetch and resize images, write the manifest")
    p.add_argument("--workers", type=int, default=WORKERS)
    p.set_defaults(func=cmd_download)
    p = sub.add_parser("dedup", help="exclude duplicate photos")
    p.add_argument("--workers", type=int, default=WORKERS)
    p.set_defaults(func=cmd_dedup)
    p = sub.add_parser("sheets", help="contact sheets for browsing each class")
    p.add_argument("--sample", type=int, default=100)
    p.add_argument("--seed", type=int, default=0)
    p.set_defaults(func=cmd_sheets)
    p = sub.add_parser("report", help="images per class as a Markdown table")
    p.set_defaults(func=cmd_report)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
