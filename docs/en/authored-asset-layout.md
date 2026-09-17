# Built-in Image Directories

**Languages:** [繁體中文](../zh-TW/authored-asset-layout.md) · [English](authored-asset-layout.md) · [日本語](../ja/authored-asset-layout.md)

`content/assets/` holds only the game's official built-in images; images uploaded by players and generated for testing remain in the user data directory and do not automatically enter the GitHub source merely because of this categorization.

| Subdirectory | Purpose |
| --- | --- |
| `sprites/<character ID>/` | That character's original image and all expression portraits; `archive/` stores portraits that are retained but no longer referenced |
| `avatars/<character ID>/` | Character headshots; kept as independent copies even when they share their source with the portraits |
| `backgrounds/` | Game location and scene backgrounds, including the preloaded JPGs |
| `cg/` | Story event CGs and official scene images |
| `books/` | Book covers for the asset book library |
| `covers/` | If author assets are placed here, used for community account banners |
| `misc/` | Official images that do not yet belong to a dedicated category |

In settings such as `content/game.json`, image URLs must keep the categorized path, e.g. `/assets/authored/sprites/tamaki/tamaki-smug-expression.png`. Both the local server and the build process look up images by this relative path. When adding new author assets, do not simply place them in the `content/assets/` root directory any more.

Sprite transparent canvases and display sizes are handled separately: the image file keeps the full body; the game aligns the head by visible pixels and, for full-body poses that occupy too low a proportion of the canvas, re-corrects the visible height. To check the size of existing image files, use `python scripts/normalize-expression-sizes.py --check`.