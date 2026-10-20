import pytest

from seeni.split import assign, observations, read_split, write_split


def manifest(counts: dict[str, int], per_obs: int = 2) -> list[dict]:
    out, gbif_id = [], 1000
    for class_id, n in counts.items():
        for _ in range(n):
            gbif_id += 1
            out += [{"gbifID": gbif_id, "class_id": class_id} for _ in range(per_obs)]
    return out


def test_stratified_80_10_10_by_observation():
    obs = observations(manifest({"a": 100, "b": 20}))
    split = assign(obs, {})
    assert set(split) == set(obs)
    for class_id, n in {"a": 100, "b": 20}.items():
        sets = [s for c, s in split.values() if c == class_id]
        assert sets.count("train") == n * 8 // 10
        assert sets.count("val") == sets.count("test") == n // 10


def test_small_class_gets_val_and_test():
    split = assign(observations(manifest({"a": 5})), {})
    sets = sorted(s for _, s in split.values())
    assert sets == ["test", "train", "train", "train", "val"]


def test_same_seed_same_split_other_seed_differs():
    obs = observations(manifest({"a": 50}))
    assert assign(obs, {}, seed=0) == assign(obs, {}, seed=0)
    assert assign(obs, {}, seed=0) != assign(obs, {}, seed=1)


def test_existing_assignments_are_kept():
    obs = observations(manifest({"a": 50}))
    first = assign(obs, {})
    more = observations(manifest({"a": 60}))
    second = assign(more, first)
    assert all(second[g] == first[g] for g in first)
    assert len(second) == 60


def test_observation_in_two_classes_is_an_error():
    with pytest.raises(ValueError):
        observations([{"gbifID": 1, "class_id": "a"}, {"gbifID": 1, "class_id": "b"}])


def test_class_change_is_an_error():
    with pytest.raises(ValueError):
        assign({1: "b"}, {1: ("a", "train")})


def test_round_trip(tmp_path):
    split = assign(observations(manifest({"a": 10})), {})
    path = tmp_path / "split.csv"
    write_split(split, path)
    assert read_split(path) == split
