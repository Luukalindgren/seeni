"""The drawn species 3D models (#45): valid GLBs the app can read, small, and painted in the
colours the species sheets name (hard rule 6: colour is a field mark)."""

import io
import json
import struct

import numpy as np
import pytest
from PIL import Image

from seeni import models3d
from seeni.models3d import SPECS, build, rgb, write_glb
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
    assert len(data) < 1.5e6
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
