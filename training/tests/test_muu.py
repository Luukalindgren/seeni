import zipfile

from seeni.lajilista import Row
from seeni.muu import FUNGI, common, index, kind_of, predicate, sample

BY = "http://creativecommons.org/licenses/by/4.0/"
NC = "http://creativecommons.org/licenses/by-nc/4.0/"
ROWS = [
    Row(1, "boletus", "Boletus edulis", "", 100, "syötävä", (), True),
    Row(2, "morchella", "Morchella", "", 200, "syötävä", (), True),
]
OCC = [
    "gbifID",
    "taxonKey",
    "speciesKey",
    "genusKey",
    "kingdomKey",
    "phylumKey",
    "taxonRank",
    "species",
]
MEDIA = ["gbifID", "type", "identifier", "license", "rightsHolder"]


def test_predicate_leaves_out_the_listed_taxa():
    p = predicate(ROWS, ["FI"])["predicates"]
    assert p[0]["values"][0] == str(FUNGI)
    assert p[1] == {
        "type": "not",
        "predicate": {"type": "in", "key": "TAXON_KEY", "values": ["100", "200"]},
    }


def occ(gbif_id, species, genus=10, kingdom=FUNGI, rank="SPECIES", phylum=""):
    # As read from the archive: every field is a string.
    return {
        "gbifID": str(gbif_id),
        "taxonKey": str(species),
        "speciesKey": str(species),
        "genusKey": str(genus),
        "kingdomKey": str(kingdom),
        "phylumKey": str(phylum),
        "taxonRank": rank,
        "species": f"S {species}",
    }


def test_kind_of():
    listed = {100, 200}
    assert kind_of(occ(1, 5000), listed) == ("fungi", 5000, "S 5000")
    # Below a listed genus, or the listed species itself.
    assert kind_of(occ(1, 5001, genus=200), listed) is None
    assert kind_of(occ(1, 100), listed) is None
    # Fungi need a species-level identification.
    assert kind_of(occ(1, 5002, rank="GENUS"), listed) is None
    # Moss (Bryophyta, phylum key 35) at any rank.
    assert kind_of(occ(1, 6000, kingdom=6, phylum=35, rank="GENUS"), listed)[0] == "other"
    assert kind_of(occ(1, 6001, kingdom=1), listed) is None


def test_sample_goes_round_the_species():
    by_species = {s: [{"gbifID": s * 10 + i} for i in range(5)] for s in range(3)}
    picked = sample(by_species, total=7, per_species=2)
    assert len(picked) == 6  # 3 species x 2
    counts = {s: sum(p["gbifID"] // 10 == s for p in picked) for s in range(3)}
    assert counts == {0: 2, 1: 2, 2: 2}
    assert len(sample(by_species, total=4, per_species=2)) == 4


def tsv(fields, rows):
    lines = ["\t".join(fields)] + ["\t".join(str(r.get(f, "")) for f in fields) for r in rows]
    return "\n".join(lines) + "\n"


def test_index_takes_one_licensed_image_per_observation(tmp_path):
    archive = tmp_path / "a.zip"
    occurrences = [occ(1, 5000), occ(2, 5001), occ(3, 100), occ(4, 6000, kingdom=6, phylum=35)]
    media = [
        {
            "gbifID": 1,
            "type": "StillImage",
            "identifier": "https://x/1a",
            "license": NC,
            "rightsHolder": "A",
        },
        {
            "gbifID": 1,
            "type": "StillImage",
            "identifier": "https://x/1b",
            "license": BY,
            "rightsHolder": "A",
        },
        {
            "gbifID": 1,
            "type": "StillImage",
            "identifier": "https://x/1c",
            "license": BY,
            "rightsHolder": "A",
        },
        {
            "gbifID": 2,
            "type": "StillImage",
            "identifier": "https://x/2",
            "license": BY,
            "rightsHolder": "",
        },
        {
            "gbifID": 3,
            "type": "StillImage",
            "identifier": "https://x/3",
            "license": BY,
            "rightsHolder": "A",
        },
        {
            "gbifID": 4,
            "type": "StillImage",
            "identifier": "https://x/4",
            "license": BY,
            "rightsHolder": "B",
        },
    ]
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("occurrence.txt", tsv(OCC, occurrences))
        z.writestr("multimedia.txt", tsv(MEDIA, media))
    candidates, stats = index(archive, ROWS, {})
    assert [(c["gbifID"], c["url"], c["kind"]) for c in candidates] in (
        [(1, "https://x/1b", "fungi"), (4, "https://x/4", "other")],
        [(4, "https://x/4", "other"), (1, "https://x/1b", "fungi")],
    )
    assert all(c["class_id"] == "muu" and c["path"].startswith("muu/images/") for c in candidates)
    assert stats["skipped_observations"] == 1


def test_common_takes_the_most_observed_species():
    by_species = {
        1: [{"gbifID": i} for i in range(10)],
        2: [{"gbifID": i} for i in range(10, 13)],
        3: [{"gbifID": 20}],
    }
    picked = common(by_species, n=2, per_species=5, total=100)
    assert len(picked) == 8
    assert {c["gbifID"] for c in picked} >= {10, 11, 12}
    assert 20 not in {c["gbifID"] for c in picked}
    # The total cap takes whole species only.
    assert len(common(by_species, n=2, per_species=5, total=7)) == 5
