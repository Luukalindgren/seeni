"""The drawn species 3D models (#45): valid GLBs the app can read, small, and painted in the
colours the species sheets name (hard rule 6: colour is a field mark)."""

import dataclasses
import io
import json
import struct

import numpy as np
import pytest
from PIL import Image

from seeni import models3d
from seeni.models3d import SPECS, build, grid_strip, rgb, strip_triangles, turned_set, write_glb
from seeni.paths import REPO_ROOT


def read_glb(data: bytes):
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert (magic, version, length) == (0x46546C67, 2, len(data))
    jlen, jtype = struct.unpack_from("<II", data, 12)
    assert jtype == 0x4E4F534A
    gltf = json.loads(data[20 : 20 + jlen])
    blen, btype = struct.unpack_from("<II", data, 20 + jlen)
    assert btype == 0x004E4942
    return gltf, data[28 + jlen : 28 + jlen + blen]


@pytest.mark.parametrize("class_id", sorted(SPECS))
def test_model_is_a_small_valid_glb(tmp_path, class_id):
    pos, nrm, uv, faces, tex = build(SPECS[class_id])
    path = tmp_path / f"{class_id}.glb"
    write_glb(path, pos, nrm, uv, faces, tex)
    data = path.read_bytes()
    assert len(data) < 0.75e6
    gltf, bin_ = read_glb(data)
    prim = gltf["meshes"][0]["primitives"][0]
    assert set(prim["attributes"]) == {"POSITION", "NORMAL", "TEXCOORD_0"}
    # uint16 indices: the app reads them without an extension.
    assert gltf["accessors"][prim["indices"]]["componentType"] == 5123
    assert faces.max() < len(pos)
    # It stands on y = 0, upright, and its normals are unit length.
    assert abs(pos[:, 1].min()) < 0.02
    assert pos[:, 1].max() > 0.6
    assert np.allclose(np.linalg.norm(nrm, axis=1), 1, atol=1e-3)
    assert uv.min() >= 0 and uv.max() <= 1
    view = gltf["bufferViews"][gltf["images"][0]["bufferView"]]
    jpeg = bin_[view["byteOffset"] : view["byteOffset"] + view["byteLength"]]
    assert Image.open(io.BytesIO(jpeg)).format == "JPEG"


@pytest.mark.parametrize("class_id", ["cantharellus-cibarius", "amanita-virosa", "morchella"])
def test_the_quantized_glb_holds_the_built_mesh(tmp_path, class_id):
    """Positions, normals and UVs come back within their quantization step, and the strip
    draws exactly the built triangles, turned the same way."""
    pos, nrm, uv, faces, tex = build(SPECS[class_id])
    path = tmp_path / "m.glb"
    write_glb(path, pos, nrm, uv, faces, tex)
    gltf, bin_ = read_glb(path.read_bytes())
    assert "KHR_mesh_quantization" in gltf["extensionsRequired"]
    node = gltf["nodes"][0]
    prim = gltf["meshes"][0]["primitives"][0]
    assert prim["mode"] == 5
    acc, views = gltf["accessors"], gltf["bufferViews"]

    def read(index, dtype, width):
        a = acc[index]
        v = views[a["bufferView"]]
        raw = np.frombuffer(
            bin_, dtype, v["byteLength"] // np.dtype(dtype).itemsize, v["byteOffset"]
        )
        return raw.reshape(a["count"], -1)[:, :width]

    q = read(prim["attributes"]["POSITION"], np.int16, 3) / 32767
    back = q * np.array(node["scale"]) + np.array(node["translation"])
    extent = (pos.max(0) - pos.min(0)).max()
    assert np.abs(back - pos).max() < extent / 32767
    n = read(prim["attributes"]["NORMAL"], np.int8, 3) / 127
    assert np.abs(n - nrm).max() <= 0.5 / 127 + 1e-6
    t = read(prim["attributes"]["TEXCOORD_0"], np.uint16, 2) / 65535
    assert np.abs(t - uv).max() <= 0.5 / 65535 + 1e-6
    strip = read(prim["indices"], np.uint16, 1).reshape(-1)
    assert len(strip) < len(faces) * 3 / 2.5
    assert len(strip_triangles(strip)) == len(faces)
    # Checked here without grid_strip's own check: the strip as written draws the faces.
    assert turned_set(strip_triangles(strip)) == turned_set(faces)


def test_a_mesh_that_is_not_a_ring_grid_stays_a_triangle_list():
    faces = np.array([[0, 2, 1], [1, 2, 3], [0, 3, 2]])
    assert grid_strip(faces, 4) is None
    assert grid_strip(np.zeros((0, 3), int), 0) is None
    assert grid_strip(np.array([[0, 3, 1]]), 3) is None  # one ring, no quads


