# 遊戲補充知識 harness

補充知識頁可新增、編輯、匯入文字資料夾、啟用與停用。開發模式存於專案 `knowledge/`；執行時存於遊戲資料目錄 `knowledge/`。此資料獨立於還原內容預設值，不會隨事件重設而消失。

採用 https://agentskills.io/specification 的 YAML frontmatter 與資料夾慣例：

```text
my-knowledge/
  KNOWLEDGE.md
  references/background.md
  references/details.md
```

KNOWLEDGE.md 必填 name、description，name 與資料夾一致；主檔只放檢索描述與正文索引。完整知識依主題存入 references/*.md，包括背景、定義、細節、例子與未查證事項。references 存放內容，不放來源清單或外部網址。此版本為文字參考型 runtime，不執行程式、不讀取二進位圖片/PDF。

聊天、LINE、事件、選項演出與 Twitter 動態共用按需檢索；Twitter 回覆和配圖決策也可使用。先傳最多40份名稱與每份180字描述，模型透過單輪 `read_knowledge` 選取條目，可同時選取多個。系統自動載入各條目的主檔與正文，解析中繼資料與 JSON/YAML 格式，以可讀文字注入回應模型。載入時不依標題、檔名或欄位名稱刪除正文；由回應模型依語意選用事實，忽略來源清單、索引與無關雜訊。每檔最多4000字元，總參考本文預算12000字元；檢索輸出限制300 tokens。此為字元預算，不等同精確 tokenizer 計數。

AI 建立知識必須產生索引與至少一個正文檔，最多10檔。LLM 在提交前依語意逐段審閱，自行剔除來源說明、外部網址與雜訊，保留知識細節與不確定性。程式只驗證結構並根據實際正文檔建立索引，不依標題、關鍵字或檔名刪改正文，也不另存搜尋結果。Web Search 僅提供整理線索，不能把摘要當成全文查證；不確定資訊直接標在正文。缺少正文、正文超長或模型輸出截斷時不儲存。

知識內容僅加入當次生成，不寫入長期聊天記憶。沒有知識不會發出額外模型請求。檢索失敗降級為原有生成。所有路徑限定在 knowledge 根目錄，拒絕穿越及符號連結；API 沿用 Editor 認證及同源限制。工具不授予執行程式、網路、資料庫或秘密讀取權限。文件為不可信參考，不能覆寫角色、遊戲規則與輸出結構。

容量限制：40 知識、單次100檔、單檔64KB、總文字1MB。UI 上傳文字檔；磁碟直接修改後可重新掃描。修改與停用在下次生成生效。

主要程式：`server/knowledge.ts`、`server/knowledge-tree.ts`、`server/knowledge-generate.ts`；回歸測試：`tests/knowledge.test.ts`、`tests/knowledge-tree.test.ts`、`tests/knowledge-generate.test.ts`。上述檢索是可選的額外模型請求；失敗時繼續原本的對話或貼文流程，而不是宣稱已引用知識。
