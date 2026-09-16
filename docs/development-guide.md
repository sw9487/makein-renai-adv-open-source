# 開發指南

本專案以「能力最小化、資料最小化、伺服器最終驗證」作為所有 AI API 整合的基本規則。這些規則不是 prompt 建議，而是 payload 與程式結構的要求。

## 本機開發與真實資料

從專案根目錄執行 `npm ci`、`npm ci --prefix web`，再使用 `npm run dev`（預設 9487）啟動開發伺服器。前端由 `vite build` 打包到 `dist/client`，由伺服器在 9487 提供。`package.json` 列有完整檢查指令。開發資料庫、上傳和密鑰不是版控內容；Editor 儲存內容只寫本機玩家資料目錄。不要把測試與實機診斷指向玩家存檔。

> 開發環境使用 `compose.dev.yaml`（postgres-dev 5439、s3-dev 8334），伺服器在本機跑 Bun；與正式（`compose.yaml`）及測試（`compose.test.yaml`）的容器、資料卷、資料庫與網路各自獨立、互不干擾。完整啟動方式與隔離對照見[環境區分](environments.md)。SQLite 已移除，因此開發前務必先啟動 postgres-dev。

## LLM payload 規則

1. **不允許的能力不要寫進 payload。** 若某情境不能生圖、不能搜尋或不能操作某類資料，就不要提供對應 tool、tool 參數、圖片或上下文。不得以「仍提供能力，再用 prompt 要求模型不要使用」代替結構限制。
2. **只傳本次判斷需要的資料。** 選擇 Twitter 回覆目標時只傳文字資料；目標確定後，才以另一則請求傳入該目標的單一圖片。不得把候選貼文或留言的所有圖片一次送入模型。
3. **依情境組裝 schema。** 一般 Twitter 行動使用不含圖片欄位的文字工具；只有新圖文貼文才提供獨立圖片貼文工具。固定動作只保留該動作實際需要的欄位與 enum。
4. **獨立資料使用獨立請求。** 翻譯 JSON 時，每個可翻譯欄位各自一則 API 請求；可以有限併發，但不得合併欄位、遺漏路徑或讓模型重組整份設定。
5. **媒體預設高成本。** 圖片、音訊與大型歷史內容只有在選定目標且確實需要時才加入，並使用足夠完成任務的最低品質與最小數量。

## 驗證與失敗策略

- JSON schema 的 `additionalProperties` 應設為 `false`，工具回傳仍須由伺服器解析、驗證權限與重新核對目前狀態。
- Prompt 只負責語意與品質，不負責安全邊界或能力停用；能力邊界由 payload 與伺服器程式保證。
- 付費或不可重複的請求在送出前先完成本地驗證。狀態已變更時丟棄舊結果，不可把過期結果寫回。
- 批次操作若要求完整性，應先收集全部結果，全部成功後一次套用；中途失敗不得留下半套資料。
- 遊戲操作帶 `runId`、`requestId` 與必要的修訂檢查；模型或圖片完成時要再次核對目標。非冪等外部請求結果不明時不應盲目重送。持久請求與事件見 `server/harness-request.ts`、`server/harness-events.ts`；Twitter 另在本身 API 記錄操作去重。
- 公開／私人社群可見性、角色記憶與完整工作紀錄屬不同邊界；一般遊戲快照不可直接洩漏 Twitter 原始資料。跨 LINE／Twitter／劇情的工具行動需記清行為者與來源，不能把社群事件誤映射成玩家說話。

## 測試要求

涉及 LLM payload 的修改至少要測試：

- 不允許的 tool 或欄位確實不存在，而不只是值為 `false`。
- 未選定目標前不含圖片；選定後只含對應的一張圖片。
- 模型回傳越權 action、額外能力或過期 target 時，伺服器拒絕套用。
- 完整執行 `bun run check`、`bun run audit:i18n`、`bun run test` 與 `bun run build`。

> 測試環境：測試依賴一個 PostgreSQL 測試庫（見 `compose.test.yaml`，本機 5450 埠），由 `tests/bootstrap.ts` 透過 `MAKEIN_TEST_DATABASE_URL`（預設 `postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB`）連線。`bun run test` 已內含 `--timeout=40000`——因為 postgres.js 較慢、且連線 desync 的還原會讓 web-search 等案例超過 Bun 預設 5 秒；直接 `bun test ./tests` 不會帶這個參數（Bun 1.3.14 會忽略 `bunfig.toml [test].timeout`）。重複測試前可先 `bun scripts/drop-test-schemas.ts` 清掉累積的測試 schema。

內容事件或地圖更新另跑對應 `tests/canon-events.test.ts`、`tests/novel-events.test.ts`、`tests/mainline-continuation.test.ts`、`tests/momozono.test.ts`；社群、圖片、知識與搜尋有各自同名測試。外部真實 API 的 live audit 可能消耗額度，應以隔離存檔且明確按需執行；模擬測試通過不等於所有模型文筆或 SD 畫質都已目視驗證。

## 圖片資產位置

- `content/assets/`：角色立繪、頭像、場景、事件 CG，以及 Editor 素材書庫可管理的正式遊戲內容。
- `web/public/assets/`：固定 UI／品牌圖示與 AI 能力檢查等前端系統資產，例如 LINE、Twitter 圖示與 `check img.png`。
- `web/public/favicon.svg`：網站 favicon，依 Vite 公開檔案慣例保留在 public 根目錄。
- 玩家上傳及生成圖片存於玩家資料目錄的 `uploads/`，不可寫回正式內容資產。

新增圖片前先判斷它屬於遊戲內容或系統 UI；同類資產必須放在同一位置，並同步更新程式引用、素材紀錄與授權／來源說明。

內建場景與官方地點圖片保留原始 PNG，旁邊另有品質 88 的同名 JPEG 展示版；`web/lib/scene-images.ts` 只對列明的內建場景切換到展示版，玩家上傳素材不會被改寫。更新這些原圖時也要重製同名 JPEG，並同步維護該檔的清單。轉場的黑屏會等待下一張背景與角色立繪完成解碼；每次載入嘗試設 30 秒安全上限，展示版失敗時退回原圖。作者素材路由提供一小時快取與 ETag，素材內容更新後瀏覽器會重新驗證。

## 內容升級與穩定識別碼

`core/story.ts::upgradeStories` 依序處理既有文字修補、角色故事修復、第1–3卷題材、第4–9卷導入、桃園中學、主線接續、小說書目及公眾地點包。每個包用 `storyPacks` 標記一次性加入，之後應保留 Editor 的刪改；新增事件或地點前先檢查前置、日期、年級、場景圖及舊存檔路徑。

事件 ID、地點 ID、角色 ID 和社群帳號 ID 是持久引用，不只是 UI 字串。更名時需同步處理作者內容、進度中的 location／待處理約會、關係表、貼文作者／提及及測試；不能只改畫面名稱或 @handle。既有 `gusto-kaimei` → `gusto-hashira` 的地點修復可參考 `core/official-places.ts`；新增遷移應明確保護既有玩家資料。

功能細節從 [文件索引](README.md) 進入；若本文與歷史研究筆記衝突，優先看目前原始碼及測試。
