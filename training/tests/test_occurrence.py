from datetime import date

from seeni.lajilista import Row
from seeni.occurrence import REGIONS, table


def test_table_counts_per_region_and_month():
    calls = []

    def fetch(path, params):
        calls.append((path, params))
        lat = dict(params)["decimalLatitude"]
        north = lat.startswith("65")
        return {
            "facets": [
                {"field": "MONTH", "counts": [{"name": "9", "count": 5 if north else 40}]},
                {"field": "OTHER", "counts": [{"name": "1", "count": 99}]},
            ]
        }

    rows = [
        Row(1, "a", "A a", "a", 10, "syötävä", (), True),
        Row(2, "a", "A b", "a", 11, "syötävä", (), True),
        Row(3, "b", "B b", "b", None, "tappava", (), False),
    ]
    t = table(rows, fetch, date(2026, 10, 21))
    assert list(t["classes"]) == ["a"]
    south, _, north = t["classes"]["a"]
    assert south[8] == 40 and north[8] == 5 and sum(south) == 40
    assert t["regions"] == REGIONS
    # Both taxa in one request, licensed occurrences in Finland only.
    params = calls[0][1]
    assert ("taxonKey", 10) in params and ("taxonKey", 11) in params
    assert ("country", "FI") in params and ("license", "CC_BY_4_0") in params
    assert len(calls) == len(REGIONS)
