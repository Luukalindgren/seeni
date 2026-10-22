Reference photo candidates for web/public/species/<class_id>.jpg (#45 side quest). Temporary branch.

<class_id>.jpg   contact sheet: CURRENT (species/kuvat.json) first, then 8 candidates in rank order
candidates.json  {class_id: [image ids in rank order]}
scores.json      the features behind each rank
pool.py, rank.py how they were made

Pool: CC0-1.0 / CC-BY-4.0 photos of the class, val/test split (all splits for classes with < 30
val/test photos: tricholoma-matsutake, amanita-phalloides), excluding the observations of the
current photo and of the gallery (species/galleria.json). For classes in the model, the 90 with the
highest v2 (b0-224-muu2) probability for the true class; cortinarius-orellanus and verpa-bohemica
(not in the model): a random 120 / all 6.
Rank: rembg (u2net) mask -> mushroom share of the frame (best ~0.3), mask touching the frame edge,
edge density outside the mask (clutter), sharpness inside it, box height/width (side view),
skin tone inside the mask (hands), model confidence. Hard filters: not cut off, share 0.04-0.8,
little skin. One photo per observation.
The sheets are JPEG (q85, ~230 kB each) instead of PNG, to keep the branch at 11 MB instead of ~50 MB.
