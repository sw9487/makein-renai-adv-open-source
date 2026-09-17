# Novel Volumes 4–9 Event Pack

**Languages:** [繁體中文](../zh-TW/novel-story-pack.md) · [English](novel-story-pack.md) · [日本語](../ja/novel-story-pack.md)

This pack is still 6 novel-themed "import" events with 18 choices; afterward the [mainline continuation](mainline-continuation.md) separately adds 19 continuation events, and the Momozono Junior High visit is covered separately in [Momozono Junior High](momozono-map.md). Core situations were confirmed against Shogakukan / Gagaga Bunko volume summaries; the bibliography and trial-reading pages were also cross-checked. The trial-reading pages do not provide readable body text, so this does not claim line-by-line verification of the full text. The game dialogue, choices, and responses are fan-fiction adaptations and do not represent the original-work branches or the ending of any full volume.

| Volume | Event | Game period / entrance | Prerequisite | Publisher summary |
|---|---|---|---|---|
| 4 | Confiscating the Books and Shikiya's Proposal | First-year December / Student Council Room | Opening Yanami event | [Synopsis](https://gagagabunko.jp/lineup/202210.html) |
| 5 | Handmade Chocolate, Recipient Isn't My Brother? | First-year February / Nukumizu Home | Opening Yanami event | [Synopsis](https://gagagabunko.jp/lineup/202303.html) |
| 6 | The Starting Line Before the 100-Meter Club-Withdrawal Duel | First-year March / School Grounds | Opening Yanami event | [Synopsis](https://gagagabunko.jp/lineup/202312.html) |
| 7 | Shiraitori Riko's Wedding-Plan Proposal | Second-year April / Literature Club Room | `riko-first` first meeting | [Synopsis](https://gagagabunko.jp/lineup/202407.html) |
| 8 | Amane Hoshino as the Recommender's Invitation | Second-year June / Student Council Room | Opening Yanami event | [Synopsis](https://gagagabunko.jp/lineup/202505.html) |
| 9 | Five-Person Trip, the Promise Before Departure | Second-year August / Toyohashi Station | `koharu-first` first meeting | [Synopsis](https://gagagabunko.jp/lineup/202607.html) |

The months and entrances are game arrangements and are not derived from the novels' publication months. The election is scheduled before the existing setting's second-year July student council handover; Riko and Koharu follow the existing character-appearance restrictions. The stories are concentrated on the proposals, predicaments, and preparations that can be confirmed from the public synopses; for example, the 100-meter race does not force a winner/loser, the wedding proposal does not invent a final outcome, and the trip event does not treat the fan-fiction responses as the novel's ending.

## Illustrations

This pack reuses 6 existing local scene images that match the scenes: `108` Student Council Room, `109` Nukumizu Home, `103` Racetrack, `102` Literature Club, `204` Student Council Work, `106` Station; full filenames are in `content/assets/backgrounds/` (102, 103, 106, 108, 109) or `content/assets/cg/` (204). These are the project's existing original assets, not the illustrations for Volumes 4–9, nor do they pass off early anime screenshots as CG for later-novel events. Each event and asset record carries this marking.

## Updates and Verification

- `core/novel-events.ts` provides the events and the `novel-volume-4-9-v1` one-time update; `core/story.ts::upgradeStories` connects this pack, Momozono Junior High, the mainline continuation, and the public-places pack in order. Do not mistake this document's 6 import events for all the Volume 4–9 events.
- `content/game.json` is updated in sync; old content is added on read, and the story-pack flag is retained after saving without overwriting later deletions/edits.
- It is not necessary to complete all earlier events to read later-novel content, to avoid old saves missing the July event and then being unable to trigger the entire chain. Specific new characters still require their first meeting to be completed first.
- Each new event is limited to one academic year / month, can only be completed once, and has existing map hints, affection changes, memories, and album unlocks.
- `tests/novel-events.test.ts` covers the six events' actual visits, prerequisites and year/month restrictions, positive and negative affection, albums, and the one-time update.