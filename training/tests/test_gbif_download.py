import io
import json

from seeni import gbif_download
from seeni.gbif_download import citation, download_zip, record_download, request_body
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


class FakeResponse(io.BytesIO):
    def __init__(self, data, status):
        super().__init__(data)
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def test_download_zip_resumes_a_partial_file(tmp_path, monkeypatch):
    data = b"0123456789" * 100
    requests = []

    def urlopen(request, timeout):
        requests.append(request.get_header("Range"))
        if len(requests) == 1:
            raise ConnectionResetError("reset")
        start = int(request.get_header("Range")[6:-1])
        return FakeResponse(data[start:], 206)

    (tmp_path / "k.zip.part").write_bytes(data[:300])
    monkeypatch.setattr(gbif_download.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(gbif_download.time, "sleep", lambda s: None)
    download_zip({"key": "k", "size": len(data), "downloadLink": "https://x"}, tmp_path / "k.zip")
    assert (tmp_path / "k.zip").read_bytes() == data
    assert requests == ["bytes=300-", "bytes=300-"]
