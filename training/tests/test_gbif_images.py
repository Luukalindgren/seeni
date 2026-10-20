import io
import zipfile

import pytest
from PIL import Image

from seeni.gbif_images import (
    CANDIDATE_COLUMNS,
    build_manifest,
    dhash,
    download,
    download_url,
    duplicates,
    index,
    normalize_license,
    read_table,
    report_rows,
    resize,
    write_table,
)
from seeni.lajilista import read

HEADER = "class_id,tieteellinen,nimi,taxonKey,ryhma,kaksoisolennot,in_model\n"


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("http://creativecommons.org/publicdomain/zero/1.0/", "CC0-1.0"),
        ("https://creativecommons.org/publicdomain/zero/1.0/legalcode", "CC0-1.0"),
        ("CC0_1_0", "CC0-1.0"),
        ("cc0", "CC0-1.0"),
        ("http://creativecommons.org/licenses/by/4.0/", "CC-BY-4.0"),
        ("https://creativecommons.org/licenses/by/3.0/fi/deed.fi", "CC-BY-3.0"),
        ("CC_BY_4_0", "CC-BY-4.0"),
        ("CC BY 4.0", "CC-BY-4.0"),
        ("cc-by", "CC-BY"),
        ("http://creativecommons.org/licenses/by-nc/4.0/", None),
        ("http://creativecommons.org/licenses/by-sa/4.0/", None),
        ("http://creativecommons.org/licenses/by-nd/4.0/", None),
        ("CC_BY_NC_4_0", None),
        ("CC BY-NC 4.0", None),
        ("http://creativecommons.org/publicdomain/mark/1.0/", None),
        ("All rights reserved", None),
        ("", None),
    ],
)
def test_normalize_license(raw, expected):
    assert normalize_license(raw) == expected


def test_download_url_uses_large_for_inaturalist():
    url = "https://inaturalist-open-data.s3.amazonaws.com/photos/123/original.jpeg"
    assert (
        download_url(url) == "https://inaturalist-open-data.s3.amazonaws.com/photos/123/large.jpeg"
    )
    other = "https://example.org/photos/original.jpg"
    assert download_url(other) == other


OCC_FIELDS = [
    "gbifID",
    "countryCode",
    "eventDate",
    "datasetKey",
    "taxonKey",
    "acceptedTaxonKey",
    "speciesKey",
    "genusKey",
]
MEDIA_FIELDS = ["gbifID", "type", "format", "identifier", "license", "rightsHolder", "creator"]
BY = "http://creativecommons.org/licenses/by/4.0/"


def tsv(fields, rows):
    lines = ["\t".join(fields)] + ["\t".join(str(r.get(f, "")) for f in fields) for r in rows]
    return "\n".join(lines) + "\n"


def make_archive(path, occurrences, media):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("occurrence.txt", tsv(OCC_FIELDS, occurrences))
        z.writestr("multimedia.txt", tsv(MEDIA_FIELDS, media))
    return path


@pytest.fixture
def rows(tmp_path):
    path = tmp_path / "lajilista.csv"
    path.write_text(
        HEADER
        + "boletus-agg,Boletus edulis,,100,syötävä,,true\n"
        + "morchella,Morchella,,200,tappava,,true\n",
        encoding="utf-8",
    )
    return read(path)


def img(i, gbif_id, **kw):
    return {
        "gbifID": gbif_id,
        "type": "StillImage",
        "identifier": f"https://x.org/{gbif_id}/{i}.jpg",
        "license": BY,
        "rightsHolder": "Kuvaaja",
        **kw,
    }


def test_index_assigns_rows_by_taxon_path_and_filters_licenses(tmp_path, rows):
    occurrences = [
        # A synonym whose accepted key is the row's key.
        {
            "gbifID": 1,
            "countryCode": "FI",
            "taxonKey": 999,
            "acceptedTaxonKey": 100,
            "speciesKey": 100,
            "genusKey": 50,
        },
        # A species inside the genus row: the image goes under the genus row's key.
        {"gbifID": 2, "countryCode": "SE", "taxonKey": 201, "speciesKey": 201, "genusKey": 200},
        # Not on the list.
        {"gbifID": 3, "countryCode": "FI", "taxonKey": 300, "genusKey": 301},
    ]
    media = [
        img(0, 1),
        img(1, 1, license="http://creativecommons.org/licenses/by-nc/4.0/"),
        img(2, 1, rightsHolder="", creator="Tekijä"),
        img(3, 1, rightsHolder="", creator=""),
        {"gbifID": 1, "type": "Sound", "identifier": "https://x.org/s.mp3", "license": BY},
        img(0, 2, license="CC0_1_0"),
        img(0, 3),
    ]
    archive = make_archive(tmp_path / "0001.zip", occurrences, media)
    candidates, stats = index(archive, rows, exclude={(2, 0): "microscope"})
    assert [(c["path"], c["license"], c["rights_holder"]) for c in candidates] == [
        ("images/100/1_0.jpg", "CC-BY-4.0", "Kuvaaja"),
        ("images/100/1_2.jpg", "CC-BY-4.0", "Tekijä"),
    ]
    assert stats["boletus-agg"]["rejected_license"] == 1
    assert stats["boletus-agg"]["rejected_no_rights_holder"] == 1
    assert stats["morchella"]["excluded"] == 1
    assert candidates[0]["gbif_download"] == "0001"


