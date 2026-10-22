"""Drawn 3D models of species for the app (#45): a turned profile with a wavy cap, the
underside's ridges or gills in the geometry and a watercolour-like painted texture.

    uv run python -m seeni.models3d

Each model is drawn from the species' field marks (colour, underside, shape), not made from
a photo, so no side of it is guessed and its colours are the ones the species sheet names.
This writes web/public/species/3d/<class id>.glb and models.json, which the app reads. The
models are Seeni's own work.
"""

import io
import json
import struct
import sys
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageFilter

from seeni.paths import REPO_ROOT

TEX = 1024


@dataclass
class Spec:
    # Profile from the stem base centre, up the stem, along the underside to the margin and
    # over the cap to its centre: (r, y, region of the segment that starts here).
    profile: list
    colours: dict  # region -> (start rgb, end rgb) along the profile
    lines: dict  # underside lines: count, width, depth, fork, colour, highlight
    lobes: float = 0.06  # cap margin waviness (radius)
    lift: float = 0.03  # cap margin waviness (height)
    lobe_count: tuple = (5, 7, 11)
    bend: float = 0.04  # stem curve
    seed: int = 1
    tilt: float = 0.08  # cap leans to one side
    decurrent: float = 0.0  # how far the lines run down the stem (fraction of its length)
    cap_fibres: float = 0.0  # radial fibres on the cap top
    stem_fibres: str | None = None  # colour of fibres on the stem
    extra: dict = field(default_factory=dict)


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], np.float64) / 255


SPECS = {
    # Kantarelli: the whole mushroom egg-yolk yellow; a funnel cap with a wavy, rounded
    # margin; low, blunt, forked ridges running down onto the stem; firm, tapering stem.
    "cantharellus-cibarius": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.085, 0.004, "base"),
            (0.104, 0.03, "stem"),
            (0.098, 0.16, "stem"),
            (0.102, 0.30, "stem"),
            (0.115, 0.42, "gills"),
            (0.15, 0.55, "gills"),
            (0.25, 0.67, "gills"),
            (0.37, 0.76, "gills"),
            (0.46, 0.815, "margin"),
            (0.495, 0.85, "margin"),
            (0.49, 0.885, "top"),
            (0.43, 0.895, "top"),
            (0.30, 0.865, "top"),
            (0.16, 0.83, "top"),
            (0.0, 0.815, "top"),
        ],
        colours={
            "base": ("#c9a65a", "#e9c55a"),
            "stem": ("#efc94f", "#f4c535"),
            "gills": ("#f3c231", "#f2b51f"),
            "margin": ("#f2b51f", "#f6c43a"),
            "top": ("#f4bd2c", "#e9a215"),
        },
        lines={
            "count": 26,
            "width": 0.42,
            "depth": 0.022,
            "fork": True,
            "colour": "#c98a0c",
            "highlight": "#fde27a",
            "wiggle": 0.12,
        },
        lobes=0.09,
        lift=0.045,
        lobe_count=(3, 5, 8),
        seed=3,
        tilt=0.12,
        decurrent=0.45,
    ),
    # Valevahvero: orange; thin, dense, forked true gills, deeper orange; soft thin flesh,
    # a flatter cap with an inrolled margin and a darker, felty centre; a thinner stem.
    "hygrophoropsis-aurantiaca": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.055, 0.004, "base"),
            (0.066, 0.03, "stem"),
            (0.06, 0.20, "stem"),
            (0.062, 0.40, "stem"),
            (0.075, 0.50, "gills"),
            (0.16, 0.565, "gills"),
            (0.30, 0.615, "gills"),
            (0.41, 0.645, "margin"),
            (0.44, 0.655, "margin"),
            (0.455, 0.685, "margin"),
            (0.44, 0.715, "top"),
            (0.34, 0.725, "top"),
            (0.18, 0.70, "top"),
            (0.0, 0.675, "top"),
        ],
        colours={
            "base": ("#8f4a1c", "#b2601f"),
            "stem": ("#c8691f", "#e07a22"),
            "gills": ("#f08a22", "#f59a2c"),
            "margin": ("#f29a32", "#e3801f"),
            "top": ("#e8862a", "#b55a1a"),
        },
        lines={
            "count": 96,
            "width": 0.22,
            "depth": 0.004,
            "fork": True,
            "colour": "#c45e14",
            "highlight": "#ffb04a",
            "wiggle": 0.04,
        },
        lobes=0.06,
        lift=0.03,
        lobe_count=(4, 6, 9),
        bend=0.08,
        seed=5,
        tilt=0.1,
        decurrent=0.2,
    ),
    # Lehtomyrkkyseitikki: cap orange- to red-brown, convex with a low umbo, dry and finely
    # fibrous; rusty brown gills that do not run down the stem; a yellowish-ochre stem.
    "cortinarius-orellanus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.06, 0.004, "base"),
            (0.072, 0.03, "stem"),
            (0.068, 0.25, "stem"),
            (0.066, 0.50, "stem"),
            (0.07, 0.585, "gills"),
            (0.18, 0.60, "gills"),
            (0.30, 0.615, "gills"),
            (0.38, 0.63, "margin"),
            (0.405, 0.655, "margin"),
            (0.40, 0.70, "top"),
            (0.34, 0.79, "top"),
            (0.22, 0.86, "top"),
            (0.10, 0.89, "top"),
            (0.04, 0.915, "top"),
            (0.0, 0.92, "top"),
        ],
        colours={
            "base": ("#b88a4e", "#c99a55"),
            "stem": ("#cf9a4e", "#c4853e"),
            "gills": ("#8c4a22", "#9e5528"),
            "margin": ("#b8622c", "#b45a28"),
            "top": ("#b9602b", "#8f3f1c"),
        },
        lines={
            "count": 72,
            "width": 0.26,
            "depth": 0.005,
            "fork": False,
            "colour": "#5e2f15",
            "highlight": "#b56a35",
        },
        lobes=0.025,
        lift=0.015,
        lobe_count=(4, 7, 11),
        bend=0.035,
        seed=7,
        tilt=0.05,
        cap_fibres=0.10,
        stem_fibres="#a4512b",
    ),
}


