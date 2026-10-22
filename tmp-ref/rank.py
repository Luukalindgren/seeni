"""Rank reference-photo candidates per species and draw a contact sheet for each.

Per candidate, from a rembg mask on the photo at 512 px:
  area     share of the frame that is mushroom; best around 0.15-0.5
  cut      share of the mask's outline on the frame edge (a cut-off mushroom is bad)
  clutter  edge density outside the mask (grass, needles, leaves)
  sharp    Laplacian variance inside the mask
  shape    mask bounding box height / width: a side view with its stem is taller
  conf     the model's probability for the true class (val/test only)
Each feature becomes a rank within the species, and the weighted ranks give the score.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from rembg import new_session, remove

DATA = Path.home() / "seeni-data"
OUT = Path(sys.argv[2])
pool = json.loads(Path(sys.argv[1]).read_text())
session = new_session("u2net", providers=["CPUExecutionProvider"])


def features(path: str) -> dict:
    im = Image.open(DATA / path).convert("RGB")
    im.thumbnail((512, 512))
    mask = np.asarray(remove(im, session=session, only_mask=True), np.float64) / 255 > 0.5
    g = np.asarray(im.convert("L"), np.float64)
    gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1]))
    gy = np.abs(np.diff(g, axis=0, prepend=g[:1]))
    edges = (gx + gy) > 40
    lap = np.asarray(im.convert("L").filter(ImageFilter.FIND_EDGES), np.float64)
    area = mask.mean()
    border = np.concatenate([mask[0], mask[-1], mask[:, 0], mask[:, -1]])
    outline = mask ^ np.asarray(
        Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)), bool
    )
    cut = border.sum() / max(outline.sum(), 1)
    outside = ~np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9)), bool)
    clutter = edges[outside].mean() if outside.any() else 1.0
    sharp = lap[mask].var() if mask.sum() > 50 else 0.0
    ys, xs = np.where(mask)
    shape = (np.ptp(ys) + 1) / (np.ptp(xs) + 1) if len(xs) else 0.0
    # Skin (a hand holding the mushroom) inside the mask, by YCbCr.
    ycc = np.asarray(im.convert("YCbCr"), np.float64)
    skin_px = (ycc[..., 2] > 138) & (ycc[..., 2] < 175) & (ycc[..., 1] > 85) & (ycc[..., 1] < 128) & (ycc[..., 0] > 60)
    skin = skin_px[mask].mean() if mask.any() else 0.0
    return dict(area=float(area), cut=float(cut), clutter=float(clutter), sharp=float(sharp), shape=float(shape),
                skin=float(skin))


def ranks(values, higher_better=True):
    v = np.asarray(values, np.float64)
    order = np.argsort(-v if higher_better else v, kind="stable")
    r = np.empty(len(v))
    r[order] = np.arange(len(v))
    return r / max(len(v) - 1, 1)  # 0 best .. 1 worst


def label(im, text, colour=(255, 255, 255)):
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    w = d.textlength(text, font=font)
    d.rectangle([0, im.height - 22, w + 10, im.height], fill=(0, 0, 0))
    d.text((5, im.height - 20), text, fill=colour, font=font)


def tile(path, text, colour=(255, 255, 255), size=300):
    im = Image.open(DATA / path).convert("RGB")
    im.thumbnail((size, size))
    canvas = Image.new("RGB", (size, size), (235, 235, 235))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    label(canvas, text, colour)
    return canvas


OUT.mkdir(parents=True, exist_ok=True)
CACHE = OUT / "features.json"
cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
result, report = {}, {}
for class_id, entry in pool.items():
    cands = entry["candidates"]
    feats = [cache.setdefault(c["image"], features(c["path"])) if c["image"] not in cache else cache[c["image"]] for c in cands]
    area_bad = [abs(np.log(max(f["area"], 1e-3) / 0.3)) for f in feats]
    shape_bad = [abs(np.log(max(f["shape"], 1e-3) / 1.1)) for f in feats]
    conf = [c["conf"] if c["conf"] is not None else 0.0 for c in cands]
    score = (
        1.5 * ranks(feats_c := [f["clutter"] for f in feats], higher_better=False)
        + 1.2 * ranks([f["cut"] for f in feats], higher_better=False)
        + 1.0 * ranks(area_bad, higher_better=False)
        + 0.7 * ranks([f["sharp"] for f in feats])
        + 0.5 * ranks(shape_bad, higher_better=False)
        + 0.8 * ranks(conf)
        + 1.2 * ranks([f["skin"] for f in feats], higher_better=False)
    )
    order = np.argsort(score, kind="stable")
    # Never cut off, and not tiny: hard filters before the score.
    good = [i for i in order if feats[i]["cut"] < 0.08 and 0.04 < feats[i]["area"] < 0.8 and feats[i]["skin"] < 0.06]
    top, seen = [], set()
    for i in good + [i for i in order if i not in good]:
        if cands[i]["gbifID"] in seen:
            continue
        seen.add(cands[i]["gbifID"])
        top.append(i)
        if len(top) == 8:
            break
    result[class_id] = [cands[i]["image"] for i in top]
    report[class_id] = [
        {"image": cands[i]["image"], "score": round(float(score[i]), 2), **{k: round(v, 3) for k, v in feats[i].items()},
         "conf": cands[i]["conf"], "good": bool(i in good)}
        for i in top
    ]
    tiles = [tile(entry["current_path"], "CURRENT", (255, 220, 80))]
    tiles += [tile(cands[i]["path"], f"{n + 1}. {cands[i]['image']}") for n, i in enumerate(top)]
    sheet = Image.new("RGB", (3 * 300 + 2 * 6, 3 * 300 + 2 * 6 + 30), (255, 255, 255))
    ImageDraw.Draw(sheet).text((6, 8), class_id, fill=(0, 0, 0), font=ImageFont.truetype("DejaVuSans-Bold.ttf", 16))
    for n, t in enumerate(tiles):
        sheet.paste(t, ((n % 3) * 306, 30 + (n // 3) * 306))
    sheet.save(OUT / f"{class_id}.jpg", quality=85, optimize=True)
    print(class_id, "good", len(good), "of", len(cands), flush=True)
    CACHE.write_text(json.dumps(cache))

(OUT / "candidates.json").write_text(json.dumps(result, indent=1) + "\n")
(OUT / "scores.json").write_text(json.dumps(report, indent=1) + "\n")
