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