# --- Profile -----------------------------------------------------------------------------


def catmull_rom(points: np.ndarray, samples: int) -> np.ndarray:
    p = np.vstack([points[0], points, points[-1]])
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for t in np.linspace(0, 1, samples, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    out.append(points[-1])
    return np.array(out)


def resample(spec: Spec, n: int):
    """The profile as n points equally spaced along it, with each point's region."""
    pts = np.array([(r, y) for r, y, _ in spec.profile], np.float64)
    labels = [lab for _, _, lab in spec.profile]
    dense = catmull_rom(pts, 40)
    seg = np.repeat(np.arange(len(pts) - 1), 40)
    seg = np.append(seg, len(pts) - 2)
    d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(dense, axis=0), axis=1))])
    s = np.linspace(0, d[-1], n)
    r = np.interp(s, d, dense[:, 0])
    y = np.interp(s, d, dense[:, 1])
    k = np.clip(np.searchsorted(d, s, side="right") - 1, 0, len(seg) - 1)
    region = np.array([labels[seg[i]] for i in k])
    r[0] = r[-1] = 0.0
    return r, y, region, s / d[-1]


# --- Underside lines (ridges or gills), shared by geometry and texture -------------------


def line_field(u: np.ndarray, t: np.ndarray, lines: dict) -> np.ndarray:
    """0..1 ridge profile at angle u (0..1) and position t (0 at the stem, 1 at the margin).
    With `fork`, every other line splits off a neighbour halfway out, as in a Y."""
    n = lines["count"]
    width = lines["width"]
    wiggle = lines.get("wiggle", 0.0)
    phase = (u * n + wiggle * np.sin(np.clip(t, 0, 1) * 9.0 + u * 37.0)) % 1.0
    primary = np.abs(phase - 0.5)  # distance to a primary line, in line spacings
    shift = 0.5 * np.clip((t - 0.35) / 0.3, 0, 1) ** 1.5 if lines["fork"] else 0.5
    second = np.minimum(np.abs(phase - 0.5 - shift), np.abs(phase - 0.5 + shift))
    start = np.clip((t - 0.3) / 0.15, 0, 1)  # the second lines start out from the stem
    a = np.exp(-((primary / (width / 2)) ** 2))
    b = np.exp(-((second / (width / 2)) ** 2)) * start
    return np.maximum(a, b)


