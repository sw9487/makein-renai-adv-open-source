# DeepSeek Harness 對照與優化方案

這份文件保留 2026-09-10 的研究與當時的落地提案；**第 1–5 節的「目前尚無／建議加入」是當時快照，不是最新版 runtime 說明**。閱讀當前狀態請先看文末「已落實的第一版 Harness」及 [開發指南](development-guide.md)，再核對 `server/harness-request.ts`、`server/harness-events.ts`、`server/tool-registry.ts`、`server/model-runtime.ts`、`server/memory-view.ts`。

原檢查日期：2026-09-10。對照官方原始碼 commit `b2e3b2a0125854567a4a5fcba75782e42fe84901`。沒有安裝或執行 dsh，也沒有替換本遊戲 runtime。

官方專案：https://github.com/deepseek-ai/deepseek-harness

## 結論

適合借鏡其請求身分、持久事件、工具執行契約、模型適配與上下文整理方式。先在現有 Bun／SQLite 上逐步落實，不需要引入整套 Cordis 外掛樹。官方 README 明確標示 developer preview，可能有不相容變更。

保留約束：SD／搜尋可關閉；LINE 與劇情独立；LLM 決定是否呼叫工具；不新增 API 時間上限；遊戲資料與可發布內容分離。不要把 Harness 的 timeoutMs 選項當成遊戲必須採用的政策。

## 1. 優先加入跨重試的請求識別

上游依據：`packages/api/session-controller/README.md` 的 requestId／rpcId、pending submission 和既有 acceptance 重用契約。

本遊戲已有前端按鈕鎖、runId 與 sceneRevision，但 `server/game-api.ts` 沒有 requestId 去重。請求已完成、回應在網路中遺失時，玩家重試會被當成另一個請求。

方案：前端第一次送出建立 requestId，重試沿用同一 ID；SQLite 用 `(owner, runId, requestId)` 唯一約束保存輸入摘要、工作狀態與結果。相同 ID 不同輸入拒絕；相同 ID 同一輸入返回原工作或結果。遊戲狀態更新與工作完成紀錄放在同一交易。

外部 SD 不支援冪等鍵時，無法保證跨程序崩潰的遠端「恰好生成一次」。遠端結果不明時標為 unknown，保留查詢與人工重試入口，不自動重送。

驗收：雙分頁同時送同 ID、提交成功後斷線重試、同 ID 不同輸入、生成期間讀檔／新遊戲、程序重啟後查詢原結果。

## 2. 用持久事件推送 LINE 與工作狀態

上游依據：`docs/architecture.md` 的 durable Session events 與 transient Agent events；`packages/api/session-controller/README.md` 的 follow、seq 和重連補齊。

本遊戲已有獨立背景 LINE、未讀狀態、生圖紀錄，但 UI 仍每 1.5 秒查詢一次。`server/timings.ts` 只保存最近 100 筆程序內統計，無法重建完整工作經過。

方案：SQLite append-only events，每筆含 owner、runId、requestId、seq、type、payload。用單一 SSE 通道推送 line.received、image.queued、image.started、image.completed 等事件；客戶端依 seq 去重，斷線後從最後游標補送。正在輸出的字元可為暫態，已完成訊息必須先持久化。游標過舊時回傳快照並重設游標。

驗收：斷線補送無漏訊／無重複、慢客戶端不堵住生成、讀檔後舊事件不污染新遊戲、收訊不重置打字機。需考慮紀錄保留與事件分頁，不把所有記憶全文重複放進通知。

## 3. 將工具入口統一成小型 registry

上游依據：`docs/subsystems/tools.md` 與 `packages/core/tools/src/index.ts` 的 schema、execute、canonical output、concurrency metadata、取消契約。

目前角色、劇情、搜尋與 SD 分別解析工具輸入。建議建立一致的工具定義：名稱、啟用條件、輸入驗證、結果驗證、execute、是否可安全並行；領域規則仍留在各模組。

工具清單只能包含當下可用的功能。關閉 SD 時不註冊圖片工具；工具不存在、參數錯誤、服務失敗、玩家取消、結果不明應分成可辨識的結果。工具執行結果確認後才可宣稱圖片已傳送。安全的知識查詢可並行；同一 SD 服務維持佇列。

驗收：關閉外掛時無網路請求；任意 LLM 工具名稱／JSON 不使狀態損壞；失敗後佇列可繼續；取消不提前釋放仍在執行的工作。

## 4. 加入真正的上下文預算與可追溯摘要

