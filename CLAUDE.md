# seeni

Offline-capable mushroom identifier for Finnish species. Image classification runs entirely in the browser as a PWA. There is no backend.

The full step-by-step plan is in `docs/PLAN.md` (in Finnish). Read the relevant phase before starting work on it.

## Architecture

| Path | What | Where it runs |
| --- | --- | --- |
| `training/` | Python (uv, PyTorch, timm): data download, training, evaluation, ONNX export | Windows desktop, WSL2 Ubuntu, NVIDIA RTX (2070 or 3070, 8 GB VRAM) |
| `data-meta/` | `lajilista.csv`, `split.csv`, attribution data. Small files only | – |
| `species/` | `species.json`, hand-curated species info and verification checks | – |
| `web/` | Vite + TypeScript PWA, onnxruntime-web | User's browser, deployed to GitHub Pages via Actions |
| `web/public/models/vN/` | `model.onnx`, `labels.json`, `preprocess.json`, `calibration.json` | Produced by `training/`, read by `web/` |

Hosting: GitHub Pages at `https://luukalindgren.github.io/seeni/`, so Vite `base` is `'/seeni/'`. Later moving to the custom domain seeni.fi.

## Hard rules

1. **Image licenses:** use only images licensed CC0 or CC-BY. Take the license per image from GBIF `multimedia.txt`; the occurrence license is not the image license. Store license, rights holder and source URL for every image in the manifest.
2. **No data in git:** never commit images, datasets or checkpoints. Data lives in `~/seeni-data` on the WSL filesystem (never under `/mnt/c`).
3. **Split by observation:** train/val/test split is by observation (`gbifID`), never by image.
4. **One preprocessing definition:** preprocessing is defined in one place in `training/` and exported to `preprocess.json`. The web app reads it from there and never hardcodes values. Eval transform: resize shorter side to 256 → center crop 224 → RGB / 255 → normalize with mean/std → NCHW float32.
5. **Class order:** comes only from `labels.json` written at training time. The web app never regenerates or re-sorts it.
6. **No hue jitter** in augmentation. Colour is a diagnostic feature of mushrooms.
7. **Parity test:** any change to the model, export or preprocessing must keep the parity test green. Python golden outputs live in `web/tests/fixtures/`, and Playwright compares the browser's top-5 against them.
8. **Safety:**
   - The app never states that a mushroom is edible.
   - Poisonous lookalikes of every candidate are always shown.
   - A `species.json` entry needs expert review (field `tarkistanut`) before release. LLM-drafted content is a draft only.
9. **Privacy:** user images never leave the device. No tracking analytics.
10. **Licensing:** code is MIT (root `LICENSE`). Model files and species data are licensed separately (CC BY 4.0) and documented in README and `ATTRIBUTIONS.md`.

## Technical notes

**Training**
- Use bf16 autocast on an RTX 3070, or fp16 with GradScaler on a 2070.
- Run long jobs in tmux.
- Start with a frozen DINOv2 embedding + linear-probe baseline before full fine-tuning.
- First full model: EfficientNet-B0 at 224 px.

**Evaluation**
- The key safety metric is how often a poisonous species gets an edible top-1 prediction.
- Calibrate probabilities with temperature scaling and store `T` in `calibration.json`.

**Export**
- ONNX opset 17, then fp16 with `keep_io_types=True`.
- Verify against PyTorch on test images before publishing.

**Web app**
- onnxruntime-web with execution providers `['webgpu', 'wasm']`, running in a Web Worker.
- Serve the wasm files from the app's own origin so offline works.
- Read images with `createImageBitmap(file, { imageOrientation: 'from-image' })`.

**PWA**
- Use vite-plugin-pwa.
- Raise `maximumFileSizeToCacheInBytes` to about 50 MB so the model gets precached (the default is 2 MiB).
- Version models by folder (`v1`, `v2`).

## Status

- [x] Repo created
- [ ] 1. Desktop setup: WSL2, CUDA, uv, Tailscale + SSH
- [ ] 2. Repo structure
- [ ] 3. Species list
- [ ] 4. GBIF data download + license filtering
- [ ] 5. Split + DINOv2 baseline
- [ ] 6. Fine-tuning
- [ ] 7. Evaluation, calibration, unknown class
- [ ] 8. ONNX export + golden fixtures
- [ ] 9. Species database + verification flow
- [ ] 10. Web app, PWA, GitHub Pages
- [ ] 11. Release checklist
