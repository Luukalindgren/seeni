# Phase 7 report: evaluation, calibration, unknown class

Model: EfficientNet-B0 at 224 px, run `b0-224-muu` (30 epochs, lr 3e-4, best val macro-F1 at epoch 30), 44 classes: the 43 `in_model` classes of `lajilista.csv` and `muu`. Produced with `seeni.evaluate` (#7); the numbers below are the test set, after T and the threshold were fixed on val. The test set was evaluated twice: code review then found that the unknown-fungi metric counted only the top-1 class, not every candidate on screen. After that fix the rule picked a new threshold on val, and test was run again with it. Nothing was tuned on test.

## Summary

- **Fixed for `calibration.json` (#8):** temperature **T = 0.7328**, unknown threshold **0.76** on the top species class, candidates up to 95 % cumulative probability (max 5). `muu` on top also means "en tunnista varmasti".
- **Standard metrics (test):** top-1 86.7 %, top-3 95.6 %, macro-F1 0.849; species classes only top-1 87.2 %, top-3 95.9 %. Calibration error (ECE) 9.1 % → 2.4 % with T.
- **Dangerous confusion, in-model taxa (test):** raw 56 of 1002 dangerous-group images (5.6 %), 20 after the threshold, **6 (0.6 %) after the threshold and lookalike warnings**: case (a) 5 of 776, case (b) 1 of 226. On val it was 2 of 952. The six are *Lactarius helvus* ×2, *L. rufus*, *Amanita virosa*, *Paxillus involutus* and *Tricholoma equestre*, each one image.
- **Dangerous species not in the model (all 71 images):** *Verpa bohemica* and *Cortinarius orellanus*. 15 raw (21 %), 4 after the threshold (all *Verpa* called `morchella`), **0 after warnings**, since `morchella` always warns about *Verpa*. At a lower threshold *C. orellanus* called `lactarius-rufus` or `cantharellus-cibarius` slipped through unwarned; see follow-ups.
- **Unknown:** unlisted fungi get "en tunnista" 90.2 % of the time and are answered with a food mushroom among the candidates 8.1 % of the time; non-mushrooms get "en tunnista" 100 %. Listed species are answered 82.1 % of the time, and then top-1 is right 96.0 %.
- Poisonous or deadly taxa have the true class in top-3 96.3 % of the time.

## What changed in this phase

- **`muu` data (`seeni.muu`):** its own GBIF download ([10.15468/dl.3x49qy](https://doi.org/10.15468/dl.3x49qy), 530 872 occurrences): fungi identified to species and not on the list (listed taxa and everything below them excluded in the request and again in `index`), and forest-floor non-mushrooms (Bryophyta, Pinopsida, Ericaceae, Polypodiopsida, Lycopodiopsida, Betulaceae, Fagaceae, Rosaceae, Poaceae, Myxomycetes). CC0/CC-BY per image, one image per observation, round-robin over species: 4000 fungi images from 4000 species and 2000 others from 1602 taxa; 2 duplicates removed, 5998 kept. About a tenth are microscope shots or habitat photos; they stay, since "muu" is the right answer for them too.
- **Training:** `muu` trains on those images. The listed classes outside the model (`in_model` = false) are no longer trained as `muu`, so the "not in the model" numbers measure a species the model has never seen. Before this phase `muu` held only these two species.
- **Threshold rule (on val):** the lowest threshold at which at most 0.5 % of dangerous-group images remain a dangerous confusion after warnings, and at most 7.5 % of unlisted fungi are answered with a food mushroom among the candidates (an unlisted fungus may be poisonous). The second condition sets the threshold: 0.76 on val. Zero residual on val would need 0.99, where only a quarter of photos get an answer; the verification checks of phase 9 are the next guard. The full curve is `eval/threshold-val.csv` in the run.

## Error analysis

The worst val confusions and the 60 most confident mistakes were reviewed as contact sheets. Seven images were wrong labels or unusable and went to `exclude.csv` (#4): a chanterelle labelled *Lactarius helvus*, two *Leccinum* (scaly stipe) labelled *Cortinarius orellanus*, a *Suillus* labelled *Leccinum*, a *Morchella* observation showing small gilled mushrooms, bark without a fruiting body, and a moss photo with the mushroom too small to see. The other confusions are real lookalikes: *Russula* reds with each other, *Galerina marginata* ↔ *Kuehneromyces mutabilis*, *Lactarius helvus* ↔ *L. rufus*, *Leccinum* species, and `muu` fungi ↔ *Inocybe*. No class merge is proposed: the confused pairs have different groups, and merging them would hide the difference the checks of phase 9 must ask about.

## Follow-ups

- *Lactarius helvus* is the weakest dangerous taxon (top-1 56.8 %, top-3 78.4 % on test, 37 images): more images would help.
- *Cortinarius orellanus* is shown as a warning only with `cortinarius-rubellus`. The model calls it `lactarius-rufus` or `cantharellus-cibarius`, whose lookalikes do not include it. At the 0.76 threshold none of those got through, but the margin is thin. Adding it to the model (it has about 63 usable images) or listing it as a lookalike of those classes is a species list decision for #3.

## Test set in detail

T = 0.733, unknown threshold 0.76, candidates up to 95 % (max 5).

### Standard metrics

| set | images | top-1 | top-3 | macro-F1 | species top-1 | species top-3 | ECE before | ECE after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| test | 2982 | 86.7 % | 95.6 % | 0.849 | 87.2 % | 95.9 % | 9.1 % | 2.4 % |

### Unknown (`muu`) and the threshold

- Species images answered (not "en tunnista"): 82.1 %, top-1 correct when answered: 96.0 %
- muu fungi (409 images): "en tunnista" 90.2 %, answered with a food mushroom among the candidates 8.1 %
- muu other (191 images): "en tunnista" 100.0 %, answered with a food mushroom among the candidates 0.0 %

### Dangerous confusion: in-model classes

Poisonous or deadly taxa with the true class in top-3: 96.3 %.

| case | images | raw | after threshold | after threshold and warnings |
| --- | ---: | ---: | ---: | ---: |
| (a) myrkyllinen/tappava → food class | 776 | 43 (5.5 %) | 17 (2.2 %) | 5 (0.6 %) |
| (b) esikäsiteltävä → syötävä class | 226 | 13 (5.8 %) | 3 (1.3 %) | 1 (0.4 %) |

| taxon | group | images | top-1 | top-3 | raw | after threshold | after warnings | dangerous top-1 classes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Lactarius trivialis (haaparousku) | esikäsiteltävä | 42 | 81.0 % | 92.9 % | 3 | 0 | 0 | leccinum-versipelle-agg 1; hydnum-repandum-agg 1; lactarius-deliciosus-agg 1 |
| Lactarius rufus (kangasrousku) | esikäsiteltävä | 46 | 80.4 % | 95.7 % | 3 | 1 | 1 | agaricus-campestris-agg 1; boletus-edulis-agg 1; leccinum-versipelle-agg 1 |
| Lactarius torminosus (karvarousku) | esikäsiteltävä | 57 | 86.0 % | 91.2 % | 4 | 0 | 0 | lactarius-deliciosus-agg 1; kuehneromyces-mutabilis 1; russula-decolorans-agg 1; suillus-luteus 1 |
| Lactarius helvus (lakritsirousku) | myrkyllinen | 37 | 56.8 % | 78.4 % | 12 | 6 | 2 | lactarius-rufus 5; lactarius-trivialis-agg 3; leccinum-scabrum 2; hydnum-repandum-agg 1; lactarius-deliciosus-agg 1 |
| Russula emetica (tulipunahapero) | myrkyllinen | 36 | 88.9 % | 94.4 % | 4 | 3 | 0 | russula-paludosa 4 |
| Armillaria (mesisienet) | esikäsiteltävä | 81 | 86.4 % | 92.6 % | 3 | 2 | 0 | suillus-variegatus 1; kuehneromyces-mutabilis 1; leccinum-scabrum 1 |
| Amanita virosa (valkokärpässieni) | tappava | 41 | 90.2 % | 97.6 % | 1 | 1 | 1 | lactarius-trivialis-agg 1 |
| Amanita phalloides (kavalakärpässieni) | tappava | 11 | 100.0 % | 100.0 % | 0 | 0 | 0 |  |
| Cortinarius rubellus (suippumyrkkyseitikki) | tappava | 38 | 97.4 % | 100.0 % | 1 | 0 | 0 | lactarius-rufus 1 |
| Gyromitra esculenta (korvasieni) | tappava | 49 | 100.0 % | 100.0 % | 0 | 0 | 0 |  |
| Galerina marginata (myrkkynääpikkä) | tappava | 50 | 78.0 % | 96.0 % | 5 | 3 | 0 | kuehneromyces-mutabilis 3; craterellus-tubaeformis-agg 1; leccinum-versipelle-agg 1 |
| Paxillus involutus (pulkkosieni) | tappava | 69 | 88.4 % | 94.2 % | 5 | 1 | 1 | leccinum-scabrum 1; suillus-bovinus 1; suillus-luteus 1; leccinum-versipelle-agg 1; lactarius-torminosus 1 |
| Amanita muscaria (punakärpässieni) | myrkyllinen | 142 | 96.5 % | 98.6 % | 3 | 0 | 0 | leccinum-versipelle-agg 1; russula-decolorans-agg 1; russula-claroflava 1 |
| Amanita regalis (ruskokärpässieni) | myrkyllinen | 49 | 91.8 % | 98.0 % | 1 | 0 | 0 | russula-claroflava 1 |
| Amanita pantherina (pantterikärpässieni) | myrkyllinen | 28 | 82.1 % | 96.4 % | 1 | 0 | 0 | russula-decolorans-agg 1 |
| Hypholoma fasciculare (kitkerälahokka) | myrkyllinen | 47 | 91.5 % | 100.0 % | 4 | 1 | 0 | armillaria 2; kuehneromyces-mutabilis 1; suillus-bovinus 1 |
| Inocybe (aitorisakkaat) | myrkyllinen | 147 | 85.0 % | 95.9 % | 5 | 1 | 0 | lactarius-trivialis-agg 1; russula-claroflava 1; lactarius-rufus 1; leccinum-scabrum 1; kuehneromyces-mutabilis 1 |
| Inosperma erubescens (myrkkyrisakas) | myrkyllinen | 5 | 40.0 % | 80.0 % | 0 | 0 | 0 |  |
| Tricholoma equestre (kangaskeltavalmuska) | myrkyllinen | 27 | 92.6 % | 96.3 % | 1 | 1 | 1 | suillus-variegatus 1 |

### Dangerous confusion: dangerous species not in the model

Poisonous or deadly taxa with the true class in top-3: 0.0 %.

| case | images | raw | after threshold | after threshold and warnings |
| --- | ---: | ---: | ---: | ---: |
| (a) myrkyllinen/tappava → food class | 71 | 15 (21.1 %) | 4 (5.6 %) | 0 (0.0 %) |
| (b) esikäsiteltävä → syötävä class | 0 | 0 (–) | 0 (–) | 0 (–) |

| taxon | group | images | top-1 | top-3 | raw | after threshold | after warnings | dangerous top-1 classes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Verpa bohemica (poimukellomörsky) | myrkyllinen | 8 | 0.0 % | 0.0 % | 7 | 4 | 0 | morchella 6; cantharellus-cibarius 1 |
| Cortinarius orellanus (lehtomyrkkyseitikki) | tappava | 63 | 0.0 % | 0.0 % | 8 | 0 | 0 | lactarius-rufus 4; cantharellus-cibarius 2; armillaria 1; leccinum-versipelle-agg 1 |
