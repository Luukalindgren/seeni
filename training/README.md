# seeni training

Python (uv) code for data download, training, evaluation and ONNX export. See phases #4–#8 and `docs/PLAN.md`.

## Where it runs

Training runs on the Windows 11 desktop in WSL2 Ubuntu 24.04: NVIDIA RTX 3070 (8 GB VRAM, sm_86), 32 GB RAM. Setup steps (driver, `.wslconfig`, Tailscale + SSH) are in `docs/PLAN.md` phase 1 and issue #1.

- Install the NVIDIA driver on Windows only, never inside WSL. The current PyTorch wheels are CUDA 13 builds and need a driver from the R580 series or newer.
- Clone the repo onto the WSL filesystem (e.g. `~/seeni`), not under `/mnt/c`.
- The lock also resolves on Apple Silicon Macs (see `[tool.uv] environments` in `pyproject.toml`), so code and CPU-only tests can be run there. Training needs the desktop.

## Setup

```sh
cd training
uv sync
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name())"
uv run pytest
uv run ruff check .
```

PyTorch comes from PyPI, whose Linux wheels are CUDA builds. Keep it there: cloud agent sessions cannot reach download.pytorch.org, so a lock that needs it cannot be synced there. After upgrading torch, `tests/test_torch_build.py` checks that the build still has sm_86 or sm_80 code for the RTX 3070.

Add dependencies with `uv add` (or `uv add --dev`) and commit `uv.lock`.

## Data

Data (images, manifest, embeddings, checkpoints) lives in `~/seeni-data` on the WSL filesystem, never in git. Set `SEENI_DATA` to another absolute path to move it; `seeni.paths.data_dir()` refuses paths inside the repo or under `/mnt`. Code gets the directory from `data_dir()`, never from a hardcoded path.

## Precision

- Training uses bf16 autocast (the RTX 3070 supports bf16), without `GradScaler`.
- Evaluation, temperature calibration and the golden outputs for the web parity test run in fp32, so `T` and the parity fixtures are not skewed by bf16 rounding.

## Long jobs

Run training in `tmux` so it survives a dropped SSH connection, and turn off Windows sleep on mains power.

## Species list (phase 3)

```sh
uv run python -m seeni.lajilista            # validate data-meta/lajilista.csv
uv run python -m seeni.gbif_match           # GBIF match report to ~/seeni-data/lajilista_gbif.csv
uv run python -m seeni.gbif_match --fill    # also fill empty taxonKeys whose match has no flags
```

`gbif_match` needs `api.gbif.org`, so run it on the desktop. Check every row of the report by hand before relying on a key.

## GBIF images (phase 4)

Needs `api.gbif.org` and a GBIF account, so run it on the desktop. Put the credentials in the WSL shell environment (e.g. `~/.bashrc`), never in the repo:

```sh
export GBIF_USER=...
export GBIF_PWD=...
export GBIF_EMAIL=...   # notification when the download is ready, and contact in the User-Agent
```

Then, from `training/`, in tmux:

```sh
uv run python -m seeni.gbif_download request --dry-run   # check the request body
uv run python -m seeni.gbif_download request             # every taxonKey, FI/SE/NO/EE, photographed human observations
uv run python -m seeni.gbif_download fetch --wait        # archive to <data dir>/gbif/, DOI to data-meta/gbif_download.json
uv run python -m seeni.gbif_images index                 # CC0/CC-BY only, ≤ 1500 per taxon, ≤ 3 per observation
uv run python -m seeni.gbif_images download              # resize to 512 px, write manifest.parquet
uv run python -m seeni.gbif_images dedup                 # exclude duplicate photos
uv run python -m seeni.gbif_images sheets                # contact sheets under <data dir>/review/
uv run python -m seeni.gbif_images report                # images per class, for issue #4
```

Every step can be re-run; `download` skips images already on disk. After browsing the contact sheets, add microscope shots, spore prints, drawings and other bad images to `<data dir>/exclude.csv` (`gbifID,n,reason`) and run `download` again: the manifest drops them and their files move to `<data dir>/unused/`. Commit `data-meta/gbif_download.json`, since the attributions cite its DOI.
