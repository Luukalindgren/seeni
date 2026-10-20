import json

from seeni.gbif_download import citation, record_download, request_body
from seeni.lajilista import read

HEADER = "class_id,tieteellinen,nimi,taxonKey,ryhma,kaksoisolennot,in_model\n"


def test_request_body_asks_for_every_key_once(tmp_path):
    path = tmp_path / "lajilista.csv"
    path.write_text(
        HEADER
        + "a-agg,Aa aa,,11,syötävä,,true\n"
        + "a-agg,Aa bb,,12,syötävä,,true\n"
        + "b,Bb,,20,tappava,,false\n",
        encoding="utf-8",
    )
    body = request_body(read(path), ["FI", "SE"], "user", "")
    assert body["format"] == "DWCA"
    assert "notificationAddresses" not in body
    preds = {p["key"]: p for p in body["predicate"]["predicates"]}
    assert preds["TAXON_KEY"]["values"] == ["11", "12", "20"]
    assert preds["COUNTRY"]["values"] == ["FI", "SE"]
    assert preds["MEDIA_TYPE"]["value"] == "StillImage"
    assert preds["BASIS_OF_RECORD"]["value"] == "HUMAN_OBSERVATION"


META = {
    "key": "0001234-261020120000000",
    "doi": "10.15468/dl.abcd12",
    "created": "2026-10-20T10:30:00.000+00:00",
    "totalRecords": 1000,
    "license": "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
    "request": {"predicate": {"type": "and", "predicates": []}},
}


def test_citation():
    assert citation(META) == (
        "GBIF.org (20 October 2026) GBIF Occurrence Download https://doi.org/10.15468/dl.abcd12"
    )


def test_record_download_replaces_same_key(tmp_path):
    path = tmp_path / "gbif_download.json"
    record_download(META, path)
    record_download({**META, "totalRecords": 1001}, path)
    record_download({**META, "key": "other", "doi": "10.15468/dl.x"}, path)
    downloads = json.loads(path.read_text(encoding="utf-8"))["downloads"]
    assert [d["key"] for d in downloads] == [META["key"], "other"]
    assert downloads[0]["totalRecords"] == 1001
