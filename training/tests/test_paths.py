import pytest

from seeni.paths import REPO_ROOT, data_dir


@pytest.mark.parametrize("value", [None, ""])
def test_default_when_unset_or_empty(monkeypatch, tmp_path, value):
    monkeypatch.setenv("HOME", str(tmp_path))
    if value is None:
        monkeypatch.delenv("SEENI_DATA", raising=False)
    else:
        monkeypatch.setenv("SEENI_DATA", value)
    assert data_dir() == tmp_path / "seeni-data"


def test_absolute_override(monkeypatch, tmp_path):
    monkeypatch.setenv("SEENI_DATA", str(tmp_path / "data"))
    assert data_dir() == tmp_path / "data"


@pytest.mark.parametrize(
    "value",
    ["seeni-data", str(REPO_ROOT / "data"), str(REPO_ROOT), "/mnt/c/seeni-data"],
)
def test_rejects_relative_repo_and_windows_paths(monkeypatch, value):
    monkeypatch.setenv("SEENI_DATA", value)
    with pytest.raises(ValueError):
        data_dir()
