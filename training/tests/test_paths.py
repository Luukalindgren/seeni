from pathlib import Path

from seeni.paths import DATA_DIR

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_data_dir_is_outside_repo():
    assert not DATA_DIR.resolve().is_relative_to(REPO_ROOT)
