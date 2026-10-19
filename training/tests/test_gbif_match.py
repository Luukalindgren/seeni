import csv

from seeni.gbif_match import fill_keys, run
from seeni.lajilista import read

HEADER = "class_id,tieteellinen,nimi,taxonKey,ryhma,kaksoisolennot,in_model\n"
ROWS = (
    "cortinarius,Cortinarius,seitikit,,tappava,,true\n"
    "cortinarius-caperatus,Cortinarius caperatus,kehnäsieni,,syötävä,cortinarius,true\n"
    "rozites-caperatus,Rozites caperatus,,,syötävä,,true\n"
    "cantharellus-cibarius,Cantharellus cibarius,kantarelli,,syötävä,,true\n"
)

# Shaped like api.gbif.org/v1/species/match responses.
MATCHES = {
    "Cortinarius": {
        "usageKey": 10,
        "scientificName": "Cortinarius (Pers.) Gray",
        "rank": "GENUS",
        "status": "ACCEPTED",
        "matchType": "EXACT",
        "kingdom": "Fungi",
        "genusKey": 10,
    },
    "Cortinarius caperatus": {
        "usageKey": 11,
        "scientificName": "Cortinarius caperatus (Pers.) Fr.",
        "rank": "SPECIES",
        "status": "ACCEPTED",
        "matchType": "EXACT",
        "kingdom": "Fungi",
        "genusKey": 10,
        "speciesKey": 11,
    },
    "Rozites caperatus": {
        "usageKey": 12,
        "acceptedUsageKey": 11,
        "scientificName": "Rozites caperatus (Pers.) P.Karst.",
        "rank": "SPECIES",
        "status": "SYNONYM",
        "matchType": "EXACT",
        "kingdom": "Fungi",
        "genusKey": 10,
        "speciesKey": 11,
    },
    "Cantharellus cibarius": {
        "usageKey": 20,
        "scientificName": "Cantharellus cibarius Fr.",
        "rank": "SPECIES",
        "status": "ACCEPTED",
        "matchType": "EXACT",
        "kingdom": "Fungi",
        "genusKey": 19,
        "speciesKey": 20,
    },
}
VERNACULAR = {20: ["kantarelli"], 11: ["kehnäsieni"], 10: []}


def fake_fetch(path, params):
    if path == "species/match":
        return MATCHES.get(params["name"], {"matchType": "NONE"})
    key = int(path.split("/")[1])
    return {"results": [{"vernacularName": n, "language": "fin"} for n in VERNACULAR[key]]}


def report_for(tmp_path, rows=ROWS):
    path = tmp_path / "lajilista.csv"
    path.write_text(HEADER + rows, encoding="utf-8")
    return path, {r["tieteellinen"]: r for r in run(read(path), fake_fetch, pause=0)}


def test_clean_match_has_no_flags(tmp_path):
    _, report = report_for(tmp_path)
    assert report["Cantharellus cibarius"]["proposed_key"] == 20
    assert report["Cantharellus cibarius"]["flags"] == ""


def test_synonym_proposes_accepted_key(tmp_path):
    _, report = report_for(tmp_path)
    row = report["Rozites caperatus"]
    assert row["proposed_key"] == 11
    assert "status-synonym" in row["flags"]


def test_genus_overlap_is_flagged(tmp_path):
    _, report = report_for(tmp_path)
    assert "inside-cortinarius" in report["Cortinarius caperatus"]["flags"]
    assert "inside-cortinarius" not in report["Cortinarius"]["flags"]


def test_no_match_and_name_mismatch(tmp_path):
    rows = (
        "fungus-ignotus,Fungus ignotus,,,syötävä,,true\n"
        "cantharellus-cibarius,Cantharellus cibarius,keltavahvero,,syötävä,,true\n"
    )
    _, report = report_for(tmp_path, rows)
    assert report["Fungus ignotus"]["flags"] == "no-match"
    assert "nimi-differs" in report["Cantharellus cibarius"]["flags"]


def test_same_accepted_key_is_flagged(tmp_path):
    _, report = report_for(tmp_path)
    assert "duplicate-key" in report["Rozites caperatus"]["flags"]
    assert "duplicate-key" in report["Cortinarius caperatus"]["flags"]


def test_fill_only_unflagged_empty_keys(tmp_path):
    path, report = report_for(tmp_path)
    assert fill_keys(path, list(report.values())) == 2
    with path.open(encoding="utf-8") as f:
        keys = {r["tieteellinen"]: r["taxonKey"] for r in csv.DictReader(f)}
    assert keys == {
        "Cortinarius": "10",
        "Cortinarius caperatus": "",
        "Rozites caperatus": "",
        "Cantharellus cibarius": "20",
    }
