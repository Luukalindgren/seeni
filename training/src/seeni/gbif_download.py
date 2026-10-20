"""Request and fetch the GBIF occurrence download for the species list (phase 4, #4).

Needs api.gbif.org and a GBIF account, so run it on the desktop. The credentials come from
the environment and never go into git:

    export GBIF_USER=...  GBIF_PWD=...  GBIF_EMAIL=...

Run from training/:

    uv run python -m seeni.gbif_download request --dry-run   # print the request body
    uv run python -m seeni.gbif_download request             # send it, remember the key
    uv run python -m seeni.gbif_download fetch --wait        # wait, download the zip, save the DOI

The request asks for every taxonKey on data-meta/lajilista.csv, photographed human
observations from FI, SE, NO and EE, as a Darwin Core Archive. The archive goes to
<data dir>/gbif/<key>.zip. The download's DOI goes to data-meta/gbif_download.json, which is
committed, because the site's attributions cite it.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from seeni.lajilista import LAJILISTA, LajilistaError, Row, read, validate
from seeni.paths import REPO_ROOT, data_dir

API = "https://api.gbif.org/v1"
COUNTRIES = ["FI", "SE", "NO", "EE"]
DOWNLOAD_RECORD = REPO_ROOT / "data-meta" / "gbif_download.json"
FINISHED = {"SUCCEEDED"}
FAILED = {"CANCELLED", "FAILED", "KILLED", "SUSPENDED", "FILE_ERASED"}


def user_agent() -> str:
    """User-Agent with contact details, as GBIF and image hosts ask for."""
    contact = os.environ.get("GBIF_EMAIL", "").strip()
    extra = f"; {contact}" if contact else ""
    return f"seeni-data (+https://github.com/Luukalindgren/seeni{extra})"


def gbif_dir() -> Path:
    return data_dir() / "gbif"


def predicate(rows: list[Row], countries: list[str]) -> dict:
    keys = sorted({r.taxon_key for r in rows if r.taxon_key is not None})
    return {
        "type": "and",
        "predicates": [
            # TAXON_KEY matches the taxon and everything below it, synonyms included.
            {"type": "in", "key": "TAXON_KEY", "values": [str(k) for k in keys]},
            {"type": "in", "key": "COUNTRY", "values": countries},
            {"type": "equals", "key": "MEDIA_TYPE", "value": "StillImage"},
            {"type": "equals", "key": "BASIS_OF_RECORD", "value": "HUMAN_OBSERVATION"},
            {"type": "equals", "key": "OCCURRENCE_STATUS", "value": "PRESENT"},
        ],
    }


def request_body(rows: list[Row], countries: list[str], user: str, email: str) -> dict:
    body = {"creator": user, "format": "DWCA", "predicate": predicate(rows, countries)}
    if email:
        body["notificationAddresses"] = [email]
        body["sendNotification"] = True
    return body


def credentials() -> tuple[str, str, str]:
    user, password = os.environ.get("GBIF_USER", ""), os.environ.get("GBIF_PWD", "")
    if not user or not password:
        raise SystemExit("set GBIF_USER and GBIF_PWD (and GBIF_EMAIL for a notification)")
    return user, password, os.environ.get("GBIF_EMAIL", "")


def http(url: str, data: bytes | None = None, headers: dict | None = None) -> bytes:
    request = urllib.request.Request(
        url, data=data, headers={"User-Agent": user_agent(), **(headers or {})}
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500 or attempt == 3:
                detail = e.read().decode("utf-8", "replace")[:500]
                raise SystemExit(f"{url}: HTTP {e.code}: {detail}") from e
        except OSError:
            if attempt == 3:
                raise
        time.sleep(2**attempt)
    raise AssertionError("unreachable")


def send_request(body: dict, user: str, password: str) -> str:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    key = http(
        f"{API}/occurrence/download/request",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Basic {token}"},
    )
    return key.decode().strip()


def status(key: str) -> dict:
    return json.loads(http(f"{API}/occurrence/download/{key}"))


def download_zip(meta: dict, dest: Path) -> None:
    """Stream the archive to dest. A finished file of the right size is not fetched again."""
    size = meta.get("size")
    if dest.exists() and size and dest.stat().st_size == size:
        return
    url = meta.get("downloadLink") or f"{API}/occurrence/download/request/{meta['key']}.zip"
    part = dest.with_suffix(".zip.part")
    request = urllib.request.Request(url, headers={"User-Agent": user_agent()})
    with urllib.request.urlopen(request, timeout=120) as response, part.open("wb") as f:
        while chunk := response.read(1 << 20):
            f.write(chunk)
    if size and part.stat().st_size != size:
        raise SystemExit(f"{part}: got {part.stat().st_size} bytes, GBIF says {size}")
    part.replace(dest)


def citation(meta: dict) -> str:
    created = datetime.fromisoformat(meta["created"])
    return (
        f"GBIF.org ({created.day} {created:%B %Y}) GBIF Occurrence Download "
        f"https://doi.org/{meta['doi']}"
    )


def record_download(meta: dict, path: Path = DOWNLOAD_RECORD) -> dict:
    """Add the download to data-meta/gbif_download.json, replacing an entry with the same key."""
    entry = {
        "key": meta["key"],
        "doi": meta["doi"],
        "citation": citation(meta),
        "created": meta["created"],
        "totalRecords": meta.get("totalRecords"),
        "license": meta.get("license"),
        "predicate": (meta.get("request") or {}).get("predicate"),
    }
    record = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    downloads = [d for d in record.get("downloads", []) if d["key"] != entry["key"]]
    record["downloads"] = [*downloads, entry]
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return entry


def latest_key() -> str:
    path = gbif_dir() / "request.json"
    if not path.exists():
        raise SystemExit("no download requested yet: run `request` first or pass --key")
    return json.loads(path.read_text(encoding="utf-8"))["key"]


def cmd_request(args) -> int:
    try:
        rows = read(args.lajilista)
        errors, _ = validate(rows, require_keys=True)
    except LajilistaError as e:
        errors = e.errors
    if errors:
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        return 1
    if args.dry_run:
        body = request_body(rows, args.country, "<GBIF_USER>", os.environ.get("GBIF_EMAIL", ""))
        print(json.dumps(body, indent=2))
        return 0
    user, password, email = credentials()
    body = request_body(rows, args.country, user, email)
    key = send_request(body, user, password)
    gbif_dir().mkdir(parents=True, exist_ok=True)
    (gbif_dir() / "request.json").write_text(
        json.dumps({"key": key, "predicate": body["predicate"]}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"requested download {key}; GBIF prepares it in minutes to hours. Then run `fetch`.")
    return 0


def cmd_fetch(args) -> int:
    key = args.key or latest_key()
    while True:
        meta = status(key)
        state = meta.get("status", "?")
        if state in FINISHED or state in FAILED or not args.wait:
            break
        print(f"{key}: {state}, checking again in {args.interval} s")
        time.sleep(args.interval)
    if state in FAILED:
        print(f"{key}: {state}", file=sys.stderr)
        return 1
    if state not in FINISHED:
        print(f"{key}: {state}; run again later or pass --wait")
        return 2
    dest = gbif_dir() / f"{key}.zip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    download_zip(meta, dest)
    entry = record_download(meta)
    print(f"{dest} ({meta.get('totalRecords')} occurrences)")
    print(f"DOI {entry['doi']} saved to {DOWNLOAD_RECORD.relative_to(REPO_ROOT)}; commit it.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    req = sub.add_parser("request", help="send the download request")
    req.add_argument("--lajilista", type=Path, default=LAJILISTA)
    req.add_argument("--country", nargs="+", default=COUNTRIES, help="ISO 3166 codes")
    req.add_argument("--dry-run", action="store_true", help="print the body, send nothing")
    req.set_defaults(func=cmd_request)
    fetch = sub.add_parser("fetch", help="download the archive once GBIF has prepared it")
    fetch.add_argument("--key", help="download key; default: the last one requested")
    fetch.add_argument("--wait", action="store_true", help="poll until it is ready")
    fetch.add_argument("--interval", type=int, default=120, help="seconds between polls")
    fetch.set_defaults(func=cmd_fetch)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
