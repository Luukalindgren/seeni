# seeni

Offline-capable mushroom identifier for Finnish species. Image classification runs entirely in the browser as a PWA. There is no backend.

The full step-by-step plan is in `docs/PLAN.md` (in Finnish). Each phase is also a GitHub issue in English with the same number (phase 6 = #6), with tasks, dependencies and done criteria. Known problems in the plan are sub-issues of the phase they belong to. Read the issue and the matching `PLAN.md` section before starting work on a phase.

## Architecture

| Path | What | Where it runs |
| --- | --- | --- |
| `training/` | Python (uv, PyTorch, timm): data download, training, evaluation, ONNX export | Windows 11 desktop, WSL2 Ubuntu 24.04, NVIDIA RTX 3070 (8 GB VRAM, sm_86), 32 GB RAM |
| `data-meta/` | `lajilista.csv`, `split.csv`, attribution data. Small files only | – |
| `species/` | `species.json`, hand-curated species info and verification checks | – |
| `web/` | Vite + TypeScript PWA, onnxruntime-web | User's browser, deployed to GitHub Pages via Actions |
| `web/public/models/vN/` | `model.onnx`, `labels.json`, `preprocess.json`, `calibration.json` | Produced by `training/`, read by `web/` |

Hosting: GitHub Pages at `https://luukalindgren.github.io/seeni/`, so Vite `base` is `'/seeni/'`. `.github/workflows/pages.yml` deploys every push to `main`, so a merge goes live. Later moving to the custom domain seeni.fi.

## Hard rules

1. **Image licenses:** use only images licensed CC0 or CC-BY. Take the license per image from GBIF `multimedia.txt`; the occurrence license is not the image license. Store license, rights holder and source URL for every image in the manifest.
2. **No data in git:** never commit images, datasets or checkpoints. Data lives in `~/seeni-data` on the WSL filesystem (never under `/mnt/c`). `.gitignore` blocks the common image, data and checkpoint formats and re-includes only: the exported model in `web/public/models/vN/`, images under `web/`, `species/` and `docs/` (icons, check pictures, screenshots), test fixtures in `tests/fixtures/`, and attribution data in `data-meta/`. Committed images that are not our own work (fixtures, check pictures) must be CC0/CC-BY and credited in `ATTRIBUTIONS.md`. The ignore list is not exhaustive, so check `git status` before committing.
3. **Split by observation:** train/val/test split is by observation (`gbifID`), never by image.
4. **One preprocessing definition:** preprocessing is defined in one place in `training/` and exported to `preprocess.json`. The web app reads it from there and never hardcodes values. Eval transform: apply EXIF orientation → resize shorter side to 256 with antialiased bilinear interpolation (PIL's) → center crop 224 → RGB / 255 → normalize with mean/std → NCHW float32. The definition is `training/src/seeni/preprocess.py`; its `spec()` is the content of `preprocess.json`, including the resize method, so the browser implements the resize itself instead of relying on canvas scaling (#14).
5. **Classes:** every class has a stable string id: lowercase ASCII with hyphens, usually the scientific name (`cantharellus-cibarius`, genus-level `cortinarius`), and `muu` for the unknown class. An id never changes once a model has been trained with it, and a class whose taxa change gets a new id. Taxa of different classes never overlap, not even through a genus. `data-meta/lajilista.csv` has one row per taxon and is the source of truth for each class's taxa, group and lookalikes. Its `in_model` column marks the classes that are trained. Class order comes only from `labels.json`, written at training time: an ordered array of `{ "id", "taxonKeys" }` whose position is the model output index. The web app never regenerates or re-sorts it. References between classes (lookalikes, check answers) use class ids, never indices or taxonKeys.
6. **No hue jitter** in augmentation. Colour is a diagnostic feature of mushrooms.
7. **Parity test:** any change to the model, export or preprocessing must keep the parity test green. Python golden outputs live in `web/tests/fixtures/`, and Playwright compares the browser's top-5 against them.
8. **Safety:**
   - The app never states that a mushroom is edible.
   - Terms: a *food mushroom* is syötävä or esikäsiteltävä. A *dangerous lookalike* is myrkyllinen, tappava or esikäsiteltävä, because an esikäsiteltävä species mistaken for a syötävä one is eaten without pre-treatment.
   - Dangerous lookalikes of every candidate are always shown. Every dangerous lookalike is on `lajilista.csv`, even without images. One that is not a model class gets a warning-only record in `species.json` (its id is not in `labels.json`) and stays an open warning until a check rules it out. An answer rules out only the classes that the check lists, but not under that answer.
   - A merged class takes the most cautious group among its taxa: tappava > myrkyllinen > ei ruokasieni > esikäsiteltävä > syötävä, ordered by how strongly the group says not to eat. A class is syötävä only if all its taxa are syötävä. The per-taxon groups stay in `lajilista.csv`.
   - A `species.json` entry needs expert review (field `tarkistanut`) before release. LLM-drafted content is a draft only.
9. **Privacy:** user images never leave the device. No tracking analytics.
10. **Licensing:** code is MIT (root `LICENSE`). Model files and species data are licensed separately (CC BY 4.0) and documented in README and `ATTRIBUTIONS.md`.

## Technical notes

**Training**
- PyTorch comes from PyPI (`uv sync` in `training/`). Its Linux wheels are CUDA builds, currently CUDA 13, which needs a Windows NVIDIA driver from the R580 series or newer. Keep it on PyPI if you can: cloud agent sessions cannot reach download.pytorch.org, so a lock that needs it cannot be synced there. After upgrading torch, `tests/test_torch_build.py` checks that the build still runs on the RTX 3070 (sm_86, or sm_80 code).
- Get the data directory from `seeni.paths.data_dir()`, never from a hardcoded path.
- The desktop GPU is an RTX 3070, which supports bf16: train with bf16 autocast, no GradScaler. Evaluation and temperature calibration run in fp32. The golden outputs for the parity test come from the shipped fp16 ONNX model (fp32 inputs and outputs), since that is what the browser runs; never from bf16.
- Run long jobs in tmux.
- Start with a frozen DINOv2 embedding + linear-probe baseline before full fine-tuning.
- First full model: EfficientNet-B0 at 224 px.

**Evaluation**
- The key safety metric is dangerous confusion, counted per taxon on wrong top-1 classes: a myrkyllinen or tappava taxon whose top-1 class contains a food mushroom, or an esikäsiteltävä taxon whose top-1 class contains a syötävä taxon. Full definition in `PLAN.md` phase 7.
- Calibrate probabilities with temperature scaling and store `T` in `calibration.json`.

**Export**
- ONNX opset 17, then fp16 with `keep_io_types=True`.
- Verify against PyTorch on test images before publishing.

**Web app**
- onnxruntime-web on WASM only (`onnxruntime-web/wasm`), running in a Web Worker. The WebGPU bundle was dropped in #41: its runtime is about twice the size, and EfficientNet-B0 runs well under a second on WASM.
- Serve the wasm files from the app's own origin so offline works.
- Read images with `createImageBitmap(file, { imageOrientation: 'from-image' })`.

**PWA**
- Use vite-plugin-pwa.
- Raise `maximumFileSizeToCacheInBytes` to about 50 MB so the model gets precached (the default is 2 MiB).
- Version models by folder (`v1`, `v2`).

## Workflow

- Every change goes through a pull request. Never push to `main` directly.
- Before merging, run `/code-review` on the PR and fix the most critical findings (correctness, safety, hard-rule violations) in the same PR. Lesser findings may stay, with a one-line reason in the PR.
- Link the PR to its issue (`Closes #N` or `Refs #N`).

## Status

- [x] Repo created
- [x] 1. Desktop setup: WSL2, CUDA, uv, Tailscale + SSH (#1)
- [x] 2. Repo structure (#2)
- [ ] 3. Species list (#3)
- [x] 4. GBIF data download + license filtering (#4)
- [x] 5. Split + DINOv2 baseline (#5)
- [x] 6. Fine-tuning (#6)
- [x] 7. Evaluation, calibration, unknown class (#7)
- [x] 8. ONNX export + golden fixtures (#8)
- [ ] 9. Species database + verification flow (#9)
- [x] 10. Web app, PWA, GitHub Pages (#10)
- [ ] 11. Release checklist (#11)
