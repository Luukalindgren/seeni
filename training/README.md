# seeni training

Python (uv) code for data download, training, evaluation and ONNX export. It runs on the Windows desktop in WSL2 Ubuntu. See phases #4–#8 and `docs/PLAN.md`.

```sh
cd training
uv sync
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name())"
uv run pytest
```

PyTorch comes from PyPI, whose Linux wheels are CUDA builds.

Data (images, manifest, embeddings, checkpoints) lives in `~/seeni-data` on the WSL filesystem, never in git. Set `SEENI_DATA` to another absolute path to move it; `seeni.paths.data_dir()` refuses paths inside the repo or under `/mnt`.
