"""Match bundled expression PNG canvases to each character's normal portrait.

Development-only, deterministic asset maintenance. Requires Pillow; never calls an
image-generation service. Run with --check to audit without modifying files.
"""

import argparse
import json
import os
from pathlib import Path
import tempfile

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "content" / "assets"


def asset_path(url: str) -> Path:
    return ASSETS / url.removeprefix('/assets/authored/')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Report mismatches without rewriting PNGs")
    args = parser.parse_args()
    content = json.loads((ROOT / "content" / "game.json").read_text(encoding="utf-8"))
    mismatches = []

    for character in content["characters"]:
        normal = asset_path(character["sprites"]["normal"])
        if not normal.is_file():
            raise FileNotFoundError(f"Missing normal portrait for {character['id']}: {normal}")
        with Image.open(normal) as original:
            target_size = original.size

        for expression, url in character["sprites"].items():
            if expression == "normal" or not url:
                continue
            image_path = asset_path(url)
            # Never change editor uploads or another character's unrelated assets.
            if not image_path.name.startswith(f"{character['id']}-") or not image_path.name.endswith("-expression.png"):
                continue
            if not image_path.is_file():
                raise FileNotFoundError(f"Missing {character['id']} {expression}: {image_path}")
            with Image.open(image_path) as source:
                if source.size == target_size:
                    continue
                mismatches.append((character["id"], expression, source.size, target_size))
                if args.check:
                    continue
                # Contain, rather than stretch, preserves anatomy even for the
                # few source sheets whose aspect ratios differ by several percent.
                resized = ImageOps.contain(source.convert("RGBA"), target_size, Image.Resampling.LANCZOS)
                canvas = Image.new("RGBA", target_size, (0, 0, 0, 0))
                canvas.alpha_composite(resized, ((target_size[0] - resized.width) // 2, target_size[1] - resized.height))
                with tempfile.NamedTemporaryFile(dir=image_path.parent, suffix=".png", delete=False) as temporary:
                    temporary_name = temporary.name
                try:
                    canvas.save(temporary_name, format="PNG", optimize=True)
                    os.replace(temporary_name, image_path)
                finally:
                    if os.path.exists(temporary_name):
                        os.unlink(temporary_name)

    for character_id, expression, before, after in mismatches:
        print(f"{character_id}/{expression}: {before[0]}x{before[1]} -> {after[0]}x{after[1]}")
    print(f"{'Mismatched' if args.check else 'Normalized'} expression canvases: {len(mismatches)}")
    if args.check and mismatches:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
