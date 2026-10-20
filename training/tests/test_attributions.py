import json

from seeni.attributions import WEB, photographers


def test_photographers_are_grouped_with_counts_and_licenses():
    manifest = [
        {"rights_holder": "b", "license": "CC0-1.0"},
        {"rights_holder": "A", "license": "CC-BY-4.0"},
        {"rights_holder": "b", "license": "CC-BY-4.0"},
    ]
    assert photographers(manifest) == [
        {"name": "A", "images": 1, "licenses": ["CC-BY-4.0"]},
        {"name": "b", "images": 2, "licenses": ["CC-BY-4.0", "CC0-1.0"]},
    ]


def test_published_attributions_cite_every_download_and_only_allowed_licenses():
    a = json.loads(WEB.read_text(encoding="utf-8"))
    assert {d["doi"] for d in a["downloads"]} >= {"10.15468/dl.fadmpu", "10.15468/dl.3x49qy"}
    assert set(a["licenses"]) <= {"CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "CC-BY-2.0", "CC-BY"}
    assert sum(p["images"] for p in a["photographers"]) == a["images"]
