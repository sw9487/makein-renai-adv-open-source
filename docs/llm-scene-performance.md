# 動態事件演出

遊戲入口目前要求先設定可用的 LLM API；`/api/ai-status` 會先檢查模型清單，沒有「略過 AI 繼續玩」的正式流程。相遇、主線事件、上課遭遇、回家日常及選擇後回應使用 `present_scene` 生成當次敘述與具體回應文字。提示包含即時角色身分、日期、地點與校曆狀態、好感、共同記憶、可用補充知識及上一段場景；啟用 Web Search 時可按需查詢。

日常可創作不同小事；主線保留既有事件事實與後果。選項依原索引保留好感變動、旗標、回應約束及聆聽意圖，只讓模型設計當下的具體表達。模型不能直接寫存檔、跳日期或修改路線。

聆聽選項要求第一行是該角色真正說出口的台詞，且不能用概述代替對話。不額外產生選項；玩家可繼續自由聊天。角色聊天原有的偶爾提供選項與冷卻規則維持原樣。

21 位內建角色各有原始 `normal` 及 9 張去背 PNG 表情立繪：`happy`、`angry`、`sad`、`surprised`、`shy`、`suspicious`、`crying`、`enduring`、`cold`。檔案登錄於 `content/game.json` 的角色 `sprites`，實體檔案在 `content/assets/`。面對面對話的 `present_character_reply`／`present_character_choices` 與動態場景的 `present_scene` 會把角色實際配置的表情作為可選 enum 交給模型；模型選出的 `expression` 與台詞一起存檔並切換立繪。LINE 不展示立繪，僅提供 `normal`。舊存檔若仍使用內建原始立繪，載入時會補上新表情；已自行更換的立繪或表情不覆寫。轉場會預載將顯示的立繪後再淡入。

LINE 與面對面自由聊天的角色回應可帶 0～3 個有序 `actions`，目前支援 `twitter_follow`、`twitter_unfollow`、`twitter_post`、`line_message`。它們由 `server/character-actions.ts` 逐一執行並沿用 Twitter 的私密追蹤請求／封鎖規則；說出口的台詞不等於已執行操作。整個對話先在複製的遊戲狀態處理，任一動作無效就不提交本回合。禁用社群 App 時，對應動作不暴露給模型，也不得執行。舊版單則 `twitterPost` 欄位仍可讀取，避免相容模型的結果失效。

場景生成成功後才連同遊戲操作一起提交。工具格式錯誤、服務失敗或取消會保留原進度，重試要重新執行相應 API 而不是重播舊失敗。生成結果儲存在對話內，重新整理與讀檔不會重抽；Editor 修改原事件後才恢復新的原稿。按下「開始新故事」即進入淡出，等待 API 的黑屏會顯示 loading；選擇三選一後選項立即消失，不等下一頁生成完成。

測試使用模擬 API，驗證主動開場、情境工具 payload、選項後果保留、禁止額外選項及導航不觸發生成。主要實作在 `server/game-api.ts`、`server/chat.ts`、`core/navigation.ts`；回歸測試見 `tests/scene.test.ts`、`tests/navigation.test.ts`、`tests/scene-time.test.ts`。文字品質仍取決於使用者所選模型；結構驗證不能保證所有敘事細節都符合原作。
