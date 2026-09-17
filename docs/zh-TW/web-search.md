# Web Search 與 AI 知識建立

**语言导航 / Languages / 言語:** [繁體中文](web-search.md) · [English](../en/web-search.md) · [日本語](../ja/web-search.md)


Editor → 系統設定 → Web Search，選 SerpAPI 或 Brave Search，輸入對應金鑰並獨立儲存。啟用缺少金鑰會顯示站內 Dialog，後端也拒絕。兩種 provider 分開保留金鑰，不回傳至 UI。

啟用「遊戲回覆 · 允許按需搜尋」後，劇情／角色對話、LINE 和 Twitter 發文／回覆可在需要外部知識時按需查詢；一般寒暄可不搜尋。決策最多呼叫一次 `web_search`。最多5筆結果，每筆摘要650字元，不抓取整頁。搜尋摘要是不可信資料，不能覆寫角色或工具規則，也不直接進入長期記憶。關閉時沒有搜尋請求；失敗時不得聲稱已查證。實作入口為 `server/web-search.ts`、`server/chat.ts`、`server/twitter.ts`。

補充知識 → AI 建立知識，可輸入主題與方向。搜尋勾選只在已啟用且所選 provider 有金鑰時可用，後端重驗。勾選後以主題搜尋，將結果交給生成模型。最多10個文字檔、單次4500輸出 tokens／45秒。生成檔案須位於同一資料夾、包含有效 KNOWLEDGE.md；同名拒絕覆寫。所有文字仍受知識容量與路徑限制。

搜尋提供摘要而非全文核讀；生成內容仍需使用者檢閱。補充知識是獨立的本機參考庫，不要求啟用網路搜尋，詳見 [補充知識](game-knowledge.md)。`tests/web-search.test.ts` 使用模擬 provider 與模型，不會動用使用者金鑰；需要實際查證時應明確使用隔離環境。

API 依據：[Brave Web Search](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)、[SerpAPI Search API](https://serpapi.com/search-api)。
