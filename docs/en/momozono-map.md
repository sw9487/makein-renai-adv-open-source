# Momozono Middle School

**Languages:** [繁體中文](../zh-TW/momozono-map.md) · [English](momozono-map.md) · [日本語](../ja/momozono-map.md)

Adds the location `momozono`, the campus of Kaki, Asami Gondou and Satoshi Tachibana. `campus: middle` is judged separately from Ishiwatari High School; a character must have already appeared and still be attending middle school. It uses the game's existing rules of after-school visits on weekdays, once per time slot, and school buildings closed on weekends; this is not a realistic free-roam tour of the school.

After completing `novel-valentine-suspicion` in the second year, visiting can trigger `novel-momozono-visit`, which comes with three affection options and a photo-album unlock. The specific date and dialogue of the visit day are arranged by the game.

The user's complete main-story outline is kept in [main-story-user-outline.md](main-story-user-outline.md) as a creative reference. The readers' interpretations, speculation and retellings in that document are not automatically taken as verified original text. The Momozono Middle School visit is a prerequisite between the volume-5 introduction and the [19 main-story continuation events](mainline-continuation.md); the later event pack is already implemented, but it is still a fan re-write, not a chapter-by-chapter reproduction of the original.

The location and visit event live in `core/momozono.ts`, wired in once via `core/story.ts::upgradeStories` (`momozono-school-v1`); the regression test is `tests/momozono.test.ts`.

## Original background

Tool: built-in imagegen. Asset: `content/assets/backgrounds/00000000-0000-4000-8000-000000000110.png`. Generated and copied fully into the project, with no cropping or re-painting; not an official illustration. The composition of the school gate, main building and gardening flower beds has been checked.

Generation prompt:

> Create a polished Japanese visual novel background illustration, landscape 16:9, no people. A fictional public junior high school in Toyohashi Japan, viewed from inside its front gate looking across a small courtyard toward a modest three-story cream school building. Distinctive small gardening club area in the foreground right: green planter boxes, flowers, watering cans. Bicycle parking and low shrubs on the left. Warm late afternoon in February, clear sky, soft golden sunlight, subtle winter trees, clean realistic architecture, painterly anime background style, elegant detailed textures, calm inviting mood. Leave lower quarter uncluttered for dialogue overlay. No text, no signage lettering, no watermarks. This is Momozono middle school atmosphere for a fan visual novel, original environment, not a reproduction of an official image.