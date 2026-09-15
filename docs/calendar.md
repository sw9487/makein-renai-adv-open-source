# 故事日期、校曆與節假日

唯一規則來源是 `core/calendar.ts` 的 `schoolCalendarRules`、`schoolCalendar`、`calendarPromptContext`；Editor「故事與時間」顯示這些規則。不要在劇情、LINE 或 Twitter 各自另寫一份「今天放假嗎」的判斷。

| 期間 | 規則 |
| --- | --- |
| 暑假 | 7 月 21 日至 9 月開學日前 |
| 寒假 | 12 月 24 日至隔年 1 月開學日前 |
| 春假 | 3 月 25 日至 4 月開學日前 |
| 黃金周 | 4 月 29 日至 5 月 5 日 |
| 日本新年假期 | 1 月 1–3 日 |
| 開學日 | 從 4 月 8 日、9 月 1 日、1 月 7 日各自向後找第一個非週末、非國定假日的有效上課日 |

另計算日本常見國定假日、週日補假及前後國定假日夾出的國民假日。春分與秋分採程式內的日期估算式；本遊戲校曆不是政府發布的未來年度行事曆，不包含臨時法改或特殊年度一次性異動。若需求變成現實世界精確法定日曆，應先核對官方資料再改演算法與測試。

`schoolCalendar(date)` 回傳 `dayType`、`label`、`schoolOpen`、`schoolAccessible`、`schoolTerm`、`openingDay` 等。`schoolOpen` 是是否正常上課；`schoolAccessible` 還容許非週末／非假日的部分假期到校情境。校園導航不要只看「平日」；應用相應的學校開放判斷。

`calendarPromptContext(date)` 將同一日期事實與明確的上課／不上課限制交給 LLM，供劇情、角色對話、LINE 與 Twitter 使用。改規則後驗證 `tests/calendar.test.ts`、`tests/scene-time.test.ts`、`tests/date.test.ts` 及社群時段測試；特別檢查假期開始、開學日碰週末／國定假日、跨年、補假和普通上課日。
