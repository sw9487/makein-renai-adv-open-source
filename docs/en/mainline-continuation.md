# Volumes 4–9 Mainline Event Completion

**Languages:** [繁體中文](../zh-TW/mainline-continuation.md) · [English](mainline-continuation.md) · [日本語](../ja/mainline-continuation.md)

Expanded from the user-provided [story outline](main-story-user-outline.md), this adds a total of 19 continuation events that connect the earlier novel imports and the Momozono Junior High events. The dialogue and player responses are fan-fiction adaptations, not the original text or a scene-by-scene reproduction.

| Volume | Event sequence (taking over from the existing imports) |
| --- | --- |
| 4 | Confiscation of the works → Conditions for return → Shikiya and Kotō conversation → Event resolution and Amane Hoshino's trust |
| 5 | The chocolate mystery → Momozono Junior High visit → Gardening club social circle → Amane Hoshino ignored → The siblings re-understand their boundaries |
| 6 | Aquarium invitation → 100-meter bet → Club-assisted training → The race → Club belonging and independent choice |
| 7 | Riko's revenge invitation → Wedding venue → Shikiya as the bride and the topic of marriage registration → Returning to the club after heartbreak |
| 8 | Recommender invitation → Yanami supports the rival → Recommendation speech → Amane Hoshino's confession and starting from friendship |
| 9 | Hida trip invitation → Koharu, Hiroto, and Hibari's tension → Hiroto faces the reply → Nukumizu faces Amane Hoshino again |

The Volume 9 return event additionally requires completing the Volume 8 confession, to avoid skipping a key memory. Events appear according to the existing academic year and month rules; the prerequisite events must be completed before going to the corresponding location.

The implementation entry point is `mainline-continuation-v1` in `core/mainline-continuation.ts`; `core/story.ts::upgradeStories` connects it after the novel imports and Momozono Junior High. This pack does not turn all the speculation in the user's outline into established in-game facts; when maintaining it, each `beats` entry's grade, month, location, and prerequisite should be checked item by item. Regression tests are in `tests/mainline-continuation.test.ts`.

The outline does not specify the chocolate's final recipient, the exact 100-meter winner/loser and timing, the figure during Nukumizu's hesitation, or the final pairing of the Hida triangle; this version does not arbitrarily fill these in as original-work conclusions. The race and relationship follow-ups are connected as fan-fiction scenes with undecided results/pairings.

Each event has three player responses with affection changes of +3, +1, and −3. All new events have available illustrations, currently reusing original situational backgrounds; the aquarium and wedding are not dedicated scene illustrations, nor are they passed off as official original-work illustrations. Momozono Junior High uses an independent original campus background.

When loading existing content, it is added once via `mainline-continuation-v1`, preserving custom content and later deletions; there is no need to restore default values or clear saves. Saves that have already passed the month are not rolled back.