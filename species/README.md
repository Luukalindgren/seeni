# species

`species.json`: hand-curated species information and verification checks, one record per class id (#9). A record whose class is not in the model (`in_model` false in `lajilista.csv`) is a warning-only record; `muu` has no record.

Every record needs expert review (field `tarkistanut`) before release. LLM-drafted content is a draft only (hard rule 8). All records are drafts so far.

Fields that follow from `data-meta/lajilista.csv` (`id`, `taxonKeys`, `ryhma`, `kaksoisolennot`) are written by `seeni.species`; edit the rest by hand. From `training/`:

```sh
uv run python -m seeni.species sync    # refresh the fields from lajilista.csv
uv run python -m seeni.species check   # validate (CI runs it in pytest)
```

Checks (`tarkistukset`) with the same `id` in several records must be identical, since the app asks each one once. An answer lists the classes that are consistent with it; a check rules out only the classes it mentions, and only under the other answers. Safety rule, enforced by `check`: a dangerous class (tappava, myrkyllinen, esikäsiteltävä) is ruled out only by a check on a feature a beginner can see reliably, listed in `RELIABLE_CHECKS` in `training/src/seeni/species.py` (pores, gills or ridges; spore print colour; milk; the inside of a morel cut in half). In every other check, a dangerous class that the check mentions is listed under every answer, so the check can rule out a food mushroom but never a dangerous one.

The flow that uses these records is `web/src/flow.ts`.

Every check has a picture in `web/src/checkArt.ts`: a drawing, made for this project (no image license to track), that shows where to look and what the answers look like. A new check needs a picture there too; `web/tests/checkArt.test.ts` fails otherwise.