def test_turned_set_keeps_the_winding():
    assert turned_set(np.array([[2, 0, 1]])) == {(0, 1, 2)}
    assert turned_set(np.array([[0, 2, 1]])) != turned_set(np.array([[0, 1, 2]]))


def hue(colour) -> float:
    r, g, b = colour
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return 0.0
    if mx == r:
        return (60 * (g - b) / (mx - mn)) % 360
    if mx == g:
        return 60 * (b - r) / (mx - mn) + 120
    return 60 * (r - g) / (mx - mn) + 240


def region_colour(class_id: str, region: str) -> np.ndarray:
    spec = SPECS[class_id]
    _, _, _, _, tex = build(spec)
    rows = models3d.resample(spec, spec.rings)[2][models3d.ring_of_rows(spec.rings)]
    return tex[rows == region].reshape(-1, 3).mean(0)


def test_the_chanterelle_is_yellow_everywhere():
    for region in ("top", "gills", "stem"):
        h = hue(region_colour("cantharellus-cibarius", region))
        assert 38 <= h <= 55, f"{region}: hue {h:.0f}"


def test_the_false_chanterelle_is_more_orange_than_the_chanterelle():
    for region in ("top", "gills"):
        false = hue(region_colour("hygrophoropsis-aurantiaca", region))
        real = hue(region_colour("cantharellus-cibarius", region))
        assert false < real - 8, f"{region}: {false:.0f} vs {real:.0f}"


def test_the_webcap_has_rusty_brown_gills_darker_than_its_cap():
    gills = region_colour("cortinarius-orellanus", "gills")
    cap = region_colour("cortinarius-orellanus", "top")
    assert 10 <= hue(gills) <= 35
    assert gills.mean() < cap.mean()


def test_the_published_models_are_the_generated_ones():
    listed = json.loads((REPO_ROOT / "web/public/species/3d/models.json").read_text())
    assert set(listed) == set(SPECS)
    for class_id, m in listed.items():
        assert m == {"file": f"{class_id}-drawn.glb", "drawn": True}
        assert (REPO_ROOT / "web/public/species/3d" / m["file"]).exists()


def test_the_generator_is_deterministic(tmp_path):
    a, b = tmp_path / "a.glb", tmp_path / "b.glb"
    for path in (a, b):
        write_glb(path, *build(SPECS["cantharellus-cibarius"]))
    assert a.read_bytes() == b.read_bytes()


def test_rgb():
    assert np.allclose(rgb("#ff8000"), [1, 128 / 255, 0])


@pytest.mark.parametrize("class_id", [k for k in SPECS if k.startswith("amanita-")])
def test_the_amanitas_have_white_gills_a_ring_and_a_volva(class_id):
    gills = region_colour(class_id, "gills")
    assert gills.mean() > 0.85 and gills.max() - gills.min() < 0.08
    regions = set(models3d.resample(SPECS[class_id], SPECS[class_id].rings)[2])
    assert {"ring", "volva"} <= regions


def test_the_amanita_caps_keep_their_colours():
    assert hue(region_colour("amanita-muscaria", "top")) < 12
    assert 50 <= hue(region_colour("amanita-phalloides", "top")) <= 75
    virosa = region_colour("amanita-virosa", "top")
    assert virosa.min() > 0.85 and virosa.max() - virosa.min() < 0.08


def test_the_deadly_webcap_has_yellow_belts_on_its_stem():
    spec = SPECS["cortinarius-rubellus"]
    _, _, _, _, tex = build(spec)
    rows = models3d.resample(spec, spec.rings)[2][models3d.ring_of_rows(spec.rings)]
    stem = tex[rows == "stem"].reshape(-1, 3)
    hues = np.array([hue(p) for p in stem[::97]])
    # Mostly orange-brown, with belts of yellow.
    assert np.median(hues) < 30
    assert (hues > 42).mean() > 0.03
    assert hue(region_colour("cortinarius-rubellus", "gills")) < 30


def test_the_false_morel_cap_is_folded_and_reddish_brown():
    spec = SPECS["gyromitra-esculenta"]
    folded, *_ = build(spec)
    smooth, *_ = build(dataclasses.replace(spec, wrinkles=None))
    rows = models3d.resample(spec, spec.rings)[2]
    moved = np.linalg.norm(folded - smooth, axis=1).reshape(spec.rings, -1)[rows == "top"]
    # The folds stand out about the fold depth, all over the cap.
    assert np.percentile(moved, 75) > spec.wrinkles["depth"] * 0.25
    assert (moved > 0.005).mean() > 0.5
    assert hue(region_colour("gyromitra-esculenta", "top")) < 25