def test_index_caps_per_observation_and_per_taxon(tmp_path, rows):
    occurrences = [{"gbifID": g, "taxonKey": 100, "speciesKey": 100} for g in range(1, 11)]
    media = [img(i, g) for g in range(1, 11) for i in range(5)]
    archive = make_archive(tmp_path / "a.zip", occurrences, media)
    candidates, _ = index(archive, rows, {}, per_taxon=7, per_observation=2)
    assert len(candidates) == 7
    per_obs = {}
    for c in candidates:
        per_obs.setdefault(c["gbifID"], []).append(c["n"])
    assert all(ns == [0, 1] or ns == [0] for ns in per_obs.values())
    again, _ = index(archive, rows, {}, per_taxon=7, per_observation=2)
    assert again == candidates


def jpeg(size=(800, 600), color=(200, 100, 50)):
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, "JPEG")
    return out.getvalue()


def test_resize_shorter_side_and_no_upscale():
    assert resize(jpeg((1024, 768))).size == (683, 512)
    assert resize(jpeg((300, 200))).size == (300, 200)


def candidate(gbif_id, n=0, taxon=100, class_id="boletus-agg"):
    return {c: "" for c in CANDIDATE_COLUMNS} | {
        "path": f"images/{taxon}/{gbif_id}_{n}.jpg",
        "taxonKey": taxon,
        "class_id": class_id,
        "gbifID": gbif_id,
        "n": n,
        "download_url": f"https://x.org/{gbif_id}",
    }


def test_download_skips_existing_and_reports_failures(tmp_path):
    calls = []

    def get(url):
        calls.append(url)
        if url.endswith("/3"):
            raise OSError("boom")
        return jpeg()

    cands = [candidate(1), candidate(2), candidate(3)]
    tried, failures = download(cands, tmp_path, get=get, workers=2)
    assert tried == 3 and [f["path"] for f in failures] == ["images/100/3_0.jpg"]
    tried, _ = download(cands, tmp_path, get=get, workers=2)
    assert tried == 1  # only the failed one again
    assert Image.open(tmp_path / "images/100/1_0.jpg").size == (683, 512)


def test_manifest_moves_excluded_and_unpicked_files(tmp_path):
    cands = [candidate(1), candidate(2), candidate(4)]
    write_table(cands, tmp_path / "candidates.parquet", CANDIDATE_COLUMNS)
    for name in ["1_0", "2_0", "9_0"]:
        path = tmp_path / "images/100" / f"{name}.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(jpeg())
    (tmp_path / "exclude.csv").write_text("gbifID,n,reason\n2,0,drawing\n", encoding="utf-8")
    manifest = build_manifest(tmp_path)
    assert [m["path"] for m in manifest] == ["images/100/1_0.jpg"]
    assert read_table(tmp_path / "manifest.parquet")[0]["gbifID"] == 1
    assert sorted(p.name for p in (tmp_path / "images/100").iterdir()) == ["1_0.jpg"]
    assert sorted(p.name for p in (tmp_path / "unused/100").iterdir()) == ["2_0.jpg", "9_0.jpg"]


def test_dhash_survives_resize_and_duplicates():
    gradient = Image.linear_gradient("L").convert("RGB")
    assert dhash(gradient) == dhash(gradient.resize((100, 100)))
    found = duplicates(
        {
            "images/1/a.jpg": (5, "x"),
            "images/1/b.jpg": (5, "x"),
            "images/1/c.jpg": (6, "x"),
            "images/2/d.jpg": (7, "x"),
            "images/3/e.jpg": (7, "y"),
        }
    )
    assert found == [
        ("images/1/b.jpg", "duplicate of images/1/a.jpg"),
        ("images/2/d.jpg", "duplicate across classes"),
        ("images/3/e.jpg", "duplicate across classes"),
    ]


def test_report_rows_lists_every_class(rows):
    manifest = [candidate(1), candidate(1, n=1), candidate(2)]
    out = report_rows(manifest, rows, target=3)
    assert out == [
        {"class_id": "boletus-agg", "in_model": True, "images": 3, "observations": 2, "ok": True},
        {"class_id": "morchella", "in_model": True, "images": 0, "observations": 0, "ok": False},
    ]
