# Story Dates, School Calendar and Holidays

**Languages:** [繁體中文](../zh-TW/calendar.md) · [English](calendar.md) · [日本語](../ja/calendar.md)

The single source of truth is `schoolCalendarRules`, `schoolCalendar` and `calendarPromptContext` in `core/calendar.ts`; the Editor's "Story and time" section displays these rules. Do not write a separate "is it a holiday today" check inside the story, LINE or Twitter each on their own.

| Period | Rule |
| --- | --- |
| Summer vacation | July 21 to the day before school starts in September |
| Winter vacation | December 24 to the day before school starts the following January |
| Spring break | March 25 to the day before school starts in April |
| Golden Week | April 29 to May 5 |
| Japanese New Year holidays | January 1–3 |
| First day of school | From April 8, September 1 and January 7 respectively, the first valid school day that is neither a weekend nor a public holiday, searching forward |

It also computes common Japanese public holidays, Sunday substitute holidays, and national holidays created by public holidays that flank a single day. The spring and autumn equinoxes use the approximation formula inside the program; this game's school calendar is not a government-published calendar for future years and does not include temporary legislative changes or one-off changes for special years. If the requirement were to become an exact real-world statutory calendar, the official data should be verified before changing the algorithm and tests.

`schoolCalendar(date)` returns `dayType`, `label`, `schoolOpen`, `schoolAccessible`, `schoolTerm`, `openingDay` and so on. `schoolOpen` is whether classes are held normally; `schoolAccessible` additionally permits the partial-holiday school access scenario on non-weekend/non-holiday days. Campus navigation must not just look at "weekday"; it should apply the corresponding school-open determination.

`calendarPromptContext(date)` hands the LLM the same date facts plus the explicit in-session/out-of-session restrictions, for use in the story, character dialogue, LINE and Twitter. After changing the rules, verify `tests/calendar.test.ts`, `tests/scene-time.test.ts`, `tests/date.test.ts` and the community period tests; pay particular attention to the start of holidays, the first day of school falling on a weekend/public holiday, year-end, substitute holidays and ordinary school days.