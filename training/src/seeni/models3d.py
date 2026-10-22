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
from dataclasses import dataclass

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
    # Veil remnants on the cap: {"colour", "count", "size" (radius), "relief" (0..1)}.
    spots: dict | None = None
    # Stripes across a region, e.g. the warty rings on a bulb: {"region", "count", "colour"}.
    bands: dict | None = None
    volva_lobes: float = 0.0  # waviness of a sac volva's free rim (radius)
    rings: int = 120  # mesh resolution along the profile
    # Brain-like folds over the cap: {"depth", "cells"}; grooves follow the noise's zero lines.
    wrinkles: dict | None = None
    # A net over the top of the stem: {"colour", "cells", "reach", "stretch", "strength"}.
    stem_net: dict | None = None


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], np.float64) / 255


AMANITA_LINES = {
    "count": 110,
    "width": 0.3,
    "depth": 0.003,
    "fork": False,
    "colour": "#e2ded2",
    "highlight": "#ffffff",
}

RUSSULA_LINES = {
    "count": 96,
    "width": 0.3,
    "depth": 0.004,
    "fork": False,
    "colour": "#d8ccae",
    "highlight": "#fffaf0",
}

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
    # Punakärpässieni: a bright red cap, flat to convex, with white warts; white free gills;
    # a white stem with a hanging white ring; a rounded bulb ringed with white warts.
    "amanita-muscaria": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.09, 0.006, "volva"),
            (0.135, 0.05, "volva"),
            (0.125, 0.11, "volva"),
            (0.085, 0.15, "stem"),
            (0.07, 0.24, "stem"),
            (0.064, 0.50, "ring"),
            (0.068, 0.555, "ring"),
            (0.095, 0.53, "ring"),
            (0.118, 0.47, "ring"),
            (0.11, 0.465, "ring"),
            (0.085, 0.53, "stem"),
            (0.064, 0.56, "stem"),
            (0.06, 0.66, "gills"),
            (0.07, 0.675, "gills"),
            (0.20, 0.69, "gills"),
            (0.34, 0.705, "gills"),
            (0.41, 0.72, "margin"),
            (0.425, 0.75, "margin"),
            (0.41, 0.79, "top"),
            (0.33, 0.85, "top"),
            (0.20, 0.885, "top"),
            (0.0, 0.90, "top"),
        ],
        colours={
            "base": ("#e9e4d6", "#f2eee2"),
            "volva": ("#e9dfc4", "#efe6cf"),
            "stem": ("#f4f1e6", "#fbf9f2"),
            "ring": ("#fbf9f1", "#efeadc"),
            "gills": ("#f6f2e6", "#fbf8ee"),
            "margin": ("#f0d79a", "#e3402a"),
            "top": ("#dc2a1c", "#c41e14"),
        },
        lines=AMANITA_LINES,
        lobes=0.025,
        lift=0.015,
        lobe_count=(4, 7, 11),
        bend=0.03,
        seed=11,
        tilt=0.05,
        spots={"colour": "#fbf7ea", "count": 70, "size": 0.026, "relief": 0.7},
        bands={"region": "volva", "count": 3, "colour": "#fffdf5"},
        rings=160,
    ),
    # Pantterikärpässieni: a brown cap with small, pure white warts; white free gills; a white
    # stem with a ring that does not hang much; a bulb with a sharp collar-like rim.
    "amanita-pantherina": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.08, 0.006, "volva"),
            (0.115, 0.045, "volva"),
            (0.11, 0.09, "volva"),
            (0.12, 0.105, "volva"),
            (0.085, 0.11, "stem"),
            (0.065, 0.16, "stem"),
            (0.058, 0.45, "ring"),
            (0.062, 0.50, "ring"),
            (0.09, 0.48, "ring"),
            (0.098, 0.465, "ring"),
            (0.075, 0.48, "stem"),
            (0.058, 0.51, "stem"),
            (0.055, 0.60, "gills"),
            (0.065, 0.615, "gills"),
            (0.19, 0.63, "gills"),
            (0.32, 0.645, "gills"),
            (0.38, 0.66, "margin"),
            (0.39, 0.685, "margin"),
            (0.375, 0.72, "top"),
            (0.30, 0.775, "top"),
            (0.18, 0.80, "top"),
            (0.0, 0.81, "top"),
        ],
        colours={
            "base": ("#e6e0d0", "#efe9da"),
            "volva": ("#f1ece0", "#fbf8f0"),
            "stem": ("#f3f0e6", "#faf8f1"),
            "ring": ("#faf8f1", "#ece6d6"),
            "gills": ("#f6f3ea", "#fbf9f2"),
            "margin": ("#c9b08a", "#8a6a45"),
            "top": ("#7f5e3c", "#5e4128"),
        },
        lines=AMANITA_LINES,
        lobes=0.02,
        lift=0.012,
        lobe_count=(4, 7, 11),
        bend=0.03,
        seed=13,
        tilt=0.04,
        spots={"colour": "#fdfcf6", "count": 110, "size": 0.014, "relief": 0.6},
        rings=160,
    ),
    # Ruskokärpässieni: a liver-brown cap with yellowish-grey warts; white gills; a pale
    # stem with a ring; a bulb ringed with yellowish-brown warts.
    "amanita-regalis": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.09, 0.006, "volva"),
            (0.14, 0.05, "volva"),
            (0.13, 0.115, "volva"),
            (0.09, 0.16, "stem"),
            (0.075, 0.25, "stem"),
            (0.068, 0.52, "ring"),
            (0.072, 0.575, "ring"),
            (0.10, 0.55, "ring"),
            (0.122, 0.49, "ring"),
            (0.114, 0.485, "ring"),
            (0.09, 0.55, "stem"),
            (0.068, 0.58, "stem"),
            (0.064, 0.68, "gills"),
            (0.075, 0.695, "gills"),
            (0.21, 0.71, "gills"),
            (0.35, 0.725, "gills"),
            (0.43, 0.74, "margin"),
            (0.445, 0.77, "margin"),
            (0.43, 0.81, "top"),
            (0.34, 0.87, "top"),
            (0.20, 0.905, "top"),
            (0.0, 0.92, "top"),
        ],
        colours={
            "base": ("#d8c9a2", "#e2d4ae"),
            "volva": ("#e6d9b6", "#efe6cc"),
            "stem": ("#efe8d4", "#f6f1e4"),
            "ring": ("#f4efe0", "#e6dcc2"),
            "gills": ("#f6f2e6", "#fbf8ee"),
            "margin": ("#a77a48", "#7c5330"),
            "top": ("#76502c", "#5a3a1e"),
        },
        lines=AMANITA_LINES,
        lobes=0.025,
        lift=0.015,
        lobe_count=(4, 7, 11),
        bend=0.03,
        seed=17,
        tilt=0.05,
        spots={"colour": "#d9cf9a", "count": 80, "size": 0.024, "relief": 0.7},
        bands={"region": "volva", "count": 3, "colour": "#c9b277"},
        rings=160,
    ),
    # Kavalakärpässieni: an olive-green to yellowish-green cap with dark radial fibres and no
    # warts; white free gills; a white stem with a ring; a large white sac-like volva.
    "amanita-phalloides": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.10, 0.008, "volva"),
            (0.14, 0.06, "volva"),
            (0.145, 0.13, "volva"),
            (0.155, 0.175, "volva"),
            (0.135, 0.18, "volva"),
            (0.10, 0.12, "volva"),
            (0.08, 0.08, "stem"),
            (0.072, 0.12, "stem"),
            (0.064, 0.50, "ring"),
            (0.068, 0.555, "ring"),
            (0.095, 0.53, "ring"),
            (0.116, 0.47, "ring"),
            (0.108, 0.465, "ring"),
            (0.085, 0.53, "stem"),
            (0.064, 0.56, "stem"),
            (0.06, 0.66, "gills"),
            (0.07, 0.675, "gills"),
            (0.20, 0.69, "gills"),
            (0.33, 0.705, "gills"),
            (0.395, 0.72, "margin"),
            (0.41, 0.75, "margin"),
            (0.395, 0.795, "top"),
            (0.31, 0.86, "top"),
            (0.18, 0.895, "top"),
            (0.0, 0.91, "top"),
        ],
        colours={
            "base": ("#e8e4d8", "#efebe0"),
            "volva": ("#f2efe6", "#e8e3d4"),
            "stem": ("#efeee2", "#f7f6ee"),
            "ring": ("#f8f7ef", "#e9e7da"),
            "gills": ("#f6f5ec", "#fbfaf3"),
            "margin": ("#c9c98a", "#a7a85a"),
            "top": ("#9a9c4c", "#6f7234"),
        },
        lines=AMANITA_LINES,
        lobes=0.02,
        lift=0.012,
        lobe_count=(4, 7, 11),
        bend=0.03,
        seed=19,
        tilt=0.05,
        cap_fibres=0.12,
        volva_lobes=0.05,
        rings=170,
    ),
    # Valkokärpässieni: pure white all over; a bell-shaped to conical cap; a ragged ring; a
    # shaggy stem; a white sac-like volva.
    "amanita-virosa": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.09, 0.008, "volva"),
            (0.125, 0.06, "volva"),
            (0.13, 0.12, "volva"),
            (0.14, 0.16, "volva"),
            (0.12, 0.165, "volva"),
            (0.09, 0.11, "volva"),
            (0.072, 0.075, "stem"),
            (0.064, 0.12, "stem"),
            (0.056, 0.56, "ring"),
            (0.06, 0.61, "ring"),
            (0.082, 0.59, "ring"),
            (0.104, 0.525, "ring"),
            (0.097, 0.52, "ring"),
            (0.075, 0.585, "stem"),
            (0.056, 0.615, "stem"),
            (0.054, 0.70, "gills"),
            (0.064, 0.715, "gills"),
            (0.17, 0.725, "gills"),
            (0.28, 0.735, "gills"),
            (0.335, 0.745, "margin"),
            (0.345, 0.775, "margin"),
            (0.31, 0.85, "top"),
            (0.23, 0.95, "top"),
            (0.12, 1.02, "top"),
            (0.04, 1.045, "top"),
            (0.0, 1.05, "top"),
        ],
        colours={
            "base": ("#e9e7e0", "#f0eee8"),
            "volva": ("#f4f3ee", "#e8e6de"),
            "stem": ("#f3f2ec", "#fbfbf7"),
            "ring": ("#fbfbf6", "#e8e6dc"),
            "gills": ("#f8f8f2", "#fdfdf9"),
            "margin": ("#f6f5ee", "#fbfbf6"),
            "top": ("#fcfcf7", "#f1efe4"),
        },
        lines=AMANITA_LINES,
        lobes=0.03,
        lift=0.02,
        lobe_count=(3, 5, 9),
        bend=0.04,
        seed=23,
        tilt=0.06,
        stem_fibres="#dcd9cc",
        volva_lobes=0.045,
        rings=170,
    ),
    # Suippumyrkkyseitikki: a pointed orange-brown cap with a sharp umbo, finely fibrous;
    # rusty brown gills; a long orange-brown stem with lemon-yellow belts of veil.
    "cortinarius-rubellus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.05, 0.004, "base"),
            (0.062, 0.03, "stem"),
            (0.056, 0.30, "stem"),
            (0.05, 0.60, "stem"),
            (0.048, 0.66, "gills"),
            (0.13, 0.67, "gills"),
            (0.22, 0.675, "gills"),
            (0.265, 0.685, "margin"),
            (0.275, 0.705, "margin"),
            (0.25, 0.77, "top"),
            (0.18, 0.86, "top"),
            (0.10, 0.93, "top"),
            (0.04, 0.985, "top"),
            (0.0, 1.0, "top"),
        ],
        colours={
            "base": ("#b8662e", "#c4723a"),
            "stem": ("#c47236", "#b8652e"),
            "gills": ("#8a4520", "#9c5226"),
            "margin": ("#b9652e", "#b05a28"),
            "top": ("#b25a26", "#8e4019"),
        },
        lines={
            "count": 56,
            "width": 0.28,
            "depth": 0.005,
            "fork": False,
            "colour": "#5c2c12",
            "highlight": "#b46a34",
        },
        lobes=0.03,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.06,
        seed=29,
        tilt=0.06,
        cap_fibres=0.12,
        bands={"region": "stem", "count": 3, "colour": "#dcc456", "ragged": 0.1, "thin": 0.55},
    ),
    # Myrkkynääpikkä: a small honey- to rusty-brown cap, convex and smooth; rusty brown gills;
    # a thin fibrous stem, pale above and darker below, with a slight ring.
    "galerina-marginata": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.035, 0.004, "base"),
            (0.042, 0.03, "stem"),
            (0.038, 0.30, "stem"),
            (0.036, 0.52, "ring"),
            (0.038, 0.56, "ring"),
            (0.058, 0.545, "ring"),
            (0.064, 0.53, "ring"),
            (0.05, 0.545, "stem"),
            (0.036, 0.57, "stem"),
            (0.034, 0.70, "gills"),
            (0.12, 0.715, "gills"),
            (0.23, 0.73, "gills"),
            (0.285, 0.745, "margin"),
            (0.295, 0.77, "margin"),
            (0.28, 0.82, "top"),
            (0.21, 0.88, "top"),
            (0.11, 0.915, "top"),
            (0.0, 0.925, "top"),
        ],
        colours={
            "base": ("#4a2f1c", "#5a3a22"),
            "stem": ("#6b4528", "#c49a6a"),
            "ring": ("#c9a06a", "#8a5a30"),
            "gills": ("#9a6230", "#a86c36"),
            "margin": ("#d6a25a", "#c88a40"),
            "top": ("#c27a32", "#9a5a22"),
        },
        lines={
            "count": 48,
            "width": 0.3,
            "depth": 0.004,
            "fork": False,
            "colour": "#6a3c1a",
            "highlight": "#c88a4a",
        },
        lobes=0.02,
        lift=0.012,
        lobe_count=(4, 7, 11),
        bend=0.07,
        seed=31,
        tilt=0.05,
        stem_fibres="#e4d2b0",
        rings=140,
    ),
    # Risakkaat: a conical cap with an umbo, straw- to tan-brown, radially fibrous and split
    # at the margin; greyish-brown gills; a slender pale stem.
    "inocybe": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.045, 0.004, "base"),
            (0.055, 0.03, "stem"),
            (0.048, 0.30, "stem"),
            (0.046, 0.56, "stem"),
            (0.045, 0.62, "gills"),
            (0.13, 0.635, "gills"),
            (0.23, 0.645, "gills"),
            (0.29, 0.65, "margin"),
            (0.30, 0.665, "margin"),
            (0.27, 0.72, "top"),
            (0.19, 0.80, "top"),
            (0.10, 0.86, "top"),
            (0.04, 0.905, "top"),
            (0.0, 0.915, "top"),
        ],
        colours={
            "base": ("#d9c9a6", "#e4d6b4"),
            "stem": ("#e6d9bc", "#efe5cc"),
            "gills": ("#9c8a6e", "#a8957a"),
            "margin": ("#d2b582", "#c4a36c"),
            "top": ("#c09a62", "#8a6a3e"),
        },
        lines={
            "count": 64,
            "width": 0.3,
            "depth": 0.004,
            "fork": False,
            "colour": "#6e5c44",
            "highlight": "#c4b394",
        },
        lobes=0.07,
        lift=0.02,
        lobe_count=(7, 11, 17),
        bend=0.05,
        seed=37,
        tilt=0.06,
        cap_fibres=0.28,
    ),
    # Pulkkosieni: a broad olive- to yellow-brown cap, flat with a sunken centre and an
    # inrolled, felty margin; crowded yellowish-brown gills running down the stem, staining
    # brown; a short stem.
    "paxillus-involutus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.075, 0.004, "base"),
            (0.09, 0.03, "stem"),
            (0.08, 0.18, "stem"),
            (0.085, 0.30, "stem"),
            (0.10, 0.37, "gills"),
            (0.20, 0.44, "gills"),
            (0.33, 0.49, "gills"),
            (0.40, 0.505, "margin"),
            (0.425, 0.53, "margin"),
            (0.43, 0.56, "margin"),
            (0.415, 0.585, "top"),
            (0.33, 0.585, "top"),
            (0.18, 0.555, "top"),
            (0.06, 0.53, "top"),
            (0.0, 0.525, "top"),
        ],
        colours={
            "base": ("#8a6a42", "#9a7a4e"),
            "stem": ("#a8875a", "#b8975e"),
            "gills": ("#c2a060", "#c9a868"),
            "margin": ("#a88a5a", "#9a7a4a"),
            "top": ("#9c7c4a", "#7a5a32"),
        },
        lines={
            "count": 90,
            "width": 0.26,
            "depth": 0.005,
            "fork": True,
            "colour": "#7a5428",
            "highlight": "#e0c27e",
            "wiggle": 0.05,
        },
        lobes=0.05,
        lift=0.03,
        lobe_count=(3, 5, 9),
        bend=0.04,
        seed=41,
        tilt=0.08,
        decurrent=0.3,
    ),
    # Korvasieni: a brain-like cap, chestnut- to reddish-brown, folded into irregular lobes;
    # a short, thick, whitish stem; a paler underside where the cap folds meet the stem.
    "gyromitra-esculenta": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.11, 0.005, "base"),
            (0.135, 0.035, "stem"),
            (0.12, 0.15, "stem"),
            (0.11, 0.28, "stem"),
            (0.13, 0.34, "under"),
            (0.25, 0.32, "under"),
            (0.34, 0.35, "under"),
            (0.39, 0.42, "top"),
            (0.41, 0.55, "top"),
            (0.38, 0.68, "top"),
            (0.29, 0.79, "top"),
            (0.16, 0.85, "top"),
            (0.0, 0.87, "top"),
        ],
        colours={
            "base": ("#d9c7b4", "#e6d6c4"),
            "stem": ("#ece0d2", "#e2cfbd"),
            "under": ("#b88f74", "#8a5236"),
            "top": ("#7a3a22", "#5e2a18"),
        },
        lines={"count": 1, "width": 0.1, "depth": 0.0, "fork": False},
        lobes=0.14,
        lift=0.07,
        lobe_count=(2, 3, 5),
        bend=0.02,
        seed=43,
        tilt=0.0,
        wrinkles={"depth": 0.045, "cells": 15},
        rings=150,
    ),
    # Tulipunahapero: a bright scarlet cap, convex to flat with a shallow dip, shiny; crowded
    # pure white gills; a pure white, firm stem.
    "russula-emetica": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.085, 0.004, "base"),
            (0.1, 0.03, "stem"),
            (0.095, 0.25, "stem"),
            (0.092, 0.50, "stem"),
            (0.095, 0.56, "gills"),
            (0.20, 0.585, "gills"),
            (0.33, 0.61, "gills"),
            (0.395, 0.625, "margin"),
            (0.41, 0.65, "margin"),
            (0.40, 0.685, "top"),
            (0.32, 0.72, "top"),
            (0.18, 0.725, "top"),
            (0.07, 0.715, "top"),
            (0.0, 0.715, "top"),
        ],
        colours={
            "base": ("#ebe9e3", "#f3f2ee"),
            "stem": ("#f6f5f1", "#fbfbf8"),
            "gills": ("#f7f6f0", "#fbfaf5"),
            "margin": ("#e85048", "#e0352c"),
            "top": ("#e02a24", "#c81c1a"),
        },
        lines=AMANITA_LINES,
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=47,
        tilt=0.05,
    ),
    # Kitkerälahokka: a sulphur-yellow cap with an orange-brown centre; sulphur- to
    # greenish-yellow gills; a slender yellow stem, browner below.
    "hypholoma-fasciculare": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.04, 0.004, "base"),
            (0.048, 0.03, "stem"),
            (0.042, 0.30, "stem"),
            (0.04, 0.60, "stem"),
            (0.04, 0.66, "gills"),
            (0.12, 0.675, "gills"),
            (0.22, 0.69, "gills"),
            (0.265, 0.70, "margin"),
            (0.275, 0.725, "margin"),
            (0.26, 0.77, "top"),
            (0.19, 0.83, "top"),
            (0.10, 0.86, "top"),
            (0.0, 0.87, "top"),
        ],
        colours={
            "base": ("#8a6a2a", "#a88a3a"),
            "stem": ("#c2a442", "#e8d66a"),
            "gills": ("#c9cc5a", "#d8d468"),
            "margin": ("#f0e07a", "#ead76a"),
            "top": ("#e8cf58", "#d07a2c"),
        },
        lines={
            "count": 60,
            "width": 0.3,
            "depth": 0.004,
            "fork": False,
            "colour": "#8a8a2e",
            "highlight": "#efe98a",
        },
        lobes=0.025,
        lift=0.015,
        lobe_count=(4, 7, 11),
        bend=0.08,
        seed=53,
        tilt=0.06,
        stem_fibres="#a87a32",
    ),
    # Lakritsirousku: a pale yellowish- to cinnamon-brown, finely felty cap, flat with a small
    # dip and sometimes a small umbo; pale ochre gills running slightly down; a stem the
    # colour of the cap.
    "lactarius-helvus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.06, 0.004, "base"),
            (0.072, 0.03, "stem"),
            (0.066, 0.30, "stem"),
            (0.066, 0.50, "stem"),
            (0.075, 0.56, "gills"),
            (0.18, 0.60, "gills"),
            (0.31, 0.635, "gills"),
            (0.375, 0.65, "margin"),
            (0.39, 0.675, "margin"),
            (0.375, 0.705, "top"),
            (0.28, 0.72, "top"),
            (0.14, 0.705, "top"),
            (0.04, 0.70, "top"),
            (0.0, 0.705, "top"),
        ],
        colours={
            "base": ("#b49068", "#c09c72"),
            "stem": ("#c7a47a", "#d2b088"),
            "gills": ("#e2c9a0", "#e8d0a8"),
            "margin": ("#d4b186", "#c49e72"),
            "top": ("#c09a6c", "#a47c50"),
        },
        lines={
            "count": 80,
            "width": 0.28,
            "depth": 0.004,
            "fork": False,
            "colour": "#a8885e",
            "highlight": "#f2dfba",
        },
        lobes=0.04,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.04,
        seed=59,
        tilt=0.05,
        decurrent=0.1,
        cap_fibres=0.08,
    ),
    # Kangaskeltavalmuska: a sulphur-yellow cap with fine brownish scales at the centre;
    # crowded, bright lemon-yellow gills; a pale yellow stem; no ring.
    "tricholoma-equestre": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.075, 0.004, "base"),
            (0.09, 0.03, "stem"),
            (0.085, 0.22, "stem"),
            (0.085, 0.40, "stem"),
            (0.09, 0.47, "gills"),
            (0.20, 0.50, "gills"),
            (0.34, 0.53, "gills"),
            (0.40, 0.545, "margin"),
            (0.415, 0.575, "margin"),
            (0.395, 0.62, "top"),
            (0.31, 0.665, "top"),
            (0.17, 0.685, "top"),
            (0.0, 0.69, "top"),
        ],
        colours={
            "base": ("#d8c87a", "#e2d48a"),
            "stem": ("#ece08e", "#f0e69a"),
            "gills": ("#f2e04a", "#f4e352"),
            "margin": ("#efd860", "#e2c650"),
            "top": ("#dcc24c", "#a88a3e"),
        },
        lines={
            "count": 100,
            "width": 0.3,
            "depth": 0.004,
            "fork": False,
            "colour": "#c4b030",
            "highlight": "#fff48a",
        },
        lobes=0.035,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=61,
        tilt=0.05,
        spots={"colour": "#8f6e38", "count": 35, "size": 0.01, "relief": 0.0},
    ),
    # Poimukellomörsky: a thimble-like, wrinkled yellowish-brown cap hanging free around the
    # stem, attached only at its top; a long pale cream stem.
    "verpa-bohemica": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.06, 0.005, "base"),
            (0.072, 0.03, "stem"),
            (0.062, 0.45, "stem"),
            (0.052, 0.88, "stem"),
            (0.06, 0.93, "under"),
            (0.13, 0.86, "under"),
            (0.165, 0.72, "under"),
            (0.175, 0.62, "margin"),
            (0.19, 0.61, "margin"),
            (0.195, 0.64, "top"),
            (0.19, 0.76, "top"),
            (0.16, 0.89, "top"),
            (0.10, 0.965, "top"),
            (0.0, 0.99, "top"),
        ],
        colours={
            "base": ("#d9c9a8", "#e6d8ba"),
            "stem": ("#efe4cc", "#f4ebd6"),
            "under": ("#d9c6a0", "#cbb48a"),
            "margin": ("#a87e4a", "#9c7240"),
            "top": ("#a47844", "#7a5430"),
        },
        lines={"count": 1, "width": 0.1, "depth": 0.0, "fork": False},
        lobes=0.0,
        lift=0.0,
        bend=0.04,
        seed=67,
        tilt=0.0,
        wrinkles={"depth": 0.03, "cells": 14, "stretch": 4, "under": 0.0},
        bands={"region": "stem", "count": 9, "colour": "#e2d2b0", "ragged": 0.3, "thin": 0.6},
        rings=150,
    ),
    # Huhtasienet: a conical, honeycombed cap of pits and paler ridges, grey-brown to dark
    # brown, joined to the stem at its base; a whitish, hollow stem.
    "morchella": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.08, 0.005, "base"),
            (0.095, 0.03, "stem"),
            (0.085, 0.20, "stem"),
            (0.08, 0.38, "stem"),
            (0.09, 0.42, "under"),
            (0.17, 0.43, "under"),
            (0.18, 0.47, "top"),
            (0.19, 0.60, "top"),
            (0.17, 0.75, "top"),
            (0.12, 0.88, "top"),
            (0.06, 0.97, "top"),
            (0.0, 1.0, "top"),
        ],
        colours={
            "base": ("#d8ccb4", "#e4d9c2"),
            "stem": ("#efe6d4", "#f2eadb"),
            "under": ("#c9b48e", "#8a6a44"),
            "top": ("#7a5a38", "#4e3622"),
        },
        lines={"count": 1, "width": 0.1, "depth": 0.0, "fork": False},
        lobes=0.0,
        lift=0.0,
        bend=0.03,
        seed=71,
        tilt=0.0,
        wrinkles={"depth": 0.03, "cells": 150, "kind": "pits", "stretch": 1.6, "under": 0.0},
        rings=150,
    ),
    # Haaparouskut: a large, slimy cap, grey-violet to lilac-brown, flat with a shallow dip;
    # crowded cream gills; a long, pale stem.
    "lactarius-trivialis-agg": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.09, 0.004, "base"),
            (0.105, 0.03, "stem"),
            (0.098, 0.30, "stem"),
            (0.096, 0.55, "stem"),
            (0.105, 0.60, "gills"),
            (0.22, 0.635, "gills"),
            (0.36, 0.665, "gills"),
            (0.425, 0.68, "margin"),
            (0.44, 0.705, "margin"),
            (0.425, 0.74, "top"),
            (0.33, 0.765, "top"),
            (0.18, 0.755, "top"),
            (0.06, 0.74, "top"),
            (0.0, 0.74, "top"),
        ],
        colours={
            "base": ("#d6cbb8", "#e2d8c6"),
            "stem": ("#ddd2c0", "#e9e0d0"),
            "gills": ("#ecdfc2", "#f0e4ca"),
            "margin": ("#a59aa6", "#8a7c8e"),
            "top": ("#857588", "#5e4e62"),
        },
        lines={
            "count": 96,
            "width": 0.28,
            "depth": 0.004,
            "fork": False,
            "colour": "#c4b08a",
            "highlight": "#fff4dc",
        },
        lobes=0.04,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=73,
        tilt=0.05,
        decurrent=0.08,
    ),
    # Kangasrousku: a red-brown cap with a small pointed umbo in a shallow dip; cream to
    # pinkish-buff gills; a stem a little paler than the cap.
    "lactarius-rufus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.06, 0.004, "base"),
            (0.072, 0.03, "stem"),
            (0.064, 0.30, "stem"),
            (0.063, 0.54, "stem"),
            (0.07, 0.59, "gills"),
            (0.18, 0.62, "gills"),
            (0.30, 0.65, "gills"),
            (0.36, 0.665, "margin"),
            (0.375, 0.69, "margin"),
            (0.36, 0.72, "top"),
            (0.27, 0.735, "top"),
            (0.12, 0.72, "top"),
            (0.05, 0.725, "top"),
            (0.02, 0.75, "top"),
            (0.0, 0.755, "top"),
        ],
        colours={
            "base": ("#a8644a", "#b46e52"),
            "stem": ("#b9765a", "#c4866a"),
            "gills": ("#e2c09e", "#e6c6a6"),
            "margin": ("#b05a3a", "#9a4a2e"),
            "top": ("#9a4a2c", "#7e3a22"),
        },
        lines={
            "count": 84,
            "width": 0.28,
            "depth": 0.004,
            "fork": False,
            "colour": "#b48a68",
            "highlight": "#f4dcc2",
        },
        lobes=0.035,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.04,
        seed=79,
        tilt=0.05,
        decurrent=0.08,
    ),
    # Karvarousku: a pink cap with darker concentric zones and a woolly, inrolled margin;
    # pale pinkish-cream gills; a pale pink stem.
    "lactarius-torminosus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.07, 0.004, "base"),
            (0.085, 0.03, "stem"),
            (0.078, 0.25, "stem"),
            (0.078, 0.44, "stem"),
            (0.09, 0.50, "gills"),
            (0.20, 0.53, "gills"),
            (0.32, 0.56, "gills"),
            (0.375, 0.57, "margin"),
            (0.405, 0.59, "margin"),
            (0.41, 0.625, "margin"),
            (0.39, 0.65, "top"),
            (0.29, 0.66, "top"),
            (0.14, 0.64, "top"),
            (0.0, 0.635, "top"),
        ],
        colours={
            "base": ("#e6cfc4", "#efdcd2"),
            "stem": ("#efd8cc", "#f4e2d8"),
            "gills": ("#f3e0d4", "#f6e6dc"),
            "margin": ("#f2ddd2", "#ecc8b8"),
            "top": ("#eab2a0", "#dc947e"),
        },
        lines={
            "count": 90,
            "width": 0.28,
            "depth": 0.004,
            "fork": False,
            "colour": "#d4b0a0",
            "highlight": "#fff4ee",
        },
        lobes=0.035,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=83,
        tilt=0.05,
        cap_fibres=0.06,
        bands={"region": "top", "count": 4, "colour": "#cf7a64", "ragged": 0.04, "thin": 0.2},
    ),
    # Villakarvarousku: like karvarousku but almost white, with a woolly margin and faint or
    # no zones; a pale stem.
    "lactarius-pubescens": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.065, 0.004, "base"),
            (0.08, 0.03, "stem"),
            (0.072, 0.22, "stem"),
            (0.072, 0.38, "stem"),
            (0.085, 0.44, "gills"),
            (0.19, 0.47, "gills"),
            (0.30, 0.50, "gills"),
            (0.35, 0.51, "margin"),
            (0.38, 0.53, "margin"),
            (0.385, 0.565, "margin"),
            (0.365, 0.59, "top"),
            (0.27, 0.60, "top"),
            (0.13, 0.58, "top"),
            (0.0, 0.575, "top"),
        ],
        colours={
            "base": ("#e8ddd2", "#efe6dc"),
            "stem": ("#f2ebe2", "#f6f0e8"),
            "gills": ("#f4e6da", "#f7ece2"),
            "margin": ("#f7f2ec", "#f2e8de"),
            "top": ("#efe2d4", "#e2c8b2"),
        },
        lines={
            "count": 90,
            "width": 0.28,
            "depth": 0.004,
            "fork": False,
            "colour": "#d8c2b0",
            "highlight": "#fffaf4",
        },
        lobes=0.035,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=89,
        tilt=0.05,
        cap_fibres=0.12,
    ),
    # Leppärouskut: an orange, zoned cap with a shallow dip, often with green stains;
    # orange gills; a short orange stem.
    "lactarius-deliciosus-agg": Spec(
        profile=[
            (0.0, 0.000, "base"),
            (0.075, 0.004, "base"),
            (0.09, 0.034, "stem"),
            (0.084, 0.246, "stem"),
            (0.084, 0.403, "stem"),
            (0.095, 0.470, "gills"),
            (0.21, 0.515, "gills"),
            (0.34, 0.554, "gills"),
            (0.40, 0.571, "margin"),
            (0.42, 0.599, "margin"),
            (0.41, 0.633, "top"),
            (0.31, 0.650, "top"),
            (0.15, 0.627, "top"),
            (0.0, 0.622, "top"),
        ],
        colours={
            "base": ("#d8854a", "#e2925a"),
            "stem": ("#e8995c", "#ec9f62"),
            "gills": ("#f09a4a", "#f2a052"),
            "margin": ("#e88e4c", "#e08446"),
            "top": ("#e48a48", "#d07440"),
        },
        lines={
            "count": 86,
            "width": 0.28,
            "depth": 0.004,
            "fork": True,
            "colour": "#c06a2a",
            "highlight": "#ffc07a",
        },
        lobes=0.04,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=97,
        tilt=0.05,
        decurrent=0.08,
        bands={"region": "top", "count": 4, "colour": "#c8642e", "ragged": 0.15, "thin": 0.55},
        spots={"colour": "#8f9a70", "count": 5, "size": 0.045, "relief": 0.0},
    ),
    # Mesisienet: a honey-brown cap with dark, hairy scales towards the centre; whitish gills
    # running slightly down; a tapering stem with a whitish ring, darker below.
    "armillaria": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.035, 0.004, "base"),
            (0.045, 0.03, "stem"),
            (0.052, 0.20, "stem"),
            (0.056, 0.52, "ring"),
            (0.06, 0.57, "ring"),
            (0.09, 0.555, "ring"),
            (0.11, 0.52, "ring"),
            (0.102, 0.515, "ring"),
            (0.075, 0.55, "stem"),
            (0.058, 0.58, "stem"),
            (0.058, 0.66, "gills"),
            (0.16, 0.69, "gills"),
            (0.27, 0.715, "gills"),
            (0.325, 0.725, "margin"),
            (0.34, 0.75, "margin"),
            (0.325, 0.795, "top"),
            (0.25, 0.85, "top"),
            (0.13, 0.88, "top"),
            (0.0, 0.89, "top"),
        ],
        colours={
            "base": ("#6a4a2e", "#7c5a3a"),
            "stem": ("#8a6a46", "#d8c4a0"),
            "ring": ("#f0e6d0", "#d8c8a8"),
            "gills": ("#efe4cc", "#f2e8d2"),
            "margin": ("#d8b47a", "#c89c5e"),
            "top": ("#c49656", "#8a6036"),
        },
        lines={
            "count": 70,
            "width": 0.3,
            "depth": 0.004,
            "fork": False,
            "colour": "#c8b08a",
            "highlight": "#fffaee",
        },
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 7, 11),
        bend=0.07,
        seed=101,
        tilt=0.06,
        decurrent=0.12,
        spots={"colour": "#5a3e26", "count": 90, "size": 0.009, "relief": 0.0},
        rings=150,
    ),
    # Isohapero: a large, red to orange-red cap, convex with a shallow dip; cream gills; a
    # stout white stem, often flushed pink.
    "russula-paludosa": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.095, 0.004, "base"),
            (0.112, 0.034, "stem"),
            (0.106, 0.280, "stem"),
            (0.103, 0.538, "stem"),
            (0.106, 0.605, "gills"),
            (0.224, 0.633, "gills"),
            (0.370, 0.661, "gills"),
            (0.442, 0.678, "margin"),
            (0.459, 0.706, "margin"),
            (0.448, 0.745, "top"),
            (0.358, 0.784, "top"),
            (0.202, 0.790, "top"),
            (0.078, 0.778, "top"),
            (0.000, 0.778, "top"),
        ],
        colours={
            "base": ("#f2dcd6", "#f2dcd6"),
            "stem": ("#f2dcd6", "#f6eeea"),
            "gills": ("#f2e6c8", "#f2e6c8"),
            "margin": ("#e0584a", "#d23a2e"),
            "top": ("#d23a2e", "#b02a22"),
        },
        lines=RUSSULA_LINES,
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=103,
        tilt=0.05,
    ),
    # Kangashaperot: an orange- to copper-brown cap; cream gills; a white stem that greys
    # with age.
    "russula-decolorans-agg": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.085, 0.004, "base"),
            (0.100, 0.030, "stem"),
            (0.095, 0.250, "stem"),
            (0.092, 0.480, "stem"),
            (0.095, 0.540, "gills"),
            (0.200, 0.565, "gills"),
            (0.330, 0.590, "gills"),
            (0.395, 0.605, "margin"),
            (0.410, 0.630, "margin"),
            (0.400, 0.665, "top"),
            (0.320, 0.700, "top"),
            (0.180, 0.705, "top"),
            (0.070, 0.695, "top"),
            (0.000, 0.695, "top"),
        ],
        colours={
            "base": ("#e6e2dc", "#e6e2dc"),
            "stem": ("#e6e2dc", "#f4f2ee"),
            "gills": ("#f1e5c8", "#f1e5c8"),
            "margin": ("#e09a5a", "#d4884a"),
            "top": ("#d4884a", "#b86a34"),
        },
        lines=RUSSULA_LINES,
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=107,
        tilt=0.05,
    ),
    # Keltahapero: a bright, clear yellow cap; pale cream gills; a white stem that greys.
    "russula-claroflava": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.085, 0.004, "base"),
            (0.100, 0.030, "stem"),
            (0.095, 0.250, "stem"),
            (0.092, 0.480, "stem"),
            (0.095, 0.540, "gills"),
            (0.200, 0.565, "gills"),
            (0.330, 0.590, "gills"),
            (0.395, 0.605, "margin"),
            (0.410, 0.630, "margin"),
            (0.400, 0.665, "top"),
            (0.320, 0.700, "top"),
            (0.180, 0.705, "top"),
            (0.070, 0.695, "top"),
            (0.000, 0.695, "top"),
        ],
        colours={
            "base": ("#e8e6e0", "#e8e6e0"),
            "stem": ("#e8e6e0", "#f6f5f1"),
            "gills": ("#f4ecd2", "#f4ecd2"),
            "margin": ("#f0dc5c", "#ecd23e"),
            "top": ("#ecd23e", "#e2c22e"),
        },
        lines=RUSSULA_LINES,
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=109,
        tilt=0.05,
    ),
    # Viinihapero: a wine-red to purplish-brown cap, darker at the centre; cream gills; a
    # white stem that greys.
    "russula-vinosa": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.085, 0.004, "base"),
            (0.100, 0.030, "stem"),
            (0.095, 0.250, "stem"),
            (0.092, 0.480, "stem"),
            (0.095, 0.540, "gills"),
            (0.200, 0.565, "gills"),
            (0.330, 0.590, "gills"),
            (0.395, 0.605, "margin"),
            (0.410, 0.630, "margin"),
            (0.400, 0.665, "top"),
            (0.320, 0.700, "top"),
            (0.180, 0.705, "top"),
            (0.070, 0.695, "top"),
            (0.000, 0.695, "top"),
        ],
        colours={
            "base": ("#e4e2de", "#e4e2de"),
            "stem": ("#e4e2de", "#f4f3ef"),
            "gills": ("#f1e4c4", "#f1e4c4"),
            "margin": ("#a84a5c", "#9a3a4c"),
            "top": ("#9a3a4c", "#6a2232"),
        },
        lines=RUSSULA_LINES,
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.03,
        seed=113,
        tilt=0.05,
    ),
    # Mustavahakas: a dark grey-brown, smooth cap; thick, widely spaced, waxy pale grey gills
    # running down the stem; a pale grey stem.
    "hygrophorus-camarophyllus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.07, 0.004, "base"),
            (0.085, 0.03, "stem"),
            (0.075, 0.25, "stem"),
            (0.072, 0.46, "stem"),
            (0.085, 0.52, "gills"),
            (0.19, 0.56, "gills"),
            (0.32, 0.595, "gills"),
            (0.385, 0.61, "margin"),
            (0.40, 0.635, "margin"),
            (0.39, 0.67, "top"),
            (0.31, 0.71, "top"),
            (0.17, 0.725, "top"),
            (0.0, 0.73, "top"),
        ],
        colours={
            "base": ("#a49c94", "#b2aaa2"),
            "stem": ("#b8b0a8", "#cfc8c0"),
            "gills": ("#dcd8d2", "#e4e0da"),
            "margin": ("#6e625a", "#5a4e46"),
            "top": ("#5a4e46", "#3e342e"),
        },
        lines={
            "count": 34,
            "width": 0.34,
            "depth": 0.01,
            "fork": False,
            "colour": "#a8a29c",
            "highlight": "#f2f0ec",
        },
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.04,
        seed=127,
        tilt=0.05,
        decurrent=0.25,
    ),
    # Kehnäsieni: an ochre- to yellow-brown, radially wrinkled cap with a frosty, whitish
    # bloom at the centre; clay-brown gills; a pale stem with a clear white ring.
    "cortinarius-caperatus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.075, 0.004, "base"),
            (0.09, 0.03, "stem"),
            (0.082, 0.30, "stem"),
            (0.076, 0.48, "ring"),
            (0.08, 0.53, "ring"),
            (0.11, 0.51, "ring"),
            (0.128, 0.47, "ring"),
            (0.12, 0.465, "ring"),
            (0.095, 0.50, "stem"),
            (0.076, 0.535, "stem"),
            (0.074, 0.64, "gills"),
            (0.18, 0.655, "gills"),
            (0.31, 0.67, "gills"),
            (0.37, 0.68, "margin"),
            (0.385, 0.71, "margin"),
            (0.37, 0.76, "top"),
            (0.29, 0.83, "top"),
            (0.16, 0.875, "top"),
            (0.0, 0.89, "top"),
        ],
        colours={
            "base": ("#d8ccb0", "#e2d6bc"),
            "stem": ("#e6dcc4", "#efe8d6"),
            "ring": ("#f6f2e8", "#e6dfd0"),
            "gills": ("#b48a5e", "#bc9466"),
            "margin": ("#c8a066", "#c09456"),
            "top": ("#c09252", "#d8c4a4"),
        },
        lines={
            "count": 70,
            "width": 0.3,
            "depth": 0.004,
            "fork": False,
            "colour": "#7e5a36",
            "highlight": "#d8b488",
        },
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 7, 11),
        bend=0.03,
        seed=131,
        tilt=0.05,
        cap_fibres=0.14,
        rings=150,
    ),
    # Tuoksuvalmuska: large and stocky; a chestnut-brown cap with flattened, fibrous scales
    # on a paler ground; white gills; a thick stem with a ring, white above and brown-scaled
    # below.
    "tricholoma-matsutake": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.10, 0.004, "base"),
            (0.125, 0.03, "stem"),
            (0.12, 0.20, "stem"),
            (0.112, 0.40, "ring"),
            (0.116, 0.45, "ring"),
            (0.145, 0.43, "ring"),
            (0.16, 0.395, "ring"),
            (0.152, 0.39, "ring"),
            (0.13, 0.42, "stem"),
            (0.112, 0.455, "stem"),
            (0.11, 0.53, "gills"),
            (0.22, 0.56, "gills"),
            (0.36, 0.59, "gills"),
            (0.42, 0.605, "margin"),
            (0.44, 0.635, "margin"),
            (0.43, 0.68, "top"),
            (0.35, 0.74, "top"),
            (0.20, 0.775, "top"),
            (0.0, 0.785, "top"),
        ],
        colours={
            "base": ("#8a6a4a", "#9a7a58"),
            "stem": ("#a07c58", "#f4efe6"),
            "ring": ("#efe6d6", "#c8b08e"),
            "gills": ("#f6f2ea", "#faf7f0"),
            "margin": ("#efe4d2", "#c8a888"),
            "top": ("#c6a482", "#9a7650"),
        },
        lines=AMANITA_LINES,
        lobes=0.03,
        lift=0.02,
        lobe_count=(4, 6, 9),
        bend=0.02,
        seed=137,
        tilt=0.04,
        spots={"colour": "#7a5634", "count": 120, "size": 0.02, "relief": 0.3},
        rings=150,
    ),
    # Koivunkantosieni: a two-tone cap, pale ochre at the centre and darker, wet-looking
    # cinnamon-brown towards the margin; pale cinnamon gills; a slim stem with a small ring,
    # scaly and darker below it.
    "kuehneromyces-mutabilis": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.035, 0.004, "base"),
            (0.045, 0.03, "stem"),
            (0.045, 0.30, "stem"),
            (0.044, 0.52, "ring"),
            (0.046, 0.56, "ring"),
            (0.066, 0.545, "ring"),
            (0.075, 0.525, "ring"),
            (0.068, 0.52, "ring"),
            (0.055, 0.54, "stem"),
            (0.044, 0.565, "stem"),
            (0.042, 0.65, "gills"),
            (0.14, 0.67, "gills"),
            (0.25, 0.69, "gills"),
            (0.30, 0.70, "margin"),
            (0.31, 0.725, "margin"),
            (0.295, 0.77, "top"),
            (0.22, 0.82, "top"),
            (0.10, 0.85, "top"),
            (0.03, 0.865, "top"),
            (0.0, 0.875, "top"),
        ],
        colours={
            "base": ("#5a3e26", "#6a4a2e"),
            "stem": ("#7a5634", "#d2b48a"),
            "ring": ("#b8946a", "#8a6440"),
            "gills": ("#c69a6a", "#cca272"),
            "margin": ("#9a5e2c", "#a46630"),
            "top": ("#a8692e", "#e6c48a"),
        },
        lines={
            "count": 56,
            "width": 0.3,
            "depth": 0.004,
            "fork": False,
            "colour": "#8a6038",
            "highlight": "#e8c494",
        },
        lobes=0.025,
        lift=0.015,
        lobe_count=(4, 7, 11),
        bend=0.07,
        seed=139,
        tilt=0.05,
        stem_fibres="#4e3420",
        rings=150,
    ),
    # Herkkusienet: a white cap, smooth or finely silky; free gills, pink when young, later
    # chocolate brown; a white stem with a simple ring and no volva.
    "agaricus-campestris-agg": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.08, 0.004, "base"),
            (0.095, 0.03, "stem"),
            (0.09, 0.20, "stem"),
            (0.086, 0.36, "ring"),
            (0.09, 0.40, "ring"),
            (0.115, 0.385, "ring"),
            (0.125, 0.365, "ring"),
            (0.118, 0.36, "ring"),
            (0.10, 0.38, "stem"),
            (0.086, 0.405, "stem"),
            (0.084, 0.47, "gills"),
            (0.19, 0.485, "gills"),
            (0.32, 0.50, "gills"),
            (0.385, 0.51, "margin"),
            (0.40, 0.545, "margin"),
            (0.385, 0.60, "top"),
            (0.30, 0.66, "top"),
            (0.16, 0.695, "top"),
            (0.0, 0.705, "top"),
        ],
        colours={
            "base": ("#e6e2da", "#efece6"),
            "stem": ("#f2efea", "#f8f6f2"),
            "ring": ("#f8f6f2", "#e6e2da"),
            "gills": ("#7a4a3e", "#b46e66"),
            "margin": ("#f2efe8", "#f6f4ee"),
            "top": ("#f6f3ec", "#e8e0d2"),
        },
        lines={
            "count": 110,
            "width": 0.3,
            "depth": 0.003,
            "fork": False,
            "colour": "#4e2c24",
            "highlight": "#c8867c",
        },
        lobes=0.02,
        lift=0.012,
        lobe_count=(4, 7, 11),
        bend=0.03,
        seed=149,
        tilt=0.04,
        rings=150,
    ),
    # Herkkutatit: a brown, bun-shaped cap; white pores turning yellowish-green; a thick,
    # pale, club-shaped stem with a fine white net at the top.
    "boletus-edulis-agg": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.102, 0.006, "base"),
            (0.170, 0.060, "stem"),
            (0.162, 0.160, "stem"),
            (0.137, 0.320, "stem"),
            (0.127, 0.470, "stem"),
            (0.133, 0.520, "gills"),
            (0.275, 0.530, "gills"),
            (0.380, 0.545, "gills"),
            (0.420, 0.565, "margin"),
            (0.432, 0.600, "margin"),
            (0.420, 0.660, "top"),
            (0.344, 0.730, "top"),
            (0.210, 0.775, "top"),
            (0.000, 0.790, "top"),
        ],
        colours={
            "base": ("#c8b28a", "#d8c6a2"),
            "stem": ("#d8c6a2", "#efe6d0"),
            "gills": ("#ece6c4", "#dcd8a0"),
            "margin": ("#c4a072", "#9a6a3e"),
            "top": ("#9a6a3e", "#7a4e2a"),
        },
        lines={
            "kind": "pores",
            "count": 150,
            "rows": 26,
            "width": 0.55,
            "depth": -0.004,
            "fork": False,
            "colour": "#b4ae7a",
            "highlight": "#dcd8a0",
        },
        lobes=0.025,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.03,
        seed=151,
        tilt=0.05,
        stem_net={"colour": "#fbf7ee", "cells": 500, "reach": 0.45, "stretch": 2.5},
    ),
    # Sappitatti: a tan to olive-brown cap; pores white at first, then pink; a stem with a
    # coarse dark brown net.
    "tylopilus-felleus": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.102, 0.006, "base"),
            (0.170, 0.060, "stem"),
            (0.162, 0.160, "stem"),
            (0.137, 0.320, "stem"),
            (0.127, 0.470, "stem"),
            (0.133, 0.520, "gills"),
            (0.275, 0.530, "gills"),
            (0.380, 0.545, "gills"),
            (0.420, 0.565, "margin"),
            (0.432, 0.600, "margin"),
            (0.420, 0.660, "top"),
            (0.344, 0.730, "top"),
            (0.210, 0.775, "top"),
            (0.000, 0.790, "top"),
        ],
        colours={
            "base": ("#a88a5a", "#c8ac7c"),
            "stem": ("#c8ac7c", "#d8c08e"),
            "gills": ("#e8d6cc", "#e2c4bc"),
            "margin": ("#c4a47a", "#a8875e"),
            "top": ("#a8875e", "#8a6a44"),
        },
        lines={
            "kind": "pores",
            "count": 150,
            "rows": 26,
            "width": 0.55,
            "depth": -0.004,
            "fork": False,
            "colour": "#c09a92",
            "highlight": "#e2c4bc",
        },
        lobes=0.025,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.03,
        seed=157,
        tilt=0.05,
        stem_net={"colour": "#5e4228", "cells": 380, "reach": 0.7, "stretch": 2.5, "strength": 0.8},
    ),
    # Punikkitatit: an orange to red-brown cap with an overhanging margin; greyish pores; a
    # tall whitish stem covered in dark, blackish scales.
    "leccinum-versipelle-agg": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.069, 0.007, "base"),
            (0.115, 0.071, "stem"),
            (0.109, 0.189, "stem"),
            (0.089, 0.378, "stem"),
            (0.083, 0.555, "stem"),
            (0.087, 0.614, "gills"),
            (0.223, 0.625, "gills"),
            (0.320, 0.643, "gills"),
            (0.360, 0.667, "margin"),
            (0.372, 0.708, "margin"),
            (0.360, 0.779, "top"),
            (0.295, 0.861, "top"),
            (0.180, 0.914, "top"),
            (0.000, 0.932, "top"),
        ],
        colours={
            "base": ("#d0c8bc", "#e6e0d6"),
            "stem": ("#e6e0d6", "#f0ece4"),
            "gills": ("#d6d0c4", "#c8c2b6"),
            "margin": ("#e89a5a", "#e07a34"),
            "top": ("#e07a34", "#c45e22"),
        },
        lines={
            "kind": "pores",
            "count": 150,
            "rows": 26,
            "width": 0.55,
            "depth": -0.004,
            "fork": False,
            "colour": "#9a948a",
            "highlight": "#c8c2b6",
        },
        lobes=0.025,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.03,
        seed=163,
        tilt=0.05,
        spots={"region": "stem", "colour": "#2a2420", "count": 260, "size": 0.007, "relief": 0.0},
    ),
    # Lehmäntatti: a grey- to hazel-brown cap; whitish to buff pores; a tall whitish stem
    # with grey-black scales.
    "leccinum-scabrum": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.060, 0.007, "base"),
            (0.100, 0.071, "stem"),
            (0.095, 0.189, "stem"),
            (0.079, 0.378, "stem"),
            (0.073, 0.555, "stem"),
            (0.076, 0.614, "gills"),
            (0.208, 0.625, "gills"),
            (0.300, 0.643, "gills"),
            (0.340, 0.667, "margin"),
            (0.352, 0.708, "margin"),
            (0.340, 0.779, "top"),
            (0.279, 0.861, "top"),
            (0.170, 0.914, "top"),
            (0.000, 0.932, "top"),
        ],
        colours={
            "base": ("#d0c8bc", "#e6e0d6"),
            "stem": ("#e6e0d6", "#efebe4"),
            "gills": ("#e2dace", "#d8cebe"),
            "margin": ("#b89a7a", "#a08466"),
            "top": ("#a08466", "#7e6448"),
        },
        lines={
            "kind": "pores",
            "count": 150,
            "rows": 26,
            "width": 0.55,
            "depth": -0.004,
            "fork": False,
            "colour": "#a8a090",
            "highlight": "#d8cebe",
        },
        lobes=0.025,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.03,
        seed=167,
        tilt=0.05,
        spots={"region": "stem", "colour": "#3a342e", "count": 240, "size": 0.007, "relief": 0.0},
    ),
    # Kangastatti: a yellowish-brown, finely felty, speckled cap; small olive-brown pores; a
    # yellowish stem with no ring.
    "suillus-variegatus": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.072, 0.006, "base"),
            (0.120, 0.060, "stem"),
            (0.114, 0.160, "stem"),
            (0.100, 0.320, "stem"),
            (0.093, 0.470, "stem"),
            (0.097, 0.520, "gills"),
            (0.247, 0.530, "gills"),
            (0.360, 0.545, "gills"),
            (0.400, 0.565, "margin"),
            (0.412, 0.600, "margin"),
            (0.400, 0.660, "top"),
            (0.328, 0.730, "top"),
            (0.200, 0.775, "top"),
            (0.000, 0.790, "top"),
        ],
        colours={
            "base": ("#c49e5a", "#d6b46e"),
            "stem": ("#d6b46e", "#e0c27e"),
            "gills": ("#8a7a3e", "#7a6c34"),
            "margin": ("#c8a060", "#b88c4a"),
            "top": ("#b88c4a", "#9e7438"),
        },
        lines={
            "kind": "pores",
            "count": 190,
            "rows": 32,
            "width": 0.55,
            "depth": -0.004,
            "fork": False,
            "colour": "#5a4e22",
            "highlight": "#7a6c34",
        },
        lobes=0.025,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.03,
        seed=173,
        tilt=0.05,
        spots={"colour": "#8a6630", "count": 160, "size": 0.006, "relief": 0.0},
    ),
    # Voitatti: a chestnut-brown, slimy, glossy cap; yellow pores; a pale yellow stem with a
    # ring, purplish-brown below it, and glandular dots above.
    "suillus-luteus": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.057, 0.006, "base"),
            (0.095, 0.060, "stem"),
            (0.090, 0.160, "stem"),
            (0.079, 0.320, "stem"),
            (0.075, 0.400, "ring"),
            (0.077, 0.440, "ring"),
            (0.105, 0.425, "ring"),
            (0.120, 0.400, "ring"),
            (0.113, 0.395, "ring"),
            (0.090, 0.420, "stem"),
            (0.075, 0.445, "stem"),
            (0.073, 0.470, "stem"),
            (0.076, 0.520, "gills"),
            (0.228, 0.530, "gills"),
            (0.340, 0.545, "gills"),
            (0.380, 0.565, "margin"),
            (0.392, 0.600, "margin"),
            (0.380, 0.660, "top"),
            (0.312, 0.730, "top"),
            (0.190, 0.775, "top"),
            (0.000, 0.790, "top"),
        ],
        colours={
            "base": ("#b49a6a", "#e8dca0"),
            "stem": ("#e8dca0", "#efe4b0"),
            "ring": ("#efe4b0", "#e8dca0"),
            "gills": ("#e8d46a", "#dcc65a"),
            "margin": ("#9a6a42", "#7a4a2a"),
            "top": ("#7a4a2a", "#5e361c"),
        },
        lines={
            "kind": "pores",
            "count": 150,
            "rows": 26,
            "width": 0.55,
            "depth": -0.004,
            "fork": False,
            "colour": "#b49a3a",
            "highlight": "#dcc65a",
        },
        lobes=0.025,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.03,
        seed=179,
        tilt=0.05,
        rings=150,
    ),
    # Nummitatti: a yellowish- to orange-brown cap; large, angular, olive-ochre pores in two
    # layers; a short stem the colour of the cap; no ring.
    "suillus-bovinus": Spec(
        profile=[
            (0.000, 0.000, "base"),
            (0.048, 0.006, "base"),
            (0.080, 0.060, "stem"),
            (0.076, 0.160, "stem"),
            (0.068, 0.320, "stem"),
            (0.064, 0.470, "stem"),
            (0.066, 0.520, "gills"),
            (0.233, 0.530, "gills"),
            (0.360, 0.545, "gills"),
            (0.400, 0.565, "margin"),
            (0.412, 0.600, "margin"),
            (0.400, 0.660, "top"),
            (0.328, 0.730, "top"),
            (0.200, 0.775, "top"),
            (0.000, 0.790, "top"),
        ],
        colours={
            "base": ("#b08e58", "#c8a26a"),
            "stem": ("#c8a26a", "#d2ae76"),
            "gills": ("#a8904e", "#9a8444"),
            "margin": ("#d4aa70", "#c89a5e"),
            "top": ("#c89a5e", "#b0844a"),
        },
        lines={
            "kind": "pores",
            "count": 70,
            "rows": 12,
            "width": 0.7,
            "depth": -0.004,
            "fork": False,
            "colour": "#5e4e24",
            "highlight": "#9a8444",
        },
        lobes=0.025,
        lift=0.02,
        lobe_count=(3, 5, 8),
        bend=0.03,
        seed=181,
        tilt=0.05,
    ),
    # Lampaankääpä: a whitish to cream, often cracked, lobed cap; short white pores running
    # down the short white stem.
    "albatrellus-ovinus": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.08, 0.005, "base"),
            (0.1, 0.039, "stem"),
            (0.095, 0.208, "stem"),
            (0.095, 0.338, "stem"),
            (0.11, 0.403, "gills"),
            (0.22, 0.481, "gills"),
            (0.34, 0.533, "gills"),
            (0.40, 0.552, "margin"),
            (0.415, 0.592, "margin"),
            (0.40, 0.637, "top"),
            (0.30, 0.663, "top"),
            (0.15, 0.65, "top"),
            (0.0, 0.65, "top"),
        ],
        colours={
            "base": ("#e2dccc", "#ebe6da"),
            "stem": ("#efebe2", "#f5f2ec"),
            "gills": ("#f4f1e8", "#f6f3ea"),
            "margin": ("#f2ecdc", "#ece2c8"),
            "top": ("#e8dcc0", "#d8c8a4"),
        },
        lines={
            "kind": "pores",
            "count": 200,
            "rows": 30,
            "width": 0.5,
            "depth": -0.002,
            "fork": False,
            "colour": "#c8c0ac",
            "highlight": "#ffffff",
        },
        lobes=0.09,
        lift=0.04,
        lobe_count=(2, 3, 5),
        bend=0.04,
        seed=191,
        tilt=0.06,
        decurrent=0.25,
    ),
    # Orakkaat: a pale buff to orange-tan, irregular cap; crowded pale spines underneath in
    # place of gills; a short whitish stem.
    "hydnum-repandum-agg": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.075, 0.005, "base"),
            (0.09, 0.036, "stem"),
            (0.085, 0.216, "stem"),
            (0.085, 0.36, "stem"),
            (0.10, 0.432, "gills"),
            (0.22, 0.492, "gills"),
            (0.34, 0.534, "gills"),
            (0.40, 0.552, "margin"),
            (0.415, 0.588, "margin"),
            (0.40, 0.636, "top"),
            (0.30, 0.666, "top"),
            (0.15, 0.66, "top"),
            (0.0, 0.66, "top"),
        ],
        colours={
            "base": ("#e0d0b4", "#e8dac0"),
            "stem": ("#ece0c8", "#f0e6d2"),
            "gills": ("#ecd6ae", "#f0dcb6"),
            "margin": ("#e6c690", "#dcb47a"),
            "top": ("#e0b67c", "#cfa066"),
        },
        lines={
            "kind": "pores",
            "count": 120,
            "rows": 20,
            "width": 0.45,
            "depth": 0.012,
            "fork": False,
            "colour": "#b8925e",
            "highlight": "#fff0d0",
        },
        lobes=0.08,
        lift=0.04,
        lobe_count=(2, 3, 5),
        bend=0.04,
        seed=193,
        tilt=0.06,
        decurrent=0.1,
        rings=150,
    ),
    # Suppilovahverot: a brown, funnel-shaped cap pierced through the centre, with a wavy
    # margin; greyish, forked ridges running down; a hollow yellow stem.
    "craterellus-tubaeformis-agg": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.035, 0.004, "base"),
            (0.045, 0.03, "stem"),
            (0.04, 0.30, "stem"),
            (0.045, 0.52, "stem"),
            (0.06, 0.62, "gills"),
            (0.13, 0.70, "gills"),
            (0.22, 0.765, "gills"),
            (0.28, 0.79, "margin"),
            (0.30, 0.815, "margin"),
            (0.285, 0.835, "top"),
            (0.20, 0.80, "top"),
            (0.10, 0.73, "top"),
            (0.035, 0.66, "top"),
            (0.0, 0.64, "top"),
        ],
        colours={
            "base": ("#c89a2e", "#d8aa3a"),
            "stem": ("#e0b440", "#d8a836"),
            "gills": ("#a89a86", "#b4a690"),
            "margin": ("#9a7a52", "#7a5a38"),
            "top": ("#7a5a3a", "#3e2c1c"),
        },
        lines={
            "count": 22,
            "width": 0.4,
            "depth": 0.008,
            "fork": True,
            "colour": "#6e6252",
            "highlight": "#d6ccbc",
            "wiggle": 0.14,
        },
        lobes=0.1,
        lift=0.05,
        lobe_count=(3, 5, 8),
        bend=0.07,
        seed=197,
        tilt=0.1,
        decurrent=0.5,
    ),
    # Mustatorvisieni: a deep, black-brown trumpet with a flared, wavy margin; the outside
    # almost smooth and ash-grey; thin, leathery flesh.
    "craterellus-cornucopioides": Spec(
        profile=[
            (0.0, 0.0, "base"),
            (0.03, 0.004, "base"),
            (0.04, 0.03, "stem"),
            (0.045, 0.20, "stem"),
            (0.07, 0.40, "under"),
            (0.13, 0.60, "under"),
            (0.21, 0.78, "under"),
            (0.27, 0.86, "margin"),
            (0.295, 0.875, "margin"),
            (0.28, 0.895, "top"),
            (0.20, 0.82, "top"),
            (0.12, 0.65, "top"),
            (0.055, 0.42, "top"),
            (0.0, 0.30, "top"),
        ],
        colours={
            "base": ("#4a4644", "#5a5654"),
            "stem": ("#5e5a58", "#6e6a68"),
            "under": ("#7a7674", "#8a8684"),
            "margin": ("#4e4440", "#2e2624"),
            "top": ("#2a221e", "#14100e"),
        },
        lines={"count": 1, "width": 0.1, "depth": 0.0, "fork": False},
        lobes=0.12,
        lift=0.06,
        lobe_count=(3, 5, 7),
        bend=0.05,
        seed=199,
        tilt=0.08,
        wrinkles={"depth": 0.01, "cells": 12, "stretch": 3, "under": 0.6},
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


def pore_field(u: np.ndarray, t: np.ndarray, lines: dict) -> np.ndarray:
    """0..1 dots in staggered rows: the pore mouths of a bolete or polypore, or the spines
    of a hedgehog mushroom. `count` around the cap, `rows` from the stem to the margin."""
    tt = np.clip(t, 0, 1) * lines["rows"]
    pu = u * lines["count"] + 0.5 * (np.floor(tt) % 2)
    du = pu % 1.0 - 0.5
    dt = tt % 1.0 - 0.5
    d = np.sqrt(du**2 + dt**2)
    return np.exp(-((d / (lines["width"] / 2)) ** 2))


def line_field(u: np.ndarray, t: np.ndarray, lines: dict) -> np.ndarray:
    """0..1 ridge profile at angle u (0..1) and position t (0 at the stem, 1 at the margin).
    With `fork`, every other line splits off a neighbour halfway out, as in a Y."""
    if lines.get("kind") == "pores":
        return pore_field(u, t, lines)
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


def paint(spec: Spec, region_rows: np.ndarray, gill_t: np.ndarray, r_rows=None, length=1.0):
    rng = np.random.default_rng(spec.seed)
    h = w = TEX
    tex = np.zeros((h, w, 3))
    for name, (c0, c1) in spec.colours.items():
        rows = region_rows == name
        if not rows.any():
            continue
        idx = np.where(rows)[0]
        # By rank, so a region split in two (the stem above and below a ring) runs on.
        f = np.arange(len(idx)) / max(len(idx) - 1, 1)
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
    gills = (region_rows == "gills") | ((gill_t < 0) & (gill_t > -1))
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
    # A faint grain along every stem.
    fib = noise((h, w), 260, rng, stretch=(1, 40))
    stem = region_rows == "stem"
    tex[stem] *= (1 + 0.04 * fib[stem])[..., None]
    if spec.bands:
        paint_bands(tex, spec.bands, region_rows, rng)
    if spec.spots:
        paint_spots(tex, spec.spots, region_rows, r_rows, length, rng)
    if spec.stem_net:
        paint_net(tex, spec.stem_net, region_rows, spec.seed)
    return np.clip(tex, 0, 1)


def paint_net(tex, net: dict, region_rows, seed: int) -> None:
    """A raised net over the top part of the stem, as on a cep or a bitter bolete."""
    stem = np.where(region_rows == "stem")[0]
    if not len(stem):
        return
    rows = stem[int(len(stem) * (1 - net.get("reach", 0.6))) :]
    field = pit_field(net["cells"], net.get("stretch", 2.0), np.random.default_rng(seed + 2000))
    a = (field[rows] * net.get("strength", 0.7))[..., None]
    fade = np.linspace(0, 1, len(rows))[:, None, None] ** 0.5
    tex[rows] = tex[rows] * (1 - a * fade) + rgb(net["colour"]) * a * fade


def wrinkle_field(spec: Spec) -> np.ndarray:
    """0 in the grooves, 1 on the ridges: meandering lines along the zero set of smooth
    noise, periodic around the cap."""
    rng = np.random.default_rng(spec.seed + 1000)
    cells = spec.wrinkles["cells"]
    if spec.wrinkles.get("kind") == "pits":
        return pit_field(cells, spec.wrinkles.get("stretch", 1.0), rng)
    st = (1, spec.wrinkles.get("stretch", 1))
    f = noise((TEX, TEX), cells, rng, st) + 0.35 * noise((TEX, TEX), cells * 2, rng, st)
    x = np.clip(np.abs(f) / 0.3, 0, 1)
    return x * x * (3 - 2 * x)  # rounded ridges


def pit_field(cells: int, stretch: float, rng) -> np.ndarray:
    """A honeycomb of pits: 0 in a pit, 1 on the ridges between them (cell borders of
    random points, periodic around the cap, the cells drawn out along the profile)."""
    n = 256
    pts = rng.uniform(0, 1, (cells, 2))
    v, u = np.meshgrid((np.arange(n) + 0.5) / n, (np.arange(n) + 0.5) / n, indexing="ij")
    du = np.abs(u[..., None] - pts[:, 0])
    du = np.minimum(du, 1 - du)
    d = np.sqrt(du**2 + ((v[..., None] - pts[:, 1]) / stretch) ** 2)
    d.sort(axis=-1)
    edge = (d[..., 1] - d[..., 0]) / (d[..., 1] + 1e-9)
    x = 1 - np.clip(edge / 0.35, 0, 1)
    x = x * x * (3 - 2 * x)
    img = Image.fromarray((x * 255).astype(np.uint8)).resize((TEX, TEX), Image.Resampling.BILINEAR)
    return np.asarray(img, np.float64) / 255


def paint_bands(tex, bands: dict, region_rows, rng) -> None:
    idx = np.where(region_rows == bands["region"])[0]
    if not len(idx):
        return
    w = tex.shape[1]
    f = (idx - idx[0]) / max(len(idx) - 1, 1)
    edge = noise((len(idx), w), 40, rng, stretch=(1, 4)) * bands.get("ragged", 0.25)
    stripe = np.sin(f[:, None] * np.pi * 2 * bands["count"] + edge * 3)
    lo = bands.get("thin", 0.35)
    a = np.clip((stripe - lo) / 0.4, 0, 1)[..., None] * 0.8
    tex[idx] = tex[idx] * (1 - a) + rgb(bands["colour"]) * a


def paint_spots(tex, spots: dict, region_rows, r_rows, length, rng) -> None:
    """Irregular flat patches on the cap top, sized in model units so they keep their size
    towards the cap centre; each casts a faint shadow below it, like a drawn wart."""
    h, w = tex.shape[:2]
    top = np.where(region_rows == spots.get("region", "top"))[0]
    if not len(top):
        return
    weight = r_rows[top] / r_rows[top].sum()
    u = (np.arange(w) + 0.5) / w
    colour = rgb(spots["colour"])
    shadow = np.zeros((h, w))
    cover = np.zeros((h, w))
    for _ in range(spots["count"]):
        row0 = rng.choice(top, p=weight)
        u0 = rng.uniform(0, 1)
        rad = spots["size"] * rng.uniform(0.6, 1.4)
        stretch = rng.uniform(0.7, 1.3)
        span = int(np.ceil(rad * 1.6 / length * h)) + 1
        rows = np.arange(max(row0 - span, top[0]), min(row0 + span, top[-1]) + 1)
        du = (u[None] - u0 + 0.5) % 1.0 - 0.5
        dx = du * 2 * np.pi * np.maximum(r_rows[rows], 1e-3)[:, None]
        dy = ((rows - row0) / h * length)[:, None]
        d = np.sqrt((dx * stretch) ** 2 + (dy / stretch) ** 2)
        ang = np.arctan2(dy, dx)
        wob = (
            1
            + 0.1 * np.sin(ang * 2 + rng.uniform(0, 6))
            + 0.06 * np.sin(ang * 3 + rng.uniform(0, 6))
        )
        cover[rows] = np.maximum(cover[rows], np.clip((rad * wob - d) / (rad * 0.25), 0, 1))
        ds = np.sqrt((dx * stretch) ** 2 + ((dy + rad * 0.35) / stretch) ** 2)
        shadow[rows] = np.maximum(
            shadow[rows], np.clip((rad * 1.15 * wob - ds) / (rad * 0.4), 0, 1)
        )
    relief = spots.get("relief", 0.5)
    tex *= (1 - 0.25 * relief * shadow * (1 - cover))[..., None]
    grain = 1 + 0.06 * noise((h, w), 200, rng)
    tex[:] = tex * (1 - cover[..., None]) + (colour * grain[..., None]) * cover[..., None]


# --- Mesh --------------------------------------------------------------------------------


def ring_of_rows(rings: int) -> np.ndarray:
    """The ring each texture row belongs to (rings are equally spaced in v)."""
    return np.clip((np.arange(TEX) + 0.5) / TEX * (rings - 1), 0, rings - 1).round().astype(int)


def build(spec: Spec, rings: int | None = None, segments: int = 150):
    rings = rings or spec.rings
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
    # Outward is up on the cap top (the profile folds back on itself at a ring or volva).
    if n2[region == "top", 1].sum() < 0:
        n2 = -n2

    theta = np.linspace(0, 2 * np.pi, segments + 1)
    u = theta / (2 * np.pi)
    wave_r = np.zeros_like(theta)
    wave_y = np.zeros_like(theta)
    for k in spec.lobe_count:
        wave_r += np.cos(k * theta + rng.uniform(0, 2 * np.pi)) / len(spec.lobe_count)
        wave_y += np.sin(k * theta + rng.uniform(0, 2 * np.pi)) / len(spec.lobe_count)
    rmax = r.max()
    cap = np.isin(region, ["gills", "margin", "top", "under"])
    wcap = np.where(cap, (r / rmax) ** 2.5, 0.0)
    # A sac volva's free rim is torn into lobes, more towards its top.
    volva = region == "volva"
    if spec.volva_lobes and volva.any():
        ytop = y[volva].max()
        wcap = wcap + np.where(
            volva, spec.volva_lobes / max(spec.lobes, 1e-6) * (y / ytop) ** 3, 0.0
        )
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
    folds = wrinkle_field(spec) if spec.wrinkles else None
    if folds is not None:
        rows = np.clip((s * TEX).astype(int), 0, TEX - 1)
        cols = np.clip((u * TEX).astype(int), 0, TEX) % TEX
        under = spec.wrinkles.get("under", 0.5)
        reach = np.where(region == "top", 1.0, np.where(region == "under", under, 0.0))
        d = spec.wrinkles["depth"] * (folds[rows][:, cols] - 0.5) * reach[:, None]
        R = R + d * n2[:, 0:1]
        Y = Y + d * n2[:, 1:2]
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
    # Outward means away from the axis, summed over the whole surface.
    radial = pos.copy()
    radial[:, 1] = 0
    if np.einsum("ij,ij->", nrm, radial) < 0:
        nrm = -nrm
        faces = faces[:, [0, 2, 1]]

    uv = np.stack(np.meshgrid(u, s), -1).reshape(-1, 2)
    # Each texture row takes its nearest ring, so regions and line t never blend across a border.
    ring = ring_of_rows(rings)
    total = float(np.sum(np.linalg.norm(np.diff(np.stack([r, y], 1), axis=0), axis=1)))
    tex = paint(spec, region[ring], t[ring], r[ring], total)
    if folds is not None:
        # Shade the grooves, as a drawing would.
        cap_rows = np.isin(region[ring], ["top", "under"])
        tex[cap_rows] *= (0.55 + 0.45 * folds[cap_rows])[..., None]
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
        # A new name, so a cached copy of an older model under the old URL is never served.
        name = f"{class_id}-drawn.glb"
        write_glb(OUT / name, *mesh)
        listed[class_id] = {"file": name, "drawn": True}
        size = (OUT / name).stat().st_size
        print(f"{class_id}: {len(mesh[0])} vertices, {size / 1e6:.2f} MB")
    (OUT / "models.json").write_text(json.dumps(listed, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
