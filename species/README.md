# species

`species.json`: hand-curated species information and verification checks, one record per class id (#9). A record whose class is not in the model (`in_model` false in `lajilista.csv`) is a warning-only record; `muu` has no record.

Every record needs expert review (field `tarkistanut`) before release. LLM-drafted content is a draft only (hard rule 8). All records are drafts so far.

Fields that follow from `data-meta/lajilista.csv` (`id`, `taxonKeys`, `ryhma`, `kaksoisolennot`) are written by `seeni.species`; edit the rest by hand. From `training/`:

```sh
uv run python -m seeni.species sync    # refresh the fields from lajilista.csv
uv run python -m seeni.species check   # validate (CI runs it in pytest)
```

Checks (`tarkistukset`) with the same `id` in several records must be identical, since the app asks each one once. An answer lists the classes that are consistent with it; a check rules out only the classes it mentions, and only under the other answers. Drafting rule: a dangerous class (tappava, myrkyllinen, esikäsiteltävä) is ruled out only by a feature a beginner can see reliably, such as pores versus gills or the spore print colour. For an unreliable feature it is listed under every answer, so the check can rule out the food mushroom but never the dangerous one.

The flow that uses these records is `web/src/flow.ts`.
