import json, random, torch
from seeni.muu import read_manifests
from seeni.paths import REPO_ROOT, data_dir
from seeni.split import read_split

run = data_dir() / "runs" / "b0-224-muu2"
labels = [c["id"] for c in json.loads((run / "labels.json").read_text())]
T = json.loads((run / "eval" / "calibration.json").read_text())["temperature"]
man = {m["image"]: m for m in read_manifests()}
split = read_split()
kuvat = json.loads((REPO_ROOT / "species/kuvat.json").read_text())
gal = json.loads((REPO_ROOT / "species/galleria.json").read_text()) if (REPO_ROOT / "species/galleria.json").exists() else {}
conf = {}
for s in ("val", "test"):
    d = torch.load(run / "eval" / f"logits-{s}.pt")
    p = (d["logits"] / T).softmax(1)
    for img, row in zip(d["images"], p):
        m = man.get(img)
        if m and m["class_id"] in labels:
            conf[img] = row[labels.index(m["class_id"])].item()
out = {}
for c, cur in kuvat.items():
    if c == "muu":
        continue
    banned = {man[i]["gbifID"] for i in gal.get(c, [])} | {man[cur]["gbifID"]}
    ms = [m for m in man.values() if m["class_id"] == c and m["license"] in ("CC0-1.0", "CC-BY-4.0")
          and m["gbifID"] not in banned and (data_dir() / m["path"]).exists()]
    vt = [m for m in ms if split.get(int(m["gbifID"]), (None, None))[1] in ("val", "test")]
    pool = vt if len(vt) >= 30 else ms
    if c in labels:
        pool = sorted(pool, key=lambda m: -conf.get(m["image"], 0))[:90]
    else:
        random.seed(1); pool = random.sample(pool, min(120, len(pool)))
    out[c] = {"current": cur, "current_path": man[cur]["path"], "in_model": c in labels,
              "from_val_test": pool is vt or all(m in vt for m in pool),
              "candidates": [{"image": m["image"], "path": m["path"], "gbifID": m["gbifID"], "license": m["license"],
                              "author": m["rights_holder"], "conf": conf.get(m["image"])} for m in pool]}
    print(c, len(ms), len(vt), len(pool))
(json.dumps(out) and open("/home/luuka_lindgren/seeni-3d/ref/pool.json", "w").write(json.dumps(out)))
