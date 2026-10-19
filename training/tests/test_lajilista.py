import pytest

from seeni.lajilista import LAJILISTA, LajilistaError, class_group, classes, main, read, validate

HEADER = "class_id,tieteellinen,nimi,taxonKey,ryhma,kaksoisolennot,in_model\n"
FOOD = "craterellus-tubaeformis,Craterellus tubaeformis,suppilovahvero,1,syötävä,cortinarius-rubellus,true\n"
DEADLY = "cortinarius-rubellus,Cortinarius rubellus,suippumyrkkyseitikki,2,tappava,,true\n"


def load(tmp_path, body, header=HEADER):
    path = tmp_path / "lajilista.csv"
    path.write_text(header + body, encoding="utf-8")
    return read(path)


def errors(tmp_path, body, **kwargs):
    return validate(load(tmp_path, body), **kwargs)[0]


def test_committed_list_is_valid():
    errs, _ = validate(read(LAJILISTA))
    assert errs == []


def test_valid_list(tmp_path):
    assert errors(tmp_path, FOOD + DEADLY) == []


def test_header_must_match(tmp_path):
    with pytest.raises(LajilistaError):
        load(tmp_path, "", header="class_id,name\n")


@pytest.mark.parametrize(
    "row",
    [
        "a,A b,,x,syötävä,,true\n",  # taxonKey not an integer
        "a,A b,,1,syötävä,,yes\n",  # in_model not true/false
        "a,A b,,1,syötävä,true\n",  # missing field
    ],
)
def test_unparseable_rows(tmp_path, row):
    with pytest.raises(LajilistaError):
        load(tmp_path, row)


@pytest.mark.parametrize(
    "body",
    [
        "Cantharellus_Cibarius,Cantharellus cibarius,,1,syötävä,,true\n",  # bad class_id
        "muu,Fungus aliquis,,1,ei ruokasieni,,true\n",  # muu is not on the list
        "a,A b,,1,herkku,,true\n",  # unknown group
        "a,A b,,1,syötävä,b,true\n",  # lookalike not on the list
        "a,A b,,1,syötävä,a,true\n",  # own class as lookalike
        "a,A b,,1,syötävä,,true\nb,A b,,2,syötävä,,true\n",  # same taxon twice
        "a,A b,,1,syötävä,,true\nb,A c,,1,syötävä,,true\n",  # same taxonKey twice
        "a,A b,,1,syötävä,,true\na,A c,,2,syötävä,,false\n",  # in_model differs in a class
        "a,Cortinarius,,1,tappava,,true\nb,Cortinarius caperatus,,2,syötävä,,true\n",  # genus overlap
    ],
)
def test_rule_violations(tmp_path, body):
    assert errors(tmp_path, body)


def test_merged_class_with_its_own_genus_is_fine(tmp_path):
    body = "a,Armillaria,,1,esikäsiteltävä,,true\na,Armillaria borealis,,2,esikäsiteltävä,,true\n"
    assert errors(tmp_path, body) == []


def test_empty_taxon_key_is_a_warning_unless_strict(tmp_path):
    body = FOOD.replace(",1,", ",,") + DEADLY
    assert errors(tmp_path, body) == []
    assert errors(tmp_path, body, require_keys=True)


def test_food_without_dangerous_lookalike_warns(tmp_path):
    _, warnings = validate(load(tmp_path, FOOD.replace("cortinarius-rubellus", "") + DEADLY))
    assert any("no dangerous lookalike" in w for w in warnings)


@pytest.mark.parametrize(
    "groups, expected",
    [
        (["syötävä"], "syötävä"),
        (["syötävä", "esikäsiteltävä"], "esikäsiteltävä"),
        (["esikäsiteltävä", "ei ruokasieni"], "ei ruokasieni"),
        (["syötävä", "myrkyllinen", "ei ruokasieni"], "myrkyllinen"),
        (["myrkyllinen", "tappava"], "tappava"),
    ],
)
def test_class_group_is_most_cautious(tmp_path, groups, expected):
    body = "".join(f"a,A s{i},,{i + 1},{g},,true\n" for i, g in enumerate(groups))
    assert class_group(classes(load(tmp_path, body))["a"]) == expected


def test_main_exit_code(tmp_path):
    path = tmp_path / "lajilista.csv"
    path.write_text(HEADER + FOOD + DEADLY, encoding="utf-8")
    assert main([str(path), "-q"]) == 0
    path.write_text(HEADER + FOOD, encoding="utf-8")
    assert main([str(path), "-q"]) == 1


@pytest.mark.parametrize("key", ["0", "١٢"])
def test_taxon_key_must_be_positive_ascii(tmp_path, key):
    with pytest.raises(LajilistaError):
        load(tmp_path, f"a,A b,,{key},syötävä,,true\n")


def test_esikasiteltava_lookalike_is_dangerous_only_to_syotava(tmp_path):
    body = (
        "a,A b,,1,esikäsiteltävä,b,true\nb,A c,,2,esikäsiteltävä,,true\nc,A d,,3,syötävä,b,true\n"
    )
    _, warnings = validate(load(tmp_path, body))
    assert any(w.startswith("class a: food mushroom with no dangerous") for w in warnings)
    assert not any(w.startswith("class c:") for w in warnings)


def test_dangerous_class_listed_only_by_another_dangerous_class_warns(tmp_path):
    body = DEADLY + "amanita-virosa,Amanita virosa,,3,tappava,cortinarius-rubellus,true\n"
    _, warnings = validate(load(tmp_path, body))
    assert any(w.startswith("class cortinarius-rubellus: dangerous") for w in warnings)
