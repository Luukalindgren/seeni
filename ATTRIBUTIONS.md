# Attributions

Seeni is built on photos, data and software made by others. This file credits them and states the licenses that apply. See [`README.md`](README.md#license) for the license of Seeni's own code, model and species data.

## Training images

The model is trained on photos shared through [GBIF](https://www.gbif.org/) under CC0 or CC-BY licenses: mushrooms, and for the unknown class `muu` also other fungi and non-fungi such as moss, cones, leaves and plants (#7). Every photographer is credited, whatever the class. Each photo's license is taken from GBIF `multimedia.txt`, not from the occurrence record. The photos are not distributed in this repository or with the app, but the model is derived from them.

- GBIF occurrence downloads: species images GBIF.org (20 October 2026) https://doi.org/10.15468/dl.fadmpu; unknown class `muu` GBIF.org (20 October 2026) https://doi.org/10.15468/dl.3x49qy (both recorded in `data-meta/gbif_download.json`)
- Photographers and licenses: 29 858 images by 988 rights holders (28 178 CC-BY-4.0, 1 680 CC0-1.0). `seeni.attributions` generates the list from the image manifests: per rights holder in `web/public/attributions.json`, shown in the app under "Tietoa ja lähteet", and per image (with its GBIF record and source URL) in `data-meta/attributions.parquet`.

## Observation counts

`web/public/occurrence.json` (#48) holds monthly counts of occurrences in Finland per class and region, from the GBIF.org occurrence search API (accessed 21 October 2026), using only occurrences licensed CC0 or CC BY 4.0. It contains counts only, no occurrence records. `seeni.occurrence` makes it. The app uses it to note that a suggested species is rarely found at that time of year. The counts aggregate records from many datasets published through GBIF; GBIF.org is the source to cite.

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

### Species gallery photos

More photos of each species for the app's species gallery, chosen by `species/galleria.json` (`seeni.species_images`), resized to 360 px:

| File | Author | License | Source |
| --- | --- | --- | --- |
| `web/public/species/gallery/boletus-edulis-agg-1.jpg` | Kirsti Anne  Mandal | CC-BY-4.0 | [GBIF 3353351320](https://www.gbif.org/occurrence/3353351320) |
| `web/public/species/gallery/boletus-edulis-agg-2.jpg` | Halvard Hatlen | CC-BY-4.0 | [GBIF 3451556349](https://www.gbif.org/occurrence/3451556349) |
| `web/public/species/gallery/boletus-edulis-agg-3.jpg` | Rune Zakariassen | CC-BY-4.0 | [GBIF 1822585596](https://www.gbif.org/occurrence/1822585596) |
| `web/public/species/gallery/tylopilus-felleus-1.jpg` | Per Marstad | CC-BY-4.0 | [GBIF 2822936457](https://www.gbif.org/occurrence/2822936457) |
| `web/public/species/gallery/tylopilus-felleus-2.jpg` | jussi majaniemi | CC-BY-4.0 | [GBIF 6431049534](https://www.gbif.org/occurrence/6431049534) |
| `web/public/species/gallery/tylopilus-felleus-3.jpg` | Ole | CC-BY-4.0 | [GBIF 4926324202](https://www.gbif.org/occurrence/4926324202) |
| `web/public/species/gallery/leccinum-versipelle-agg-1.jpg` | Reidun Braathen | CC-BY-4.0 | [GBIF 2411024143](https://www.gbif.org/occurrence/2411024143) |
| `web/public/species/gallery/leccinum-versipelle-agg-2.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2401292700](https://www.gbif.org/occurrence/2401292700) |
| `web/public/species/gallery/leccinum-versipelle-agg-3.jpg` | Yehor Yatsiuk | CC0-1.0 | [GBIF 4952371405](https://www.gbif.org/occurrence/4952371405) |
| `web/public/species/gallery/leccinum-scabrum-1.jpg` | delognut | CC-BY-4.0 | [GBIF 6481265782](https://www.gbif.org/occurrence/6481265782) |
| `web/public/species/gallery/leccinum-scabrum-2.jpg` | Jan Alsvik | CC-BY-4.0 | [GBIF 4948252689](https://www.gbif.org/occurrence/4948252689) |
| `web/public/species/gallery/leccinum-scabrum-3.jpg` | Christopher Kullenberg | CC0-1.0 | [GBIF 3343745862](https://www.gbif.org/occurrence/3343745862) |
| `web/public/species/gallery/suillus-variegatus-1.jpg` | Eirik Hissingby Trandem | CC-BY-4.0 | [GBIF 5186584787](https://www.gbif.org/occurrence/5186584787) |
| `web/public/species/gallery/suillus-variegatus-2.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 3912698465](https://www.gbif.org/occurrence/3912698465) |
| `web/public/species/gallery/suillus-variegatus-3.jpg` | Niklas Wahlberg | CC0-1.0 | [GBIF 6552279849](https://www.gbif.org/occurrence/6552279849) |
| `web/public/species/gallery/suillus-luteus-1.jpg` | Gry Støvind Hoell | CC-BY-4.0 | [GBIF 5841566097](https://www.gbif.org/occurrence/5841566097) |
| `web/public/species/gallery/suillus-luteus-2.jpg` | Ola Vestre | CC-BY-4.0 | [GBIF 1933158311](https://www.gbif.org/occurrence/1933158311) |
| `web/public/species/gallery/suillus-luteus-3.jpg` | Perry Gunnar Larsen | CC-BY-4.0 | [GBIF 6509509514](https://www.gbif.org/occurrence/6509509514) |
| `web/public/species/gallery/suillus-bovinus-1.jpg` | Tero Linjama | CC0-1.0 | [GBIF 4416764756](https://www.gbif.org/occurrence/4416764756) |
| `web/public/species/gallery/suillus-bovinus-2.jpg` | Ole Reitan | CC-BY-4.0 | [GBIF 5905763867](https://www.gbif.org/occurrence/5905763867) |
| `web/public/species/gallery/suillus-bovinus-3.jpg` | Perry Gunnar Larsen | CC-BY-4.0 | [GBIF 5841730734](https://www.gbif.org/occurrence/5841730734) |
| `web/public/species/gallery/lactarius-trivialis-agg-1.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 3342084303](https://www.gbif.org/occurrence/3342084303) |
| `web/public/species/gallery/lactarius-trivialis-agg-2.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 4923435398](https://www.gbif.org/occurrence/4923435398) |
| `web/public/species/gallery/lactarius-trivialis-agg-3.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 1933120430](https://www.gbif.org/occurrence/1933120430) |
| `web/public/species/gallery/lactarius-rufus-1.jpg` | Reidun Braathen | CC-BY-4.0 | [GBIF 2400070702](https://www.gbif.org/occurrence/2400070702) |
| `web/public/species/gallery/lactarius-rufus-2.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2882472405](https://www.gbif.org/occurrence/2882472405) |
| `web/public/species/gallery/lactarius-rufus-3.jpg` | Mikko Heikkinen | CC-BY-4.0 | [GBIF 4417058525](https://www.gbif.org/occurrence/4417058525) |
| `web/public/species/gallery/lactarius-torminosus-1.jpg` | Alex Sosnovshchenko | CC-BY-4.0 | [GBIF 4952898014](https://www.gbif.org/occurrence/4952898014) |
| `web/public/species/gallery/lactarius-torminosus-2.jpg` | Nina Fiskerstrand | CC-BY-4.0 | [GBIF 4921344108](https://www.gbif.org/occurrence/4921344108) |
| `web/public/species/gallery/lactarius-torminosus-3.jpg` | Arne Reitan | CC-BY-4.0 | [GBIF 2405715296](https://www.gbif.org/occurrence/2405715296) |
| `web/public/species/gallery/lactarius-pubescens-1.jpg` | Magnar Olsen | CC-BY-4.0 | [GBIF 3970180563](https://www.gbif.org/occurrence/3970180563) |
| `web/public/species/gallery/lactarius-pubescens-2.jpg` | Nina  Lundberg | CC-BY-4.0 | [GBIF 4930110760](https://www.gbif.org/occurrence/4930110760) |
| `web/public/species/gallery/lactarius-pubescens-3.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2402566511](https://www.gbif.org/occurrence/2402566511) |
| `web/public/species/gallery/lactarius-deliciosus-agg-1.jpg` | Hans Andreas Sagstuen | CC-BY-4.0 | [GBIF 6522702471](https://www.gbif.org/occurrence/6522702471) |
| `web/public/species/gallery/lactarius-deliciosus-agg-2.jpg` | Perry Gunnar Larsen | CC-BY-4.0 | [GBIF 6509460638](https://www.gbif.org/occurrence/6509460638) |
| `web/public/species/gallery/lactarius-deliciosus-agg-3.jpg` | Ulrik Andreassen | CC-BY-4.0 | [GBIF 5759302325](https://www.gbif.org/occurrence/5759302325) |
| `web/public/species/gallery/lactarius-helvus-1.jpg` | Nils Edvard Stokke | CC-BY-4.0 | [GBIF 4437140789](https://www.gbif.org/occurrence/4437140789) |
| `web/public/species/gallery/lactarius-helvus-2.jpg` | Nils Edvard Stokke | CC-BY-4.0 | [GBIF 1844021474](https://www.gbif.org/occurrence/1844021474) |
| `web/public/species/gallery/lactarius-helvus-3.jpg` | Kirsti Anne  Mandal | CC-BY-4.0 | [GBIF 4947250310](https://www.gbif.org/occurrence/4947250310) |
| `web/public/species/gallery/russula-paludosa-1.jpg` | Anne Christenson | CC-BY-4.0 | [GBIF 3332604441](https://www.gbif.org/occurrence/3332604441) |
| `web/public/species/gallery/russula-paludosa-2.jpg` | Jonas Heggedal | CC-BY-4.0 | [GBIF 5287720627](https://www.gbif.org/occurrence/5287720627) |
| `web/public/species/gallery/russula-paludosa-3.jpg` | Sigurd Anders Svalestad | CC-BY-4.0 | [GBIF 5759307175](https://www.gbif.org/occurrence/5759307175) |
| `web/public/species/gallery/russula-emetica-1.jpg` | Jeanette Elden | CC-BY-4.0 | [GBIF 4907959324](https://www.gbif.org/occurrence/4907959324) |
| `web/public/species/gallery/russula-emetica-2.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 4437188474](https://www.gbif.org/occurrence/4437188474) |
| `web/public/species/gallery/russula-emetica-3.jpg` | Bjørn Eidhammer | CC-BY-4.0 | [GBIF 4437168571](https://www.gbif.org/occurrence/4437168571) |
| `web/public/species/gallery/russula-decolorans-agg-1.jpg` | Willow Peo Hansen | CC-BY-4.0 | [GBIF 4925393698](https://www.gbif.org/occurrence/4925393698) |
| `web/public/species/gallery/russula-decolorans-agg-2.jpg` | Rune Zakariassen | CC-BY-4.0 | [GBIF 6543661534](https://www.gbif.org/occurrence/6543661534) |
| `web/public/species/gallery/russula-decolorans-agg-3.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 4947197135](https://www.gbif.org/occurrence/4947197135) |
| `web/public/species/gallery/russula-claroflava-1.jpg` | Else Landsem | CC-BY-4.0 | [GBIF 5841878127](https://www.gbif.org/occurrence/5841878127) |
| `web/public/species/gallery/russula-claroflava-2.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 3327211372](https://www.gbif.org/occurrence/3327211372) |
| `web/public/species/gallery/russula-claroflava-3.jpg` | Gry Dolva | CC-BY-4.0 | [GBIF 3329882436](https://www.gbif.org/occurrence/3329882436) |
| `web/public/species/gallery/russula-vinosa-1.jpg` | Per Marstad | CC-BY-4.0 | [GBIF 2407702494](https://www.gbif.org/occurrence/2407702494) |
| `web/public/species/gallery/russula-vinosa-2.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2416735847](https://www.gbif.org/occurrence/2416735847) |
| `web/public/species/gallery/russula-vinosa-3.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 3960617697](https://www.gbif.org/occurrence/3960617697) |
| `web/public/species/gallery/hygrophorus-camarophyllus-1.jpg` | Rob van Kruining | CC-BY-4.0 | [GBIF 2468109606](https://www.gbif.org/occurrence/2468109606) |
| `web/public/species/gallery/hygrophorus-camarophyllus-2.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 1824601200](https://www.gbif.org/occurrence/1824601200) |
| `web/public/species/gallery/hygrophorus-camarophyllus-3.jpg` | Hallvard Holtung | CC-BY-4.0 | [GBIF 4401662537](https://www.gbif.org/occurrence/4401662537) |
| `web/public/species/gallery/cortinarius-caperatus-1.jpg` | Svein Olav B. Drangeid | CC-BY-4.0 | [GBIF 2408351346](https://www.gbif.org/occurrence/2408351346) |
| `web/public/species/gallery/cortinarius-caperatus-2.jpg` | Rune Zakariassen | CC-BY-4.0 | [GBIF 3357901336](https://www.gbif.org/occurrence/3357901336) |
| `web/public/species/gallery/cortinarius-caperatus-3.jpg` | Anne Christenson | CC-BY-4.0 | [GBIF 3332601429](https://www.gbif.org/occurrence/3332601429) |
| `web/public/species/gallery/cantharellus-cibarius-1.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 4164318439](https://www.gbif.org/occurrence/4164318439) |
| `web/public/species/gallery/cantharellus-cibarius-2.jpg` | Mark Taylor | CC-BY-4.0 | [GBIF 5223442523](https://www.gbif.org/occurrence/5223442523) |
| `web/public/species/gallery/cantharellus-cibarius-3.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2333347168](https://www.gbif.org/occurrence/2333347168) |
| `web/public/species/gallery/hygrophoropsis-aurantiaca-1.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2398124019](https://www.gbif.org/occurrence/2398124019) |
| `web/public/species/gallery/hygrophoropsis-aurantiaca-2.jpg` | Alex Sosnovshchenko | CC-BY-4.0 | [GBIF 4405372892](https://www.gbif.org/occurrence/4405372892) |
| `web/public/species/gallery/hygrophoropsis-aurantiaca-3.jpg` | Johan Adler | CC-BY-4.0 | [GBIF 5867910626](https://www.gbif.org/occurrence/5867910626) |
| `web/public/species/gallery/craterellus-tubaeformis-agg-1.jpg` | Kristoffer Olsen | CC-BY-4.0 | [GBIF 4978917405](https://www.gbif.org/occurrence/4978917405) |
| `web/public/species/gallery/craterellus-tubaeformis-agg-2.jpg` | Sarah Zukoff | CC0-1.0 | [GBIF 6500006514](https://www.gbif.org/occurrence/6500006514) |
| `web/public/species/gallery/craterellus-tubaeformis-agg-3.jpg` | Hans Andreas Sagstuen | CC-BY-4.0 | [GBIF 5905549724](https://www.gbif.org/occurrence/5905549724) |
| `web/public/species/gallery/craterellus-cornucopioides-1.jpg` | Ola Vestre | CC-BY-4.0 | [GBIF 2416584307](https://www.gbif.org/occurrence/2416584307) |
| `web/public/species/gallery/craterellus-cornucopioides-2.jpg` | Siri Lie Olsen | CC-BY-4.0 | [GBIF 4923448039](https://www.gbif.org/occurrence/4923448039) |
| `web/public/species/gallery/craterellus-cornucopioides-3.jpg` | Mathilde Norby Lorentzen | CC-BY-4.0 | [GBIF 5905818689](https://www.gbif.org/occurrence/5905818689) |
| `web/public/species/gallery/albatrellus-ovinus-1.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 4404687633](https://www.gbif.org/occurrence/4404687633) |
| `web/public/species/gallery/albatrellus-ovinus-2.jpg` | Tittanoora Martikainen | CC-BY-4.0 | [GBIF 4414386642](https://www.gbif.org/occurrence/4414386642) |
| `web/public/species/gallery/albatrellus-ovinus-3.jpg` | Inger Kristoffersen | CC-BY-4.0 | [GBIF 6574925408](https://www.gbif.org/occurrence/6574925408) |
| `web/public/species/gallery/hydnum-repandum-agg-1.jpg` | Andreas Schneider | CC-BY-4.0 | [GBIF 6479520811](https://www.gbif.org/occurrence/6479520811) |
| `web/public/species/gallery/hydnum-repandum-agg-2.jpg` | Ellen Christensen | CC-BY-4.0 | [GBIF 5003571884](https://www.gbif.org/occurrence/5003571884) |
| `web/public/species/gallery/hydnum-repandum-agg-3.jpg` | Bjørn Eidhammer | CC-BY-4.0 | [GBIF 2333052915](https://www.gbif.org/occurrence/2333052915) |
| `web/public/species/gallery/morchella-1.jpg` | Astrid Grendstad | CC-BY-4.0 | [GBIF 5163880517](https://www.gbif.org/occurrence/5163880517) |
| `web/public/species/gallery/morchella-2.jpg` | Jostein Sandvik | CC-BY-4.0 | [GBIF 3469517427](https://www.gbif.org/occurrence/3469517427) |
| `web/public/species/gallery/morchella-3.jpg` | Ole Christian Hagestad | CC-BY-4.0 | [GBIF 3803928356](https://www.gbif.org/occurrence/3803928356) |
| `web/public/species/gallery/tricholoma-matsutake-1.jpg` | Erik Kagge | CC-BY-4.0 | [GBIF 4930092317](https://www.gbif.org/occurrence/4930092317) |
| `web/public/species/gallery/tricholoma-matsutake-2.jpg` | Turid Helland | CC-BY-4.0 | [GBIF 4948239158](https://www.gbif.org/occurrence/4948239158) |
| `web/public/species/gallery/tricholoma-matsutake-3.jpg` | Rune Solvang | CC-BY-4.0 | [GBIF 4465976530](https://www.gbif.org/occurrence/4465976530) |
| `web/public/species/gallery/armillaria-1.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 3393096418](https://www.gbif.org/occurrence/3393096418) |
| `web/public/species/gallery/armillaria-2.jpg` | Hans Andreas Sagstuen | CC-BY-4.0 | [GBIF 6558170324](https://www.gbif.org/occurrence/6558170324) |
| `web/public/species/gallery/armillaria-3.jpg` | Gunnar Bureid | CC-BY-4.0 | [GBIF 2398602304](https://www.gbif.org/occurrence/2398602304) |
| `web/public/species/gallery/kuehneromyces-mutabilis-1.jpg` | Bjørn Eidhammer | CC-BY-4.0 | [GBIF 3820086341](https://www.gbif.org/occurrence/3820086341) |
| `web/public/species/gallery/kuehneromyces-mutabilis-2.jpg` | Nils Edvard Stokke | CC-BY-4.0 | [GBIF 3879064557](https://www.gbif.org/occurrence/3879064557) |
| `web/public/species/gallery/kuehneromyces-mutabilis-3.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2399248523](https://www.gbif.org/occurrence/2399248523) |
| `web/public/species/gallery/agaricus-campestris-agg-1.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 4401699874](https://www.gbif.org/occurrence/4401699874) |
| `web/public/species/gallery/agaricus-campestris-agg-2.jpg` | Jon Arne Wilhelmsen | CC-BY-4.0 | [GBIF 4948268642](https://www.gbif.org/occurrence/4948268642) |
| `web/public/species/gallery/agaricus-campestris-agg-3.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2401039625](https://www.gbif.org/occurrence/2401039625) |
| `web/public/species/gallery/amanita-virosa-1.jpg` | Rune Zakariassen | CC-BY-4.0 | [GBIF 4930102789](https://www.gbif.org/occurrence/4930102789) |
| `web/public/species/gallery/amanita-virosa-2.jpg` | Perry Gunnar Larsen | CC-BY-4.0 | [GBIF 3332643377](https://www.gbif.org/occurrence/3332643377) |
| `web/public/species/gallery/amanita-virosa-3.jpg` | Per Marstad | CC-BY-4.0 | [GBIF 2858252459](https://www.gbif.org/occurrence/2858252459) |
| `web/public/species/gallery/amanita-phalloides-1.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 5841614133](https://www.gbif.org/occurrence/5841614133) |
| `web/public/species/gallery/amanita-phalloides-2.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 1933264887](https://www.gbif.org/occurrence/1933264887) |
| `web/public/species/gallery/amanita-phalloides-3.jpg` | Arild Omberg | CC-BY-4.0 | [GBIF 5841828824](https://www.gbif.org/occurrence/5841828824) |
| `web/public/species/gallery/cortinarius-rubellus-1.jpg` | Perry Gunnar Larsen | CC-BY-4.0 | [GBIF 4947218749](https://www.gbif.org/occurrence/4947218749) |
| `web/public/species/gallery/cortinarius-rubellus-2.jpg` | June Erlandsen Høgås | CC-BY-4.0 | [GBIF 5058947545](https://www.gbif.org/occurrence/5058947545) |
| `web/public/species/gallery/cortinarius-rubellus-3.jpg` | Gunnar Bureid | CC-BY-4.0 | [GBIF 5841930842](https://www.gbif.org/occurrence/5841930842) |
| `web/public/species/gallery/gyromitra-esculenta-1.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 2247976477](https://www.gbif.org/occurrence/2247976477) |
| `web/public/species/gallery/gyromitra-esculenta-2.jpg` | Jens Ullenius | CC0-1.0 | [GBIF 3118408664](https://www.gbif.org/occurrence/3118408664) |
| `web/public/species/gallery/gyromitra-esculenta-3.jpg` | Steinar Stueflotten | CC-BY-4.0 | [GBIF 2406238945](https://www.gbif.org/occurrence/2406238945) |
| `web/public/species/gallery/galerina-marginata-1.jpg` | Sieglinde Hansen [1939-2019] | CC-BY-4.0 | [GBIF 2407449289](https://www.gbif.org/occurrence/2407449289) |
| `web/public/species/gallery/galerina-marginata-2.jpg` | Kirsti Anne  Mandal | CC-BY-4.0 | [GBIF 5841813888](https://www.gbif.org/occurrence/5841813888) |
| `web/public/species/gallery/galerina-marginata-3.jpg` | Tove Jacobsen | CC-BY-4.0 | [GBIF 2404110492](https://www.gbif.org/occurrence/2404110492) |
| `web/public/species/gallery/paxillus-involutus-1.jpg` | Cecilie Ness | CC-BY-4.0 | [GBIF 4947184054](https://www.gbif.org/occurrence/4947184054) |
| `web/public/species/gallery/paxillus-involutus-2.jpg` | Gunnar Bureid | CC-BY-4.0 | [GBIF 2405437573](https://www.gbif.org/occurrence/2405437573) |
| `web/public/species/gallery/paxillus-involutus-3.jpg` | Dag Leonard Fjeldstad | CC-BY-4.0 | [GBIF 6543573346](https://www.gbif.org/occurrence/6543573346) |
| `web/public/species/gallery/amanita-muscaria-1.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 4942173799](https://www.gbif.org/occurrence/4942173799) |
| `web/public/species/gallery/amanita-muscaria-2.jpg` | Alex Sosnovshchenko | CC-BY-4.0 | [GBIF 4980453698](https://www.gbif.org/occurrence/4980453698) |
| `web/public/species/gallery/amanita-muscaria-3.jpg` | Johann Stamm | CC-BY-4.0 | [GBIF 4454340678](https://www.gbif.org/occurrence/4454340678) |
| `web/public/species/gallery/amanita-regalis-1.jpg` | Aleksi Lehikoinen | CC-BY-4.0 | [GBIF 4952430554](https://www.gbif.org/occurrence/4952430554) |
| `web/public/species/gallery/amanita-regalis-2.jpg` | Else Landsem | CC-BY-4.0 | [GBIF 6444872440](https://www.gbif.org/occurrence/6444872440) |
| `web/public/species/gallery/amanita-regalis-3.jpg` | Willow Peo Hansen | CC-BY-4.0 | [GBIF 4161452468](https://www.gbif.org/occurrence/4161452468) |
| `web/public/species/gallery/amanita-pantherina-1.jpg` | Gunvor Bollingmo | CC-BY-4.0 | [GBIF 1822603018](https://www.gbif.org/occurrence/1822603018) |
| `web/public/species/gallery/amanita-pantherina-2.jpg` | Rob van Kruining | CC-BY-4.0 | [GBIF 2398064081](https://www.gbif.org/occurrence/2398064081) |
| `web/public/species/gallery/amanita-pantherina-3.jpg` | Jens Ullenius | CC0-1.0 | [GBIF 2873797133](https://www.gbif.org/occurrence/2873797133) |
| `web/public/species/gallery/hypholoma-fasciculare-1.jpg` | Jon Trygve Johnsen | CC-BY-4.0 | [GBIF 2407978987](https://www.gbif.org/occurrence/2407978987) |
| `web/public/species/gallery/hypholoma-fasciculare-2.jpg` | Inger-Lise Fonneland | CC-BY-4.0 | [GBIF 2406268819](https://www.gbif.org/occurrence/2406268819) |
| `web/public/species/gallery/hypholoma-fasciculare-3.jpg` | Siv Moen | CC-BY-4.0 | [GBIF 1933224471](https://www.gbif.org/occurrence/1933224471) |
| `web/public/species/gallery/inocybe-1.jpg` | Gry Handberg | CC-BY-4.0 | [GBIF 6558221312](https://www.gbif.org/occurrence/6558221312) |
| `web/public/species/gallery/inocybe-2.jpg` | Jan Alsvik | CC-BY-4.0 | [GBIF 2882501326](https://www.gbif.org/occurrence/2882501326) |
| `web/public/species/gallery/inocybe-3.jpg` | Per Marstad | CC-BY-4.0 | [GBIF 5841918712](https://www.gbif.org/occurrence/5841918712) |
| `web/public/species/gallery/tricholoma-equestre-1.jpg` | Cato Erga | CC-BY-4.0 | [GBIF 4948248752](https://www.gbif.org/occurrence/4948248752) |
| `web/public/species/gallery/tricholoma-equestre-2.jpg` | Eli Heiberg | CC-BY-4.0 | [GBIF 2901377330](https://www.gbif.org/occurrence/2901377330) |
| `web/public/species/gallery/tricholoma-equestre-3.jpg` | Johan Adler | CC-BY-4.0 | [GBIF 5007844636](https://www.gbif.org/occurrence/5007844636) |

## Species data sources

`data-meta/lajilista.csv` and `species/species.json` are compiled from the sources below. They take facts from them (which species, their names and taxon ids); no text is copied. The descriptions and checks in `species.json` are written for Seeni, and the check pictures in `web/src/checkArt.ts` are drawn for Seeni.

| Source | Used for | License |
| --- | --- | --- |
| [GBIF Backbone Taxonomy](https://doi.org/10.15468/39omei), GBIF Secretariat | taxonKeys, scientific names | CC BY 4.0 |
| [Laji.fi (FinBIF) taxonomy](https://laji.fi/), Finnish Biodiversity Information Facility | Finnish names | CC BY 4.0 (FinBIF's default for its own data) |
| [Ruokavirasto](https://www.ruokavirasto.fi/) list of commercial mushrooms (*kauppasienet*) | Which species are on the list | Facts only, credited as the source |

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
