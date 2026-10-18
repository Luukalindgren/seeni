"""Where seeni keeps the data that never goes into git (hard rule 2)."""

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATA_DIR = "~/seeni-data"


def data_dir() -> Path:
    """Return the directory for images, manifests, embeddings and checkpoints.

    It is SEENI_DATA, or ~/seeni-data when SEENI_DATA is unset or empty. Raises
    ValueError for a relative path, a path inside the repo, or a path on the
    Windows disk (/mnt/...), which would put data in git or slow training down.
    """
    path = Path(os.environ.get("SEENI_DATA") or DEFAULT_DATA_DIR).expanduser()
    if not path.is_absolute():
        raise ValueError(f"SEENI_DATA must be an absolute path, got {path}")
    path = path.resolve()
    if path.is_relative_to(REPO_ROOT):
        raise ValueError(f"data directory {path} is inside the repo")
    if path.is_relative_to("/mnt"):
        raise ValueError(f"data directory {path} is on the Windows disk; use the WSL filesystem")
    return path