上游依據：`docs/subsystems/compaction.md` 的 pressure／context-overflow、來源序號、摘要替換交易、失敗不替換原內容。

目前重要記憶已有日期與證據，但 `core/engine.ts::compactMemory` 的 summary 仍是字串拼接後截尾，archive 只保留 200 則。這是前次改善後仍存在的限制。

方案：保留原始對話事件，為當次請求產生 context view。依可取得的模型容量與估算 token 計算預算，優先保留角色設定、目前日期／時段、近期完整對話、相關重要記憶。低優先上下文才摘要；摘要附來源事件 ID、版本及覆蓋範圍，成功驗證後才取代輸入視圖。摘要失敗仍可回到原始紀錄。先以確定的預算裁減及檢索落地，再加入 LLM 摘要。

驗收：跨日記憶不誤認成今天；重要約定可追溯；摘要失敗不丟資料；上下文溢位不盲目重送相同超長 prompt；工具呼叫與結果不能拆散。

## 5. 模型適配與結構化錯誤

上游依據：`docs/subsystems/llm-streaming.md` 的 adapter、模型上下文資訊、串流詞彙與 provider retry policy；`docs/agent-lifecycle.md` 的 step／attempt／settlement。

把散落的 endpoint 組裝、tool-call 解碼、usage、finish_reason、模型錯誤集中到共用適配層。先保留目前 OpenAI 相容協定，不綁定 DeepSeek 模型。模型清單作提示，不阻止手動填入未列出的模型。

区分：認證／參數錯誤、限流、上下文過長、輸出被截斷、使用者取消、傳輸結果不明。重試必須符合操作語意並沿用 requestId；不把重試次數、输出 token 預算與 API 逾時混為一談。以 requestId 串聯每一步耗時，避免保存金鑰或未遮罩的標頭。

## 建議落地順序

1. requestId 與工作狀態交易，先消除重複副作用。
2. 持久事件與 SSE，取代 LINE 輪詢並支援補送。
3. 工具 registry 及模型適配，統一既有模組的執行契約。
4. 上下文預算、來源檢索及摘要，另外用長篇遊玩樣本驗證品質。

這是基於本遊戲程式碼的設計建議，不是已套用的功能，也不代表直接搬入上游即可取得上述保證。

## 已落實的第一版 Harness

以下為後續實作更新，取代上文提案中的「尚未實作」狀態：

- `server/harness-request.ts`：持久 requestId、輸入摘要、同請求合併、完成結果重播、結果不明時拒絕自動重送。狀態提交與 request settlement 在同一 SQLite 交易。串流的觀察者斷線不取消已接手的工作。
- `server/harness-events.ts`：持久事件序號、單一 SSE、Last-Event-ID 補送、每玩家保留最近 10000 則事件，過舊游標要求快照同步。LINE 已移除固定輪詢；手動圖片仍保留工作結果查詢作為等待／復原機制。
- `server/tool-registry.ts`：生圖、知識讀取、主動 LINE 使用共用輸入／結果驗證與執行入口。角色／劇情輸出仍保留原有專門驗證器，避免削弱說話、旁白與選項規則。
- `server/model-runtime.ts`：聊天、劇情、知識、搜尋決策與生圖決策共用模型傳輸與錯誤分類；預設 32768 token 的可調估算預算，保留 system 與本次輸入、整組移除較舊工具交換，不自動重試外部請求。
- `server/memory-view.ts`：為模型挑選有來源 ID 的相關重要記憶；被移出近期區的原始紀錄另存玩家 SQLite，不随 prompt 裁減一起消失。這版使用確定性檢索／裁減，不宣稱已完成 LLM 語意摘要，也不把估算當作模型官方 tokenizer。
- 新增 `tests/harness.test.ts`，涵蓋去重、衝突、重啟結果不明、原子提交、讀檔隔離、事件重播、串流斷線、工具關閉及模型錯誤。

相容性：不帶 requestId 的舊客戶端仍可使用；新客戶端所有遊戲操作都帶 requestId。伺服器重啟後無法確認的遠端 SD 工作不會重送。既有存檔自動套用新增資料表。原始碼為依本專案需求自行實作，沒有搬入或啟動 dsh runtime。

仍未宣稱完成：官方 Harness 的完整插件樹、模型精確 tokenizer、LLM 語意摘要或外部 SD 跨程序恰好一次。測試見 `tests/harness.test.ts`；新功能應先確認其 request settlement、事件補送與資料保存是否真的沿用這些契約，不能只引用本研究文中的建議。
