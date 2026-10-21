# Attributions

Seeni is built on photos, data and software made by others. This file credits them and states the licenses that apply. See [`README.md`](README.md#license) for the license of Seeni's own code, model and species data.

Sections marked *pending* are completed by the issue in brackets. The species list and species data they cover are already used by the published app; their source licenses are checked before release (#11).

## Training images

The model is trained on photos shared through [GBIF](https://www.gbif.org/) under CC0 or CC-BY licenses: mushrooms, and for the unknown class `muu` also other fungi and non-fungi such as moss, cones, leaves and plants (#7). Every photographer is credited, whatever the class. Each photo's license is taken from GBIF `multimedia.txt`, not from the occurrence record. The photos are not distributed in this repository or with the app, but the model is derived from them.

- GBIF occurrence downloads: species images GBIF.org (20 October 2026) https://doi.org/10.15468/dl.fadmpu; unknown class `muu` GBIF.org (20 October 2026) https://doi.org/10.15468/dl.3x49qy (both recorded in `data-meta/gbif_download.json`)
- Photographers and licenses: 29 858 images by 988 rights holders (28 178 CC-BY-4.0, 1 680 CC0-1.0). `seeni.attributions` generates the list from the image manifests: per rights holder in `web/public/attributions.json`, shown in the app under "Tietoa ja lähteet", and per image (with its GBIF record and source URL) in `data-meta/attributions.parquet`.

## Images committed to this repository

Any image in this repository that is not Seeni's own work must be CC0 or CC-BY and is listed here. This covers test fixtures (any `tests/fixtures/` folder) and images under `web/`, `species/` and `docs/`, such as verification check pictures.

Golden test fixtures for the parity test (#8), photos from the test set, resized to 512 px:

| File | Author | License | Source |
| --- | --- | --- | --- |
| `web/tests/fixtures/images/1825514568_6b6b5c2f2f.jpg` | Edvin W. Johannesen | CC-BY-4.0 | [GBIF 1825514568](https://www.gbif.org/occurrence/1825514568) |
| `web/tests/fixtures/images/3345075329_9ae2b10657.jpg` | Grete Strømsøe | CC-BY-4.0 | [GBIF 3345075329](https://www.gbif.org/occurrence/3345075329) |
| `web/tests/fixtures/images/6509447648_53910f941e.jpg` | Turid Helland | CC-BY-4.0 | [GBIF 6509447648](https://www.gbif.org/occurrence/6509447648) |
| `web/tests/fixtures/images/3902687238_108eefcd58.jpg` | Andreas Schneider | CC-BY-4.0 | [GBIF 3902687238](https://www.gbif.org/occurrence/3902687238) |
| `web/tests/fixtures/images/4906525380_8bb8a2a5c1.jpg` | Nina Fiskerstrand | CC-BY-4.0 | [GBIF 4906525380](https://www.gbif.org/occurrence/4906525380) |
| `web/tests/fixtures/images/1825461784_fabbfc8795.jpg` | Herdis Torsvik | CC-BY-4.0 | [GBIF 1825461784](https://www.gbif.org/occurrence/1825461784) |
| `web/tests/fixtures/images/1933241549_d85735d691.jpg` | Nils Edvard Stokke | CC-BY-4.0 | [GBIF 1933241549](https://www.gbif.org/occurrence/1933241549) |
| `web/tests/fixtures/images/2332763687_13ebb07747.jpg` | Bjørn Eidhammer | CC-BY-4.0 | [GBIF 2332763687](https://www.gbif.org/occurrence/2332763687) |
| `web/tests/fixtures/images/2404829784_7b1d4788b9.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2404829784](https://www.gbif.org/occurrence/2404829784) |
| `web/tests/fixtures/images/2311308865_49672be74e.jpg` | Niklas Wahlberg | CC0-1.0 | [GBIF 2311308865](https://www.gbif.org/occurrence/2311308865) |
| `web/tests/fixtures/images/2399024719_6f267ae283.jpg` | Gunvor Bollingmo | CC-BY-4.0 | [GBIF 2399024719](https://www.gbif.org/occurrence/2399024719) |
| `web/tests/fixtures/images/6543661534_ad51590436.jpg` | Rune Zakariassen | CC-BY-4.0 | [GBIF 6543661534](https://www.gbif.org/occurrence/6543661534) |
| `web/tests/fixtures/images/2399204317_8b2e5f0f13.jpg` | Christian Kortner | CC-BY-4.0 | [GBIF 2399204317](https://www.gbif.org/occurrence/2399204317) |
| `web/tests/fixtures/images/2399768854_3c38548cbb.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2399768854](https://www.gbif.org/occurrence/2399768854) |
| `web/tests/fixtures/images/3924311384_75e4b57cb2.jpg` | Perry Gunnar Larsen | CC-BY-4.0 | [GBIF 3924311384](https://www.gbif.org/occurrence/3924311384) |
| `web/tests/fixtures/images/3898901380_935e1cee5e.jpg` | Jan Alsvik | CC-BY-4.0 | [GBIF 3898901380](https://www.gbif.org/occurrence/3898901380) |
| `web/tests/fixtures/images/4930092317_56c4bbe814.jpg` | Erik Kagge | CC-BY-4.0 | [GBIF 4930092317](https://www.gbif.org/occurrence/4930092317) |
| `web/tests/fixtures/images/4131993520_beb025dd09.jpg` | Ole Christian Hagestad | CC-BY-4.0 | [GBIF 4131993520](https://www.gbif.org/occurrence/4131993520) |
| `web/tests/fixtures/images/3907717437_73dbe2a915.jpg` | Rune Zakariassen | CC-BY-4.0 | [GBIF 3907717437](https://www.gbif.org/occurrence/3907717437) |
| `web/tests/fixtures/images/2273593665_7c11ee40f6.jpg` | Kirsti Anne Mandal | CC-BY-4.0 | [GBIF 2273593665](https://www.gbif.org/occurrence/2273593665) |

Example photos of each species, shown in the app's result view and chosen by `species/kuvat.json` (`seeni.species_images`), resized to 480 px:

| File | Author | License | Source |
| --- | --- | --- | --- |
| `web/public/species/boletus-edulis-agg.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 1933115692](https://www.gbif.org/occurrence/1933115692) |
| `web/public/species/tylopilus-felleus.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 2848728427](https://www.gbif.org/occurrence/2848728427) |
| `web/public/species/leccinum-versipelle-agg.jpg` | Morten Pettersen | CC-BY-4.0 | [GBIF 2336096294](https://www.gbif.org/occurrence/2336096294) |
| `web/public/species/leccinum-scabrum.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 4437223184](https://www.gbif.org/occurrence/4437223184) |
| `web/public/species/suillus-variegatus.jpg` | Ole Reitan | CC-BY-4.0 | [GBIF 5906031307](https://www.gbif.org/occurrence/5906031307) |
| `web/public/species/suillus-luteus.jpg` | relet | CC0-1.0 | [GBIF 2423128576](https://www.gbif.org/occurrence/2423128576) |
| `web/public/species/suillus-bovinus.jpg` | Andreas Schneider | CC-BY-4.0 | [GBIF 4172237397](https://www.gbif.org/occurrence/4172237397) |
| `web/public/species/lactarius-trivialis-agg.jpg` | Ole Reitan | CC-BY-4.0 | [GBIF 4923453732](https://www.gbif.org/occurrence/4923453732) |
| `web/public/species/lactarius-rufus.jpg` | Else Landsem | CC-BY-4.0 | [GBIF 5287764019](https://www.gbif.org/occurrence/5287764019) |
| `web/public/species/lactarius-torminosus.jpg` | Morten Pettersen | CC-BY-4.0 | [GBIF 2359967843](https://www.gbif.org/occurrence/2359967843) |
| `web/public/species/lactarius-pubescens.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2407204499](https://www.gbif.org/occurrence/2407204499) |
| `web/public/species/lactarius-deliciosus-agg.jpg` | Gunnar Bureid | CC-BY-4.0 | [GBIF 2402510348](https://www.gbif.org/occurrence/2402510348) |
| `web/public/species/lactarius-helvus.jpg` | Ellen Renate Andreassen | CC-BY-4.0 | [GBIF 5841811500](https://www.gbif.org/occurrence/5841811500) |
| `web/public/species/russula-paludosa.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 6434861585](https://www.gbif.org/occurrence/6434861585) |
| `web/public/species/russula-emetica.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2410469437](https://www.gbif.org/occurrence/2410469437) |
| `web/public/species/russula-decolorans-agg.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2399974770](https://www.gbif.org/occurrence/2399974770) |
| `web/public/species/russula-claroflava.jpg` | Per Morten  Selle | CC-BY-4.0 | [GBIF 3921204461](https://www.gbif.org/occurrence/3921204461) |
| `web/public/species/russula-vinosa.jpg` | Per Marstad | CC-BY-4.0 | [GBIF 2411532639](https://www.gbif.org/occurrence/2411532639) |
| `web/public/species/hygrophorus-camarophyllus.jpg` | Wenche Eli Johansen | CC-BY-4.0 | [GBIF 2408362578](https://www.gbif.org/occurrence/2408362578) |
| `web/public/species/cortinarius-caperatus.jpg` | Heinähukka | CC-BY-4.0 | [GBIF 4438838143](https://www.gbif.org/occurrence/4438838143) |
| `web/public/species/cantharellus-cibarius.jpg` | Johan Adler | CC-BY-4.0 | [GBIF 6550883990](https://www.gbif.org/occurrence/6550883990) |
| `web/public/species/hygrophoropsis-aurantiaca.jpg` | Jan Alsvik | CC-BY-4.0 | [GBIF 1933295190](https://www.gbif.org/occurrence/1933295190) |
| `web/public/species/craterellus-tubaeformis-agg.jpg` | Inger Kristoffersen | CC-BY-4.0 | [GBIF 2408323761](https://www.gbif.org/occurrence/2408323761) |
| `web/public/species/craterellus-cornucopioides.jpg` | Morten Pettersen | CC-BY-4.0 | [GBIF 3408487326](https://www.gbif.org/occurrence/3408487326) |
| `web/public/species/albatrellus-ovinus.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 6574911460](https://www.gbif.org/occurrence/6574911460) |
| `web/public/species/hydnum-repandum-agg.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2409288982](https://www.gbif.org/occurrence/2409288982) |
| `web/public/species/morchella.jpg` | Ole Reitan | CC-BY-4.0 | [GBIF 5150059390](https://www.gbif.org/occurrence/5150059390) |
| `web/public/species/tricholoma-matsutake.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 4404645623](https://www.gbif.org/occurrence/4404645623) |
| `web/public/species/armillaria.jpg` | Jan Alsvik | CC-BY-4.0 | [GBIF 6574909346](https://www.gbif.org/occurrence/6574909346) |
| `web/public/species/kuehneromyces-mutabilis.jpg` | Inger Kristoffersen | CC-BY-4.0 | [GBIF 2403802593](https://www.gbif.org/occurrence/2403802593) |
| `web/public/species/agaricus-campestris-agg.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2823036417](https://www.gbif.org/occurrence/2823036417) |
| `web/public/species/amanita-virosa.jpg` | Kirsti Anne  Mandal | CC-BY-4.0 | [GBIF 2421635434](https://www.gbif.org/occurrence/2421635434) |
| `web/public/species/amanita-phalloides.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 2400039989](https://www.gbif.org/occurrence/2400039989) |
| `web/public/species/cortinarius-rubellus.jpg` | Edel Humstad | CC-BY-4.0 | [GBIF 2408464409](https://www.gbif.org/occurrence/2408464409) |
| `web/public/species/gyromitra-esculenta.jpg` | Per Marstad | CC-BY-4.0 | [GBIF 2409616406](https://www.gbif.org/occurrence/2409616406) |
| `web/public/species/galerina-marginata.jpg` | Johan Adler | CC-BY-4.0 | [GBIF 5889279375](https://www.gbif.org/occurrence/5889279375) |
| `web/public/species/paxillus-involutus.jpg` | Kirsti Anne  Mandal | CC-BY-4.0 | [GBIF 6495174005](https://www.gbif.org/occurrence/6495174005) |
| `web/public/species/amanita-muscaria.jpg` | Ola Vestre | CC-BY-4.0 | [GBIF 5841665361](https://www.gbif.org/occurrence/5841665361) |
| `web/public/species/amanita-regalis.jpg` | Nils Edvard Stokke | CC-BY-4.0 | [GBIF 2416594147](https://www.gbif.org/occurrence/2416594147) |
| `web/public/species/amanita-pantherina.jpg` | Geir K. Knudsen | CC-BY-4.0 | [GBIF 5841598276](https://www.gbif.org/occurrence/5841598276) |
| `web/public/species/hypholoma-fasciculare.jpg` | Ole Christian Hagestad | CC-BY-4.0 | [GBIF 4131950390](https://www.gbif.org/occurrence/4131950390) |
| `web/public/species/inocybe.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2822917384](https://www.gbif.org/occurrence/2822917384) |
| `web/public/species/tricholoma-equestre.jpg` | Morten Pettersen | CC-BY-4.0 | [GBIF 4437233428](https://www.gbif.org/occurrence/4437233428) |
| `web/public/species/cortinarius-orellanus.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 1823027126](https://www.gbif.org/occurrence/1823027126) |
| `web/public/species/verpa-bohemica.jpg` | Tero Linjama | CC0-1.0 | [GBIF 3301903748](https://www.gbif.org/occurrence/3301903748) |

## Species data sources

*Pending (#3).* `data-meta/lajilista.csv` and `species/species.json` are compiled from the sources below. Each source's license and required credit is recorded here before release.

| Source | Used for | License |
| --- | --- | --- |
| [GBIF Backbone Taxonomy](https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c) | taxonKeys | To be checked |
| [Laji.fi (FinBIF) taxonomy](https://laji.fi/) | Finnish names | To be checked |
| [Ruokavirasto](https://www.ruokavirasto.fi/) list of commercial mushrooms | Species selection | To be checked |

## Pretrained weights

Licenses checked from the model cards (#11).

| Model | Used for | Source | License |
| --- | --- | --- | --- |
| DINOv2 ViT-B/14 | Baseline only, not shipped (#5) | [facebookresearch/dinov2](https://github.com/facebookresearch/dinov2) | Apache-2.0 |
| EfficientNet-B0 (`efficientnet_b0.ra_in1k`, trained on ImageNet-1k) | Starting point of the shipped model (#6) | [timm on Hugging Face](https://huggingface.co/timm/efficientnet_b0.ra_in1k) | Apache-2.0 |

## Software

Libraries shipped with the web app:

| Library | License |
| --- | --- |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | MIT |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) and [Workbox](https://github.com/GoogleChrome/workbox) | MIT |

Tools used to build the app and train the model, not shipped:

| Tool | License |
| --- | --- |
| [PyTorch](https://github.com/pytorch/pytorch) | BSD-3-Clause |
| [torchvision](https://github.com/pytorch/vision) | BSD-3-Clause |
| [timm](https://github.com/huggingface/pytorch-image-models) | Apache-2.0 |
| [Vite](https://github.com/vitejs/vite) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [ONNX](https://github.com/onnx/onnx), [onnxruntime](https://github.com/microsoft/onnxruntime), [onnxconverter-common](https://github.com/microsoft/onnxconverter-common) | Apache-2.0, MIT, MIT |
| [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 |
