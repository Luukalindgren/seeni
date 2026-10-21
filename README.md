# seeni

Offline-capable mushroom identifier for Finnish species. Image classification runs entirely in the browser as a PWA, so there is no server and no uploads.

> **Seeni never tells you whether a mushroom is edible.** It suggests candidate species, always shows their dangerous lookalikes, and walks you through checks that help tell them apart. Never eat a mushroom based on this app.

Status: a working first version for personal use, not a release. A trained EfficientNet-B0 model runs in the browser and recognises 43 Finnish mushroom classes plus an unknown class `muu`. **The species texts, lookalikes and checks are unreviewed drafts**: every species entry needs an expert review before release (hard rule 8 in `CLAUDE.md`), and the release checklist (#11) is still open.

The current build is at <https://luukalindgren.github.io/seeni/> (later seeni.fi) and is redeployed automatically on every merge to `main`. It can be added to the home screen and then works offline.

## How it works

1. A model is trained on CC0 and CC-BY licensed mushroom photos from [GBIF](https://www.gbif.org/) on a desktop GPU (`training/`).
2. It is exported to ONNX together with its class list and preprocessing settings (`web/public/models/vN/`).
3. The web app downloads the model once, caches it as a PWA, and runs it in a Web Worker with onnxruntime-web on WebAssembly. Photos stay on your device, and identification works offline.
4. Results are shown as candidates with their dangerous lookalikes, an example photo of each species and verification checks from hand-curated species data (`species/`). When the model is not sure enough, the app says it does not recognise the mushroom. Every species entry must be reviewed by an expert before release.

The first model (v1) gets 86.7 % top-1 and 95.6 % top-3 on the held-out test set, with calibrated probabilities (temperature scaling) and an unknown threshold chosen to keep dangerous confusions rare. The evaluation reports are in [`docs/reports/`](docs/reports/) (v1 in `phase7.md`), and the app loads the version named by `MODEL_VERSION` in `web/src/modelFiles.ts`.

## The app

- A warning first: Seeni is an aid, not an answer to whether a mushroom can be eaten.
- Take a photo (phone camera, or the webcam on a computer), pick one from the gallery, drop it on the page or paste it.
- The result shows the most likely species with an example photo, its group, its dangerous lookalikes and checks that tell them apart.
- The look is called "Metsänpohja": a warm, light forest-floor palette with quiet animations that turn off under reduced motion. Phones get a one-column layout and large screens a two-column result.
- Photographers of the training and example photos are credited under "Tietoa ja lähteet".

## Repository layout

| Path | What |
| --- | --- |
| `training/` | Python (uv, PyTorch, timm): data download, training, evaluation, ONNX export |
| `data-meta/` | Species list, train/val/test split and attribution data (small files only) |
| `species/` | `species.json`: species information and verification checks |
| `web/` | Vite + TypeScript PWA, deployed to GitHub Pages by `.github/workflows/pages.yml` |
| `docs/PLAN.md` | The full step-by-step plan (in Finnish) |
| `docs/reports/` | Evaluation reports of each model |
| `docs/ssh.md` | SSH from the Mac to the training desktop over Tailscale |
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
npm run dev        # development server
npm test           # unit tests
npm run test:e2e   # builds, then runs the parity and offline tests in Chromium
```

CI runs the training and web tests on every pull request. A merge to `main` builds the app and publishes it to GitHub Pages.

## Plan and progress

The work is split into eleven phases described in [`docs/PLAN.md`](docs/PLAN.md). Each phase is also a GitHub issue with the same number (phase 6 is #6), and the checklist in [`CLAUDE.md`](CLAUDE.md#status) shows which are done.

## License

- **Code** is licensed under the [MIT License](LICENSE).
- **Species data** (`species/`, `data-meta/lajilista.csv`, `data-meta/split.csv`) is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/), with credit to the sources listed in `ATTRIBUTIONS.md`.
- **Model files** (`web/public/models/`) are licensed under CC BY 4.0. They start from timm's `efficientnet_b0.ra_in1k` weights, which are Apache-2.0 (checked from the model card, #11).
- **Attribution data** in `data-meta/` reproduces each photographer's credit and license, and is not relicensed.
- **Training images** belong to their photographers and are used under their own CC0 or CC-BY licenses. They are not distributed in this repository.

Photographers, data sources, pretrained weights and third-party software are credited in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).
