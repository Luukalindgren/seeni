# seeni

Offline-capable mushroom identifier for Finnish species. Image classification runs entirely in the browser as a PWA, so there is no server and no uploads.

> **Seeni never tells you whether a mushroom is edible.** It suggests candidate species, always shows their dangerous lookalikes, and walks you through checks that help tell them apart. Never eat a mushroom based on this app.

Status: early development. There is no trained model or published app yet. The planned address is `https://luukalindgren.github.io/seeni/`, later seeni.fi.

## How it works

1. A model is trained on CC0 and CC-BY licensed mushroom photos from [GBIF](https://www.gbif.org/) on a desktop GPU (`training/`).
2. It is exported to ONNX together with its class list and preprocessing settings (`web/public/models/vN/`).
3. The web app downloads the model once, caches it, and runs it in a Web Worker with onnxruntime-web (WebGPU, falling back to WASM). Photos stay on your device, and identification works offline.
4. Results are shown as candidates with their dangerous lookalikes and verification checks from hand-curated species data (`species/`). Every species entry must be reviewed by an expert before release.

## Repository layout

| Path | What |
| --- | --- |
| `training/` | Python (uv, PyTorch, timm): data download, training, evaluation, ONNX export |
| `data-meta/` | Species list, train/val/test split and attribution data (small files only) |
| `species/` | `species.json`: species information and verification checks |
| `web/` | Vite + TypeScript PWA, deployed to GitHub Pages |
| `docs/PLAN.md` | The full step-by-step plan (in Finnish) |
| `CLAUDE.md` | Binding project rules: image licenses, preprocessing, class ids, safety |

Training images, datasets and checkpoints are never committed. They live in `~/seeni-data` on the training machine. The only exceptions are the exported model, app and documentation images, and test fixtures, listed in `CLAUDE.md` hard rule 2.

## Getting started

Training (Python 3.12 and [uv](https://docs.astral.sh/uv/); training itself needs Linux or WSL2 with an NVIDIA GPU, and development also works on an Apple Silicon Mac):

```sh
cd training
uv sync
uv run pytest
```

See [`training/README.md`](training/README.md) for the GPU check and the data directory.

Web app (Node 22.12 or newer):

```sh
cd web
npm ci
npm run dev
```

## Plan and progress

The work is split into eleven phases described in [`docs/PLAN.md`](docs/PLAN.md). Each phase is also a GitHub issue with the same number (phase 6 is #6), and the checklist in [`CLAUDE.md`](CLAUDE.md#status) shows which are done.

## License

- **Code** is licensed under the [MIT License](LICENSE).
- **Species data** (`species/`, `data-meta/lajilista.csv`, `data-meta/split.csv`) is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/), with credit to the sources listed in `ATTRIBUTIONS.md`.
- **Model files** (`web/public/models/`) will be released under CC BY 4.0, provided the licenses of the pretrained weights they start from allow it. Those licenses are checked before the first model is published (#6, #11).
- **Attribution data** in `data-meta/` reproduces each photographer's credit and license, and is not relicensed.
- **Training images** belong to their photographers and are used under their own CC0 or CC-BY licenses. They are not distributed in this repository.

Photographers, data sources, pretrained weights and third-party software are credited in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).
