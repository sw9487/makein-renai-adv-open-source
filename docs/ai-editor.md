# LLM 設定、遊戲入口與 Editor 翻譯

LLM 不是選用外掛。劇情、選項、角色對話、LINE、Twitter 與多項圖片決策共用玩家設定的 OpenAI 相容 Chat Completions 服務。API URL、Key、模型可由環境變數提供，但 Editor 已儲存設定優先；金鑰只留在伺服器。

## 驗證分兩層

1. 遊戲入口及 Editor 就緒狀態：`server/ai-status.ts` 把設定 URL 換算為 `/v1/models`，確認回應清單含目前模型。不成功時不可略過進遊戲；Editor「返回遊戲」及四區一鍵翻譯按鈕停用，並顯示設定方向。這是連線／模型存在檢查，不重新測 VLM。
2. Editor「儲存 AI 設定」：`server/editor-api.ts` 以 `web/public/assets/check img.png` 作一則多模態請求，要求模型用 `report_gender` tool call 回答圖片性別；只有回傳 `girl` 才保存。使用者應選同時支援圖片辨識與 tool call 的模型。更新 URL、Key 或模型後需要重新儲存驗證。

入口分別在 `web/components/game-entry.tsx`、`web/components/editor.tsx`，狀態端點為 `GET /api/ai-status`。不要把 `/v1/models` 成功誤寫成已驗證圖片或工具能力；也不要把昂貴的圖像測試放進每次進遊戲檢查。

## Editor 一鍵翻譯

人物設定、場景與相遇、事件劇本、素材書庫各有一鍵翻譯。前端 `translationFields` 按 JSON 路徑列出可翻文字，一個欄位一則 `translate-field` API 請求，以有限 worker 併發；伺服器限制 section／path／語言，用 `translate_field` tool call 回傳同一路徑的單一翻譯。不得讓模型重組整份 JSON、改 ID 或遺漏欄位。

翻譯中有已完成／總數、百分比和進度條；封鎖離開 Editor、切語言、切頁及改 AI 設定。前端先在內容副本上收集結果，全部完成才套用並標成待儲存；失敗不得留下半套內容。支援的目標語言以 `server/editor-api.ts` 的允許清單為準。回歸測試：`tests/ai-status.test.ts`、`tests/editor-ai.test.ts`、`tests/i18n.test.ts`。

外部模型能力、翻譯忠實度與命名慣例並非僅靠 schema 能保證；需要抽樣人工檢視長文字及帶占位符的欄位。
