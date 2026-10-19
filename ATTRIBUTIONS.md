# Attributions

Seeni is built on photos, data and software made by others. This file credits them and states the licenses that apply. See [`README.md`](README.md#license) for the license of Seeni's own code, model and species data.

Sections marked *pending* are filled in by the phase in brackets. Nothing in them is in use yet.

## Training images

*Pending (#4, #11).*

The model is trained on mushroom photos shared through [GBIF](https://www.gbif.org/) under CC0 or CC-BY licenses. Each photo's license is taken from GBIF `multimedia.txt`, not from the occurrence record. The photos are not distributed in this repository or with the app, but the model is derived from them.

- GBIF occurrence download: DOI to be added
- Photographers and licenses: a full list is generated from the image manifest and published on the app's attributions page

## Images committed to this repository

Images in this repository that are not Seeni's own work, such as test fixtures (`web/tests/fixtures/`) and verification check pictures (`species/`), must be CC0 or CC-BY and are listed here.

| File | Author | License | Source |
| --- | --- | --- | --- |
| *none yet* | | | |

## Pretrained weights

*Pending (#5, #6).* Check each license from the model card before release.

| Model | Used for | Source | License |
| --- | --- | --- | --- |
| DINOv2 | Baseline only, not shipped (#5) | [facebookresearch/dinov2](https://github.com/facebookresearch/dinov2) | To be checked |
| EfficientNet-B0 | Starting point of the shipped model (#6) | [timm](https://github.com/huggingface/pytorch-image-models) | To be checked |

## Software

Libraries shipped with the web app:

| Library | License |
| --- | --- |
| *Pending (#10):* [onnxruntime-web](https://github.com/microsoft/onnxruntime) | MIT |
| *Pending (#10):* [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) and Workbox | MIT |

Tools used to build the app and train the model, not shipped:

| Tool | License |
| --- | --- |
| [PyTorch](https://github.com/pytorch/pytorch) | BSD-3-Clause |
| [torchvision](https://github.com/pytorch/vision) | BSD-3-Clause |
| [timm](https://github.com/huggingface/pytorch-image-models) | Apache-2.0 |
| [Vite](https://github.com/vitejs/vite) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
