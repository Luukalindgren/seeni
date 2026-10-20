# data-meta

Small metadata files that are committed to git:

- `lajilista.csv`: one row per taxon, grouped into classes by `class_id` (#3). Columns: `class_id`, `tieteellinen`, `nimi`, `taxonKey`, `ryhma`, `kaksoisolennot` (class ids separated by `;`), `in_model`, and an optional free-text `huomio` for review notes. Check it with `uv run python -m seeni.lajilista` in `training/` (add `--strict` once every `taxonKey` is filled); CI runs the same check. Fill and check taxonKeys with `uv run python -m seeni.gbif_match` on the desktop, since it needs `api.gbif.org`.
- `split.csv`: train/val/test split by `gbifID` (#5)
- `gbif_download.json`: the GBIF download key, DOI and citation, written by `seeni.gbif_download fetch` (#4). The attributions cite it (#11).
- other attribution data (#11)

Images, the manifest, embeddings and checkpoints live in `~/seeni-data`, never here (hard rule 2).
