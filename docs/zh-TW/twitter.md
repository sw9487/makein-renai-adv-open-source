# 遊戲內 Twitter：開發契約

**语言导航 / Languages / 言語:** [繁體中文](twitter.md) · [English](../en/twitter.md) · [日本語](../ja/twitter.md)


這是本機遊戲中的虛構社群，不連接真實 Twitter。實作入口是 `core/twitter.ts`、`core/twitter-public.ts`、`server/twitter.ts`、`web/components/twitter-panel.tsx`。

## API 與存檔

- `GET /api/twitter` 依玩家權限回傳帳號、貼文和通知，也會修復並接續本時段工作。`POST /api/twitter` 接收玩家貼文、回覆、引用、按讚、直接轉發、追蹤／取消、請求審核、封鎖／解除、刪文及配圖重試。`PATCH /api/twitter` 更新玩家公開／私人狀態和 NPC 同串互動上限。
- POST 需要目前 `runId`、UUID `requestId`；相同請求重送不重複執行，ID 對應不同內容則拒絕。讀檔會換 runId。原始社群狀態在 `GameState.twitter`；一般 game API／串流剝除原始社群資料，只有專用端點回傳 `twitterView` 過濾結果。
- `TwitterState` 保存 `accounts`、`following`、`requests`、`blocks`、`posts`、`jobs`、`notices`、`operations` 等。新故事重建狀態；舊工作結果不可寫入新 run。

## 帳號、上線與工作

角色 handle、私密性、上線頻率、主動回追、私人帳號同意門檻在人物設定。新進度預設佳樹為 LINE 聯絡人及 Twitter 雙向追蹤；之後取消不會自動恢復。NPC 每時段按上線率抽樣，盡量補足 6 位可用角色、其中 4 位玩家已認識者；離線時不即時回覆，上線後可透過 catch-up 檢視舊串。

公眾帳號存於 `Content.publicAccounts`，舊內容由 `core/twitter-public.ts::defaultPublicAccounts` 補齊；一律公開、藍勾勾、持續在線，但不是每時段必定發文，也不回追。Editor「人物設定 → 公眾帳號」可新增帳號、設定頭像／Twitter 橫幅、簡介、身分 Prompt，並獨立啟用能力模組及編寫其 Prompt；一鍵翻譯只翻姓名、簡介及 Prompt，不改 ID、handle 或圖片。角色交友、發文、反應與補看工作保存於存檔，提交時核對日期、run 與當前狀態，避免舊結果覆蓋新進度。

遊戲設定可分別關閉 LINE 與 Twitter，預設均開啟；`core/social-apps.ts` 對舊存檔提供開啟預設。Twitter 關閉時，首頁按鈕、輪詢、API 操作、發文工具與排程均停用，執行中的舊決策亦不得提交；重新開啟後才恢復。切換設定在新故事及讀檔後維持。

「每時段 NPC 之間在同一則推文中最多互動次數」按根貼文隔離，預設 3、範圍 0–20。玩家互動、發新文、新留言第一次反應、舊串補看、交友及 idle 不消耗此額度；額度耗盡不代表角色離線。

## 可見性與關係

- 私人帳號的普通主文只給作者、已同意追蹤者或直接被該文 `@` 的帳號閱讀。私人帳號在公開主文下的回覆，按公開主串權限可見；不能把回覆者的私人設定錯套到整串。
- 封鎖移除雙向追蹤和待審請求，雙方不能讀取對方主文／留言或 `@` 對方。解除封鎖不會恢復追蹤。
- 私人追蹤先送請求，由目標接受或拒絕；玩家在通知頁審核。對公眾帳號可直接追蹤，不必先認識。角色也可以向其他角色或玩家送請求。
- 後端 `canReadPost` 沿回覆祖先檢查權限；`twitterView` 再套用玩家的已認識／追蹤視圖。每次修改權限都要測主文、公開串下的私人回覆、直接提及及封鎖。

## 貼文、AI 與公眾行為

主文、回覆、引用分別以 `replyTo`／`quoteTo` 表達關係；直接轉發記在原文 `reposts`。回覆不能附圖。`@handle` 可提及未追蹤帳號（封鎖除外）。`#hashtag` 可搜尋與點選；趨勢依可讀貼文的新近程度、互動量和作者數排序。

