# LINE：訊息、已讀與跨平台反應

**语言导航 / Languages / 言語:** [繁體中文](line.md) · [English](../en/line.md) · [日本語](../ja/line.md)


遊戲內 LINE 不連接真實通訊服務。角色聯絡門檻由人物設定決定；交換成功後可排一則符合角色風格的初次問候。LINE、當面對話和 Twitter 可互相提供情境，但每次行動都要保留真正的說話者、平台、日期與來源，不能把某角色推文錯當玩家說過的話。

## 訊息與已讀

訊息保存在 `GameState.messages[characterId]`；使用 `id`、`from`、`date`、`phase`、可選圖片與 `readByPlayerAt`／`readByCharacterAt`。玩家打開該對話時，前端提交 `line-read`，後端標記該角色尚未讀過的訊息；玩家發出的訊息在角色讀後才顯示「已讀」。未讀提醒計算在 `core/line-inbox.ts`；前端的已開啟位置也存於 localStorage。

角色是否回應由模型與情境決定，已讀不等於必須回覆。`conversationClosed` 和 `expectsReply` 協助區分自然結束的對話與仍在等待答覆的訊息。主動 LINE 可以感知玩家未讀或已讀未回，但不能把晚安、告別等已完結對話硬判成冷落。主動工作與首訊在 `server/proactive-line.ts`；一般訊息生成在 `server/chat.ts`。

## 圖片、約會與重試

啟用 SD 後，角色可依情境用人物、無人物物件或風景圖片工具傳圖；成功結果和文字一同持久化，失敗不可宣稱圖片已送達。詳細模型標籤及佇列見 [Stable Diffusion](stable-diffusion.md)。

玩家可在遊戲設定停用 LINE。關閉後隱藏入口、交換 LINE 及約會邀請，伺服器拒絕 LINE 聊天／已讀／邀請並略過主動訊息與初次問候；Twitter 的私下轉 LINE 工具也不提供。舊存檔預設保持開啟，切換偏好在新故事與讀檔後維持。

約會邀請會先建立玩家訊息並顯示於 LINE，再等待角色回覆；回覆完成後才顯示對方訊息及確認前往地點。選同一地點也應走正常轉場。失敗的 LINE／對話重試是新的 API 嘗試，不是重播先前失敗的 requestId，見 `core/navigation.ts::freshRetryAction`。

角色可以因 LINE 衝突或其他有意義的互動發 Twitter 貼文；Twitter 情境也可觸發私下 LINE。這些副作用仍受聯絡權限、封鎖、runId 與狀態提交檢查約束。測試：`tests/line.test.ts`、`tests/proactive-line.test.ts`、`tests/social-bridge.test.ts`、`tests/date.test.ts`。