def test_the_sickener_is_scarlet_with_white_gills():
    assert (
        hue(region_colour("russula-emetica", "top")) < 12
        or hue(region_colour("russula-emetica", "top")) > 350
    )
    gills = region_colour("russula-emetica", "gills")
    assert gills.mean() > 0.85 and gills.max() - gills.min() < 0.08


def test_the_false_morels_cap_hangs_free_but_the_morels_is_joined():
    # Poimukellomörsky: the cap's inside runs from its margin up to the stem top, so the
    # margin stands well clear of the stem. Huhtasieni: the cap meets the stem at its base.
    verpa = SPECS["verpa-bohemica"]
    r, y, region, _ = models3d.resample(verpa, verpa.rings)
    stem_r = r[region == "stem"].max()
    assert r[region == "margin"].min() > 2 * stem_r
    assert y[region == "under"].max() > y[region == "margin"].max() + 0.2
    morel = SPECS["morchella"]
    r, y, region, _ = models3d.resample(morel, morel.rings)
    assert y[region == "under"].max() - y[region == "under"].min() < 0.08


@pytest.mark.parametrize("class_id", sorted(SPECS))
def test_every_region_keeps_the_colours_it_is_given(class_id):
    # Catches a gradient overshooting its colours (it wraps around in uint8, to black).
    spec = SPECS[class_id]
    _, _, _, _, tex = build(spec)
    rows = models3d.resample(spec, spec.rings)[2][models3d.ring_of_rows(spec.rings)]
    for region, (c0, c1) in spec.colours.items():
        if not (rows == region).any():
            continue
        lo = np.minimum(rgb(c0), rgb(c1)) - 0.3
        hi = np.maximum(rgb(c0), rgb(c1)) + 0.3
        row_means = tex[rows == region].mean(axis=1)
        inside = ((row_means >= lo) & (row_means <= hi)).all(axis=1)
        # Borders blur into the next region, and lines are painted over the gills.
        assert inside.mean() > 0.9, region


BOLETES = [
    "boletus-edulis-agg",
    "tylopilus-felleus",
    "leccinum-versipelle-agg",
    "leccinum-scabrum",
    "suillus-variegatus",
    "suillus-luteus",
    "suillus-bovinus",
]


@pytest.mark.parametrize("class_id", BOLETES)
def test_the_boletes_have_pores_not_gills(class_id):
    spec = SPECS[class_id]
    assert spec.lines["kind"] == "pores"
    _, _, _, _, tex = build(spec)
    rows = models3d.resample(spec, spec.rings)[2][models3d.ring_of_rows(spec.rings)]
    under = tex[rows == "gills"].mean(axis=2)
    plain = dataclasses.replace(spec, lines={**spec.lines, "colour": spec.lines["highlight"]})
    unpainted = build(plain)[4][rows == "gills"].mean(axis=2)
    assert np.abs(under - unpainted).mean() > 0.008
    # Dots, not lines: the shade also changes from the stem to the margin, which on gills
    # it hardly does (about 0.0016 on the milkcaps and brittlegills).
    assert np.abs(np.diff(under, axis=0)).mean() > 0.003


def test_the_cep_has_a_white_net_on_its_upper_stem_and_the_bitter_bolete_a_dark_one():
    def stem_spread(class_id):
        spec = SPECS[class_id]
        _, _, _, _, tex = build(spec)
        rows = models3d.resample(spec, spec.rings)[2][models3d.ring_of_rows(spec.rings)]
        stem = tex[rows == "stem"].mean(axis=2)
        top = stem[-len(stem) // 4 :]
        return top.max() - np.median(top), np.median(top) - top.min()

    lighter, _ = stem_spread("boletus-edulis-agg")
    assert lighter > 0.06
    _, darker = stem_spread("tylopilus-felleus")
    assert darker > 0.2


@pytest.mark.parametrize("class_id", ["leccinum-versipelle-agg", "leccinum-scabrum"])
def test_the_scaber_stalks_have_dark_scales_on_a_pale_stem(class_id):
    spec = SPECS[class_id]
    _, _, _, _, tex = build(spec)
    rows = models3d.resample(spec, spec.rings)[2][models3d.ring_of_rows(spec.rings)]
    stem = tex[rows == "stem"].mean(axis=2)
    assert np.median(stem) > 0.8
    assert 0.01 < (stem < 0.35).mean() < 0.3


def test_the_hedgehogs_spines_stand_out_from_under_the_cap():
    spec = SPECS["hydnum-repandum-agg"]
    spines, *_ = build(spec)
    flat, *_ = build(dataclasses.replace(spec, lines={**spec.lines, "depth": 0.0}))
    rows = models3d.resample(spec, spec.rings)[2]
    moved = np.linalg.norm(spines - flat, axis=1).reshape(spec.rings, -1)[rows == "gills"]
    assert moved.max() > spec.lines["depth"] * 0.8
