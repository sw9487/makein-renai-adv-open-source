# Original-Source Story Pack: Volumes 1–3

**Languages:** [繁體中文](../zh-TW/canon-story-pack.md) · [English](canon-story-pack.md) · [日本語](../ja/canon-story-pack.md)

This document specifies the 10 imported events of `core/canon-events.ts`; it coexists with the Volume 4–9 novel import and the [mainline continuation](mainline-continuation.md). This document is not a list of the current total number of events in the game.

It adds 10 `canon-inspired` events, 30 choices, and 10 officially published scene images. The original plotlines were cross-checked against the official anime episode synopses; the titles, dialogue, player choices, and responses in the table below are this game's fan-fiction adaptations, not verbatim excerpts from the novels. The images are representative scenes from the corresponding episodes, not frame-by-frame reproductions of every line of dialogue.

Publisher data: [Volume 2](https://gagagabunko.jp/lineup/202111.html), [Volume 3](https://gagagabunko.jp/lineup/202204.html). Volume 2 is the Lemon arc covering the second half of summer vacation, and Volume 3 concerns the October Isogusa Festival and club leadership handover. The months, map entrances, and November report practice in the table are arranged to fit the existing in-game calendar and are not confirmed original-work dates; some entrances lead to other locations described within the events.

| Event | First-year month | Map entrance | Prerequisite event | Official cross-check source |
|---|---|---|---|---|
| In the Infirmary, the Name Left Unspoken | 7 | School Grounds | Opening Yanami event | [Episode 2](https://makeine-anime.com/story/?id=ep02) |
| Before the Training Camp, Hand in One Page of Story | 7 | Literature Club Room | Opening Yanami event | [Episode 3](https://makeine-anime.com/story/?id=ep03) |
| The Dating Rumor on the Emergency Stairs | 7 | Classroom | Before the Training Camp, Hand in One Page of Story | [Episode 4](https://makeine-anime.com/story/?id=ep04) |
| Outside the Café, the Third Person's Doubt | 8 | Family Restaurant | Opening Yanami event | [Episode 5](https://makeine-anime.com/story/?id=ep05) |
| The Distance After the Planetarium Ends | 8 | Zoo and Botanical Park | Outside the Café, the Third Person's Doubt | [Episode 6](https://makeine-anime.com/story/?id=ep06) |
| In the Schoolyard at Night, Words for Herself | 8 | School Grounds | The Distance After the Planetarium Ends | [Episode 7](https://makeine-anime.com/story/?id=ep07) |
| The Next Club President and the School Festival Plan | 10 | Literature Club Room | Opening Yanami event | [Episode 8](https://makeine-anime.com/story/?id=ep08) |
| On the Way Back from the Library, the Display Drafts Clutched Close | 10 | Seibunkan Bookstore | The Next Club President and the School Festival Plan | [Episode 9](https://makeine-anime.com/story/?id=ep09) |
| Isogusa Festival, Leaving the Booth Together for a Moment | 10 | Literature Club Room | On the Way Back from the Library, the Display Drafts Clutched Close | [Episode 10](https://makeine-anime.com/story/?id=ep10) |
| Report Practice in the Zoo and Botanical Park | 11 | Zoo and Botanical Park | Isogusa Festival, Leaving the Booth Together for a Moment | [Episode 11](https://makeine-anime.com/story/?id=ep11) |

## Files and Updates

- `core/canon-events.ts`: the story and one-time addition logic; `core/story.ts::upgradeStories` is called when `core/content.ts` loads.
- `content/game.json`: the official default content snapshot; the same events were added to it.
- `content/canon-stills.json`: the official page, original image URL, and local path for each image.
- `content/assets/cg/00000000-0000-4000-8000-000000000302.jpg` through `00000000-0000-4000-8000-000000000311.jpg`: unmodified officially published scene images.
- `scripts/fetch-canon-stills.ts`: re-downloads the images based on the verified scene numbers.

When old content is first read, the story pack is added with the `storyPacks` flag; after the editor saves, the flag is retained, and events the author deletes are not added back later. Existing event text, images, and player saves are not overwritten. Saves that have already passed the first-year month do not have their dates rolled back; the corresponding events can be experienced from an earlier save or a new story.

Each event is restricted to first year, cannot be repeated, and requires its prerequisite choice to be completed first. When triggerable, the map subtitle shows the original-work event name; campus events follow the existing rule that school buildings are closed on weekends. After making a choice, the existing affection, memory, and album flows are used.

## Verification

`tests/canon-events.test.ts` walks through all 10 events with the game engine, verifying trigger order, choice completion, album unlocks, grade/year restriction, and local images; it also verifies the one-time update, editor deletion/editing, and that data is retained after export.