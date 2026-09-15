"""Reframe the eight underfilled expression canvases without redrawing artwork.

The transparent bounds are the only input; anatomy, clothing and feet stay intact.
The result keeps each character's existing 386x1135 sprite canvas.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "content/assets/sprites"
NAMES = {
    "tamaki": ["smug", "flustered", "disdainful", "dazed", "awkward"],
    "kaju": ["dazed", "excited"],
    "amanatsu": ["excited"],
}

for character, expressions in NAMES.items():
    folder = ROOT / character
    for expression in expressions:
        path = folder / f"{character}-{expression}-expression.png"
        with Image.open(path) as original:
            image = original.convert("RGBA")
        bounds = image.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"Empty expression: {path}")
        body = image.crop(bounds)
        # Maximise the figure while leaving a small safety margin; never cut
        # off a wide gesture merely to force every figure to an equal height.
        scale = min((image.width - 12) / body.width, (image.height - 12) / body.height)
        size = (round(body.width * scale), round(body.height * scale))
        body = body.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
        canvas.alpha_composite(body, ((image.width - size[0]) // 2, image.height - size[1]))
        canvas.save(path, "PNG", optimize=True)
        print(f"{character}/{expression}: {bounds} -> {canvas.getchannel('A').getbbox()}")
