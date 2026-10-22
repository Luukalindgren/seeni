import json

from seeni.lajilista import Row, read
from seeni.species import RECIPES, SPECIES_EN, check, check_recipes, check_translation, load, sync


def test_species_json_is_valid():
    """The committed species.json against the committed lajilista.csv (#9, runs in CI)."""
    assert check(load(), read()) == []


def test_english_translation_is_complete():
    """species.en.json covers exactly the records and checks of species.json (#52)."""
    en = json.loads(SPECIES_EN.read_text(encoding="utf-8"))
    assert check_translation(load(), en) == []


def rows(food_lookalikes=("deadly", "warn")):
    return [
        Row(1, "food", "Food food", "ruoka", 1, "syötävä", tuple(food_lookalikes), True),
        Row(2, "deadly", "Deadly deadly", "tappo", 2, "tappava", ("food",), True),
        Row(3, "warn", "Warn warn", "varo", 3, "myrkyllinen", (), False),
    ]


def records(lajilista):
    out = sync([], lajilista)
    out[0]["tarkistukset"] = [
        {
            "id": "x",
            "kysymys": "Onko?",
            "vastaukset": {"kyllä": ["food", "deadly"], "ei": ["deadly"]},
        }
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
    r[0]["nimi"] = "testisienet"
    again = sync(r, lajilista)
    assert again[0]["nimi"] == "testisienet"
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


def test_only_reliable_checks_may_rule_out_a_dangerous_class():
    def unreliable(r):
        r[0]["tarkistukset"][0]["vastaukset"]["kyllä"] = ["food"]

    assert any("not a reliable one" in e for e in errors_after(unreliable))

    def reliable(r):
        r[0]["tarkistukset"][0]["vastaukset"]["kyllä"] = ["food"]
        r[0]["tarkistukset"][0]["id"] = "itiopoly"

    assert not any("not a reliable one" in e for e in errors_after(reliable))


def test_edibility_in_a_name_is_caught():
    assert any("edibility" in e for e in errors_after(lambda r: r[0].update(nimi="ruokasienet")))


def test_sync_refuses_to_drop_a_record():
    import pytest

    lajilista = rows()
    r = records(lajilista)
    r.append({**r[0], "id": "gone"})
    with pytest.raises(SystemExit):
        sync(r, lajilista)


def test_translation_problems_are_caught():
    r = records(rows())
    en = {
        "records": {
            "food": {"nimi": "food", "tuntomerkit": []},
            "deadly": {"nimi": "deadly", "tuntomerkit": []},
            "warn": {"nimi": "a delicious one", "tuntomerkit": []},
            "gone": {"nimi": "gone", "tuntomerkit": []},
        },
        "checks": {"x": {"kysymys": "Is it?", "vastaukset": {"kyllä": "yes"}}},
    }
    errors = "\n".join(check_translation(r, en))
    assert "warn: English text states edibility" in errors
    assert "gone: in species.en.json but has no record" in errors
    assert "check x: English answers must have exactly the Finnish answer keys" in errors
    en["records"]["warn"]["nimi"] = "warn"
    del en["records"]["gone"]
    en["checks"]["x"]["vastaukset"]["ei"] = "no"
    assert check_translation(r, en) == []


def test_recipes_are_valid():
    recipes = json.loads(RECIPES.read_text(encoding="utf-8"))
    assert check_recipes(recipes, read()) == []


def test_recipes_only_for_syotava_classes():
    link = {
        "nimi": "Sienikastike",
        "url": "https://www.k-ruoka.fi/reseptit/sienikastike",
        "lahde": "K-Ruoka",
    }
    rows = read()
    # esikäsiteltävä, tappava, warning-only, an unknown id and a bad host are all refused.
    errors = "\n".join(
        check_recipes(
            {
                "lactarius-rufus": [link],
                "amanita-virosa": [link],
                "cortinarius-orellanus": [link],
                "no-such-class": [link],
                "cantharellus-cibarius": [{**link, "url": "http://example.com/x"}],
                "boletus-edulis-agg": [],
            },
            rows,
        )
    )
    assert "lactarius-rufus: only a syötävä class" in errors
    assert "amanita-virosa: only a syötävä class" in errors
    assert "cortinarius-orellanus: not a model class" in errors
    assert "no-such-class: not a class_id" in errors
    assert "http://example.com/x is not https" in errors
    assert "boletus-edulis-agg: give one or two recipes" in errors
