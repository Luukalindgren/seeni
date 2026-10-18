"""Where seeni keeps the data that never goes into git (hard rule 2)."""

import os
from pathlib import Path

# Images, manifests, embeddings and checkpoints. Keep it on the WSL filesystem,
# never under /mnt/c. Override with the SEENI_DATA environment variable.
DATA_DIR = Path(os.environ.get("SEENI_DATA", "~/seeni-data")).expanduser()