# --- Painted texture ---------------------------------------------------------------------


def noise(shape, cells, rng, stretch=(1, 1)) -> np.ndarray:
    """Smooth noise in -1..1, periodic across u (columns)."""
    gu, gv = max(2, cells // stretch[0]), max(2, cells // stretch[1])
    grid = rng.uniform(-1, 1, (gv, gu))
    tiled = np.hstack([grid, grid, grid])
    img = Image.fromarray(((tiled + 1) * 127.5).astype(np.uint8)).resize(
        (shape[1] * 3, shape[0]), Image.Resampling.BICUBIC
    )
    a = np.asarray(img, np.float64)[:, shape[1] : 2 * shape[1]]
    return a / 127.5 - 1


def paint(spec: Spec, region_rows: np.ndarray, t_rows: np.ndarray, gill_t: np.ndarray):
    rng = np.random.default_rng(spec.seed)
    h = w = TEX
    tex = np.zeros((h, w, 3))
    for name, (c0, c1) in spec.colours.items():
        rows = region_rows == name
        if not rows.any():
            continue
        idx = np.where(rows)[0]
        f = (idx - idx[0]) / max(len(idx) - 1, 1)
        tex[idx] = (rgb(c0)[None] * (1 - f[:, None]) + rgb(c1)[None] * f[:, None])[:, None, :]
    # Blend region borders so there is no hard seam.
    tex = (
        np.asarray(
            Image.fromarray((tex * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur((0, 6))),
            np.float64,
        )
        / 255
    )

    # Watercolour: broad blotches, and fine strokes running along the profile.
    blot = noise((h, w), 8, rng) * 0.08 + noise((h, w), 26, rng) * 0.04
    strokes = noise((h, w), 180, rng, stretch=(1, 24)) * 0.035
    tex *= (1 + blot + strokes)[..., None]

    u = (np.arange(w) + 0.5) / w
    # The underside, and the part of the stem the lines run down onto (t < 0, fading out).
    gills = (region_rows == "gills") | (gill_t < 0)
    if gills.any():
        U, T = np.meshgrid(u, gill_t[gills])
        weight = np.clip(1 + np.minimum(T, 0), 0, 1)[..., None]
        ridge = line_field(U, T, spec.lines)[..., None] * weight
        shade = line_field(U - 0.12 / spec.lines["count"], T, spec.lines)[..., None] * weight
        dark, light = rgb(spec.lines["colour"]), rgb(spec.lines["highlight"])
        g = tex[gills]
        g = g * (1 - 0.55 * shade) + dark * 0.55 * shade
        g = g * (1 - 0.35 * ridge * (1 - shade)) + light * (0.35 * ridge * (1 - shade))
        # Deeper between the lines near the stem, like a drawn shadow.
        g *= (1 - 0.12 * (1 - np.clip(T, 0, 1)) * weight[..., 0])[..., None]
        tex[gills] = g

    top = region_rows == "top"
    if spec.cap_fibres:
        fib = noise((h, w), 320, rng, stretch=(1, 30))
        tex[top] *= (1 + spec.cap_fibres * fib[top])[..., None]
    if spec.stem_fibres:
        fib = noise((h, w), 240, rng, stretch=(1, 30))
        stem = region_rows == "stem"
        m = np.clip((fib[stem] - 0.25) / 0.35, 0, 1)[..., None] * 0.55
        tex[stem] = tex[stem] * (1 - m) + rgb(spec.stem_fibres) * m

    # A soft dark edge along the margin, the illustration's outline.
    margin = np.where(region_rows == "margin")[0]
    if len(margin):
        mid = margin.mean()
        edge = np.exp(-(((np.arange(h) - mid) / (len(margin) * 0.35)) ** 2))
        tex *= (1 - 0.16 * edge)[:, None, None]
    # Stem fibres for the seitikki, a slightly felted centre for the cap.
    if spec.extra.get("fibres", True):
        fib = noise((h, w), 260, rng, stretch=(1, 40))
        stem = region_rows == "stem"
        tex[stem] *= (1 + 0.04 * fib[stem])[..., None]
    return np.clip(tex, 0, 1)


# --- Mesh --------------------------------------------------------------------------------


def build(spec: Spec, rings: int = 120, segments: int = 150):
    rng = np.random.default_rng(spec.seed)
    r, y, region, s = resample(spec, rings)
    # t along the underside: 0 at the stem, 1 at the margin.
    gill_idx = np.where(region == "gills")[0]
    t = np.zeros(rings)
    if len(gill_idx):
        t[gill_idx] = np.linspace(0, 1, len(gill_idx))
    # Decurrent lines: t runs from 0 at the stem top to -1 where they fade out.
    stem_idx = np.where(region == "stem")[0]
    t[np.isin(region, ["stem", "base"])] = -1  # no lines, and no ramp into them
    m = int(len(stem_idx) * spec.decurrent)
    if m:
        t[stem_idx[-m:]] = np.linspace(-1, 0, m, endpoint=False)

    # Outward profile normals in the (r, y) plane.
    tang = np.gradient(np.stack([r, y], 1), axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True).clip(1e-9)
    n2 = np.stack([tang[:, 1], -tang[:, 0]], 1)
    if n2[len(r) // 5, 0] < 0:
        n2 = -n2

    theta = np.linspace(0, 2 * np.pi, segments + 1)
    u = theta / (2 * np.pi)
    wave_r = np.zeros_like(theta)
    wave_y = np.zeros_like(theta)
    for k in spec.lobe_count:
        wave_r += np.cos(k * theta + rng.uniform(0, 2 * np.pi)) / len(spec.lobe_count)
        wave_y += np.sin(k * theta + rng.uniform(0, 2 * np.pi)) / len(spec.lobe_count)
    rmax = r.max()
    cap = np.isin(region, ["gills", "margin", "top"])
    wcap = np.where(cap, (r / rmax) ** 2.5, 0.0)
    stem_top = y[gill_idx[0]] if len(gill_idx) else y.max()

    R = r[:, None] * (1 + spec.lobes * wcap[:, None] * wave_r[None])
    Y = y[:, None] + spec.lift * wcap[:, None] * wave_y[None]
    # Ridges or gills in the geometry, along the profile normal.
    if len(gill_idx):
        U, T = np.meshgrid(u, t)
        # Full height at the stem when the lines run down it, else they rise from it;
        # they always flatten out at the margin.
        rise = 1.0 if spec.decurrent else np.clip(T / 0.1, 0, 1)
        fade = np.where(T < 0, 1 + T, rise * np.clip((1 - T) / 0.12, 0, 1) ** 0.5)
        bump = line_field(U, T, spec.lines) * fade * spec.lines["depth"]
        bump[~((region == "gills") | (t < 0))] = 0
        R = R + bump * n2[:, 0:1]
        Y = Y + bump * n2[:, 1:2]
    bend = spec.bend * np.clip((stem_top - y) / stem_top, 0, 1) ** 2
    X = R * np.cos(theta)[None] + bend[:, None] + spec.tilt * np.clip(Y - stem_top, 0, None)
    Z = R * np.sin(theta)[None]
    pos = np.stack([X, Y, Z], -1).reshape(-1, 3)

    cols = segments + 1
    i = np.arange(rings - 1)[:, None] * cols + np.arange(segments)[None]
    a, b, c, d = i, i + 1, i + cols, i + cols + 1
    faces = np.concatenate([np.stack([a, c, b], -1), np.stack([b, c, d], -1)], 0).reshape(-1, 3)
    # Vertex normals from the faces, averaged across the seam.
    fn = np.cross(pos[faces[:, 1]] - pos[faces[:, 0]], pos[faces[:, 2]] - pos[faces[:, 0]])
    nrm = np.zeros_like(pos)
    for k in range(3):
        np.add.at(nrm, faces[:, k], fn)
    grid = nrm.reshape(rings, cols, 3)
    seam = grid[:, 0] + grid[:, -1]
    grid[:, 0] = grid[:, -1] = seam
    # The poles: one shared normal straight down or up.
    grid[0] = grid[0].sum(0)
    grid[-1] = grid[-1].sum(0)
    nrm = grid.reshape(-1, 3)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True).clip(1e-12)
    if np.dot(nrm[len(nrm) // 3], pos[len(nrm) // 3] - [0, pos[len(nrm) // 3, 1], 0]) < 0:
        nrm = -nrm
        faces = faces[:, [0, 2, 1]]

    uv = np.stack(np.meshgrid(u, s), -1).reshape(-1, 2)
    region_rows = region[
        np.clip((np.arange(TEX) + 0.5) / TEX * (rings - 1), 0, rings - 1).round().astype(int)
    ]
    s_rows = (np.arange(TEX) + 0.5) / TEX
    gill_rows = np.interp(s_rows, s, t)
    tex = paint(spec, region_rows, s_rows, gill_rows)
    return pos.astype(np.float32), nrm.astype(np.float32), uv.astype(np.float32), faces, tex


def write_glb(path, pos, nrm, uv, faces, tex, quality=86):
    jpg = io.BytesIO()
    Image.fromarray((tex * 255).astype(np.uint8)).save(jpg, "JPEG", quality=quality, optimize=True)
    idx = faces.astype(np.uint16 if len(pos) < 65536 else np.uint32).reshape(-1)
    blobs = [pos.tobytes(), nrm.tobytes(), uv.tobytes(), idx.tobytes(), jpg.getvalue()]
    views, bin_ = [], b""
    for blob in blobs:
        bin_ += b"\0" * ((-len(bin_)) % 4)
        views.append({"buffer": 0, "byteOffset": len(bin_), "byteLength": len(blob)})
        bin_ += blob
    bin_ += b"\0" * ((-len(bin_)) % 4)
    for k in range(3):
        views[k]["target"] = 34962
    views[3]["target"] = 34963
    gltf = {
        "asset": {"version": "2.0", "generator": "seeni.models3d"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                        "indices": 3,
                        "material": 0,
                    }
                ]
            }
        ],
        "materials": [
            {
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.9,
                }
            }
        ],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987}],
        "images": [{"bufferView": 4, "mimeType": "image/jpeg"}],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(pos),
                "type": "VEC3",
                "min": pos.min(0).tolist(),
                "max": pos.max(0).tolist(),
            },
            {"bufferView": 1, "componentType": 5126, "count": len(nrm), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(uv), "type": "VEC2"},
            {
                "bufferView": 3,
                "componentType": 5123 if idx.dtype == np.uint16 else 5125,
                "count": idx.size,
                "type": "SCALAR",
            },
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        fh.write(struct.pack("<II", len(bin_), 0x004E4942) + bin_)


OUT = REPO_ROOT / "web" / "public" / "species" / "3d"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    listed = {}
    for class_id, spec in SPECS.items():
        mesh = build(spec)
        write_glb(OUT / f"{class_id}.glb", *mesh)
        listed[class_id] = {"file": f"{class_id}.glb", "drawn": True}
        size = (OUT / f"{class_id}.glb").stat().st_size
        print(f"{class_id}: {len(mesh[0])} vertices, {size / 1e6:.2f} MB")
    (OUT / "models.json").write_text(json.dumps(listed, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
