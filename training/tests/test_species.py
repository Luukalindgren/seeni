from seeni.lajilista import Row, read
from seeni.species import check, load, sync


def test_species_json_is_valid():
    """The committed species.json against the committed lajilista.csv (#9, runs in CI)."""
    assert check(load(), read()) == []


def rows(food_lookalikes=("deadly", "warn")):
    return [
        Row(1, "food", "Food food", "ruoka", 1, "syötävä", tuple(food_lookalikes), True),
        Row(2, "deadly", "Deadly deadly", "tappo", 2, "tappava", ("food",), True),
        Row(3, "warn", "Warn warn", "varo", 3, "myrkyllinen", (), False),
    ]


def records(lajilista):
    out = sync([], lajilista)
    out[0]["tarkistukset"] = [
        {"id": "x", "kysymys": "Onko?", "vastaukset": {"kyllä": ["food"], "ei": ["deadly"]}}
    ]
    return out


def errors_after(change):
    lajilista = rows()
    r = records(lajilista)
    change(r)
    return check(r, lajilista)


def test_a_synced_draft_is_valid():
    assert errors_after(lambda r: None) == []


def test_sync_fills_derived_fields_and_keeps_hand_fields():
    lajilista = rows()
    r = records(lajilista)
    r[0]["nimi"] = "ruokasienet"
    again = sync(r, lajilista)
    assert again[0]["nimi"] == "ruokasienet"
    assert again[0]["kaksoisolennot"] == ["deadly", "warn"]
    assert again[1]["ryhma"] == "tappava" and again[1]["taxonKeys"] == [2]
    assert again[0]["tarkistukset"] == r[0]["tarkistukset"]


def test_warning_only_record_must_be_listed_by_a_model_class():
    lajilista = rows(food_lookalikes=("deadly",))
    errors = check(records(lajilista), lajilista)
    assert any(e.startswith("warn:") and "no model class lists" in e for e in errors)


def test_detects_wrong_group_broken_references_and_edibility():
    assert any("ryhma" in e for e in errors_after(lambda r: r[1].update(ryhma="syötävä")))
    assert any(
        "has no record" in e
        for e in errors_after(lambda r: r[0]["tarkistukset"][0]["vastaukset"].update(ei=["nope"]))
    )
    assert any(
        "edibility" in e
        for e in errors_after(lambda r: r[0]["tuntomerkit"].append("Hyvä ruokasieni"))
    )
    assert any("model class has no record" in e for e in errors_after(lambda r: r.pop(1)))


def test_same_check_id_must_be_the_same_check():
    def change(r):
        r[1]["tarkistukset"] = [
            {"id": "x", "kysymys": "Toinen?", "vastaukset": {"a": ["deadly"], "b": ["food"]}}
        ]

    assert any("differs" in e for e in errors_after(change))
