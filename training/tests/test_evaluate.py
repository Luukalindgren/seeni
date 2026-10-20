import math

import torch

from seeni.evaluate import (
    ClassInfo,
    candidates,
    decide,
    expected_calibration_error,
    fit_temperature,
    outcomes,
    pick_threshold,
    safety,
    unknown_metrics,
)
from seeni.lajilista import Row


def row(line, class_id, key, group, lookalikes=(), in_model=True):
    return Row(line, class_id, f"X {class_id}", class_id, key, group, tuple(lookalikes), in_model)


ROWS = [
    row(1, "food", 1, "syötävä", ["deadly"]),
    row(2, "food2", 2, "syötävä"),
    row(3, "deadly", 3, "tappava", ["food"]),
    row(4, "pre", 4, "esikäsiteltävä"),
    row(5, "outside", 5, "myrkyllinen", ["food"], in_model=False),
]
CLASSES = ["food", "food2", "deadly", "pre", "muu"]
GROUPS = {r.taxon_key: r.ryhma for r in ROWS}
INFO = ClassInfo.from_rows(ROWS)


def test_fit_temperature_recovers_the_scale():
    torch.manual_seed(0)
    true_logits = torch.randn(4000, 5) * 2
    y = torch.distributions.Categorical(logits=true_logits).sample()
    t = fit_temperature(true_logits * 3, y)
    assert math.isclose(t, 3, rel_tol=0.1)


def test_calibration_error_is_zero_when_confidence_matches():
    probs = torch.tensor([[0.5, 0.5], [0.5, 0.5]])
    assert expected_calibration_error(probs, torch.tensor([0, 1])) == 0.0


def test_candidates_skip_muu_and_stop_at_95_percent():
    p = torch.tensor([0.5, 0.02, 0.4, 0.06, 0.02])
    assert candidates(p, unknown=4) == [0, 2, 3]
    assert candidates(torch.tensor([0.96, 0.01, 0.01, 0.01, 0.01]), unknown=4) == [0]


def test_decide_says_not_sure_for_muu_or_a_low_top_class():
    assert decide(torch.tensor([0.1, 0.1, 0.1, 0.1, 0.6]), 4, 0.0) is None
    assert decide(torch.tensor([0.4, 0.3, 0.3, 0.0, 0.0]), 4, 0.5) is None
    assert decide(torch.tensor([0.6, 0.4, 0.0, 0.0, 0.0]), 4, 0.5) == [0, 1]


def test_lookalike_warnings_cover_only_dangerous_lookalikes():
    assert INFO.warn["food"] == {"deadly"}
    assert INFO.warn["deadly"] == set()  # food is not a dangerous lookalike
    assert INFO.shown(["food"]) == {"food", "deadly"}


def item(class_id, key, kind=None):
    return {"class_id": class_id, "taxonKey": key, "kind": kind}


def probs(*rows):
    return torch.tensor(rows)


def test_outcomes_count_dangerous_confusions_and_warnings():
    items = [
        item("deadly", 3),  # called food: dangerous, but food warns about deadly
        item("deadly", 3),  # called food2: dangerous and nothing warns
        item("deadly", 3),  # called food2 but unsure: not answered
        item("pre", 4),  # called food2: case (b)
        item("food", 1),  # called deadly: wrong, not dangerous
        item("outside", 5),  # called food: dangerous, food warns about deadly only
    ]
    p = probs(
        [0.9, 0.0, 0.1, 0.0, 0.0],
        [0.0, 0.96, 0.04, 0.0, 0.0],
        [0.0, 0.4, 0.3, 0.3, 0.0],
        [0.0, 0.96, 0.0, 0.04, 0.0],
        [0.1, 0.0, 0.9, 0.0, 0.0],
        [0.9, 0.0, 0.0, 0.0, 0.1],
    )
    res = outcomes(p, items, CLASSES, INFO, GROUPS, threshold=0.5)
    assert [o.danger for o in res] == ["a", "a", "a", "b", "", "a"]
    assert [o.answered for o in res] == [True, True, False, True, True, True]
    # The first is warned (deadly is food's lookalike) and in the candidates anyway.
    assert [o.residual for o in res] == [False, True, False, True, False, True]
    s = safety(res[:5])
    assert s["a"] == {
        "images": 3,
        "raw": 3,
        "after_threshold": 2,
        "after_threshold_and_warnings": 1,
        "raw_rate": 1.0,
        "after_threshold_rate": 2 / 3,
        "residual_rate": 1 / 3,
    }
    assert s["b"]["after_threshold_and_warnings"] == 1


def test_unknown_metrics_for_muu_images():
    items = [item("muu", 99, "fungi"), item("muu", 98, "fungi"), item("muu", 97, "other")]
    p = probs(
        [0.1, 0.0, 0.0, 0.0, 0.9],
        [0.8, 0.0, 0.0, 0.0, 0.2],
        [0.0, 0.0, 0.0, 0.0, 1.0],
    )
    u = unknown_metrics(outcomes(p, items, CLASSES, INFO, GROUPS, 0.5), items, INFO)
    assert u["muu_fungi"] == {"images": 2, "not_sure": 0.5, "answered_as_food_class": 0.5}
    assert u["muu_other"]["not_sure"] == 1.0


def test_pick_threshold_takes_the_lowest_that_meets_the_rule():
    curve = [
        {"threshold": 0.0, "residual_a": 3, "residual_b": 1, "at_risk": 100},
        {"threshold": 0.1, "residual_a": 1, "residual_b": 0, "at_risk": 100},
        {"threshold": 0.2, "residual_a": 0, "residual_b": 0, "at_risk": 100},
    ]
    assert pick_threshold(curve, 0.0) == 0.2
    assert pick_threshold(curve, 0.01) == 0.1
    assert pick_threshold(curve, 0.05) == 0.0
    curve[0]["muu_fungi_food"] = 0.2
    assert pick_threshold(curve, 0.05, 0.1) == 0.1