玩家新文／回覆／引用經 LLM 工具確認文字；按讚、轉發、追蹤、封鎖等確定性操作不呼叫 LLM。NPC 的 `twitter_action` 可在一次決策中排最多三項有序動作，整組先驗證再提交。情境允許時可主動 LINE 私訊、對話後發文及變動好感。各公眾帳號的簡介和語氣在 `core/twitter-public.ts`；不要在遊戲內帳號內容提到作品、聖地地圖等幕後來源。

東愛知新聞社於白天取前一日晚間、中午取當日上午、晚間取當日中午的公開主文，用 `twitter_news_batch` 選 0–3 則，統一標題／內文／標籤，並驗證來源 ID。豊橋市役所可帶配文引用其他豊橋公眾帳號的公開主文。豊橋警察署巡查公開主文與留言，對危險內容回覆、勸導或警告；巡查不能封鎖來源。

自主發文排程分為 `promotion` 店家宣傳、`civic` 公共資訊、`advisory` 安全宣導、`municipal` 在地引用、`reporting` 新聞批次；`patrol` 另巡查公開討論。各能力讀取帳號的 `modules`，可搭配專屬 Prompt，停用某模組不影響其他模組。頻率規則在 `core/public-twitter-activity.ts`，各模組獨立提示與可用動作在 `server/twitter-public-strategies.ts`，不要把特殊策略併回單一通用抽籤函式。新聞工作在執行前重掃來源時段，短暫等待尚未完成的上一時段任務；來源包含所有可見的公開個人及公眾帳號主文，個人說法須註明來源。

## 配圖、UI 與通知

選擇回覆目標時只送文字候選；目標確定且含圖後，另一則請求只帶該目標的一張低細節圖片。`twitter_action` 沒有圖片能力，只有新圖文主貼文可用 `twitter_image_post`。SD 可產生人物、無人物物件或風景圖；回覆不提供附圖／生圖。

圖文貼文在配圖期間只讓作者看見佔位，其他帳號不能讀、按讚、轉發或回覆。完成後才公開並排程反應；失敗保留文字並可在同一則貼文重試配圖，不強制再觸發角色留言。

左側有首頁、探索、帳號、通知、我的頁面；我的頁面只顯示自己的主文。側欄「追蹤中」包含角色及公眾帳號。留言數包括巢狀回覆，排序提供最相關、最早、最多讚。輸入 Enter 送出、Shift+Enter 換行，提交期間按鈕轉圈且輸入框鎖定。取消追蹤和封鎖有確認。

通知頁可逐筆讀取或一鍵清除；玩家主動滑到相關貼文也會標已讀。未讀 token 供左側藍點與遊戲入口紅點使用；已讀記錄按 runId 存於瀏覽器 localStorage，社群事件本身存在遊戲狀態。

## 回歸驗證

新增公眾帳號優先使用 Editor：檢查穩定 ID／唯一 handle、自然的日文簡介與發文 Prompt、頭像、Twitter 橫幅及可用的官方來源連結；模組可分別配置，`promotion`／`civic`／`advisory` 決定自主發文，`patrol` 決定巡邏，`reporting` 決定新聞批次，`municipal` 決定引用分享。虛構帳號若沒有世界內官方來源，不要用動畫聖地地圖冒充店家來源。帳號 ID 進入存檔與貼文後不能任意換字；若必須更名，需設計舊存檔遷移並測試追蹤、封鎖、貼文、通知與提及。地點設定在 `core/official-places.ts`，與帳號資料分開維護。

遊戲地點背景使用 `/assets/places-official/`，公眾帳號橫幅使用 `/assets/twitter-official/covers/`；兩者是不同欄位和用途。舊內容若將封面誤存為地點背景，`twitter-official-places-v3` 升級會把內建七個店家地點及素材紀錄改為獨立生成的 ADV 場景圖；自訂背景不覆蓋。新增圖片時要檢查兩邊引用及檔案存在，不能把窄橫幅當成遊戲場景。

`tests/twitter.test.ts` 覆蓋權限、排程、工具、圖片、新聞、警察及跨平台反應；`tests/twitter-http.test.ts` 覆蓋 HTTP 和公眾帳號追蹤；`tests/twitter-ui.test.ts` 覆蓋介面契約。改動後執行 `bun run check`、`bun run test`、`bun run build`（`bun run test` 已內含 `--timeout=40000`，因 postgres.js 較慢）。真實模型診斷 `bun scripts/twitter-live-audit.ts --live` 需明確按需執行，不應把單次模型選擇寫成固定比例。
