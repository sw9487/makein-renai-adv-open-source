# 原作題材劇情包：第1～3卷

**语言导航 / Languages / 言語:** [繁體中文](canon-story-pack.md) · [English](../en/canon-story-pack.md) · [日本語](../ja/canon-story-pack.md)


這是 `core/canon-events.ts` 的 10 個導入事件規格，與第4～9卷小說導入、[主線續寫](mainline-continuation.md) 並存；本文件不是目前全遊戲事件數量清單。

新增10個 `canon-inspired` 事件、30個選項與10張官方公開場面圖。原作情節以動畫官方各話梗概核對；下表標題、對話、玩家選擇及回應均為本遊戲同人改寫，不是小說逐字摘錄。圖片為同集代表場面，並非每句台詞的逐格重現。

出版社資料：[第2卷](https://gagagabunko.jp/lineup/202111.html)、[第3卷](https://gagagabunko.jp/lineup/202204.html)。第2卷為暑假後半的檸檬篇，第3卷涉及10月石蕗祭與社團交接。表內月份、地圖入口和11月報告練習為配合既有遊戲行事曆的安排，非原作確定日期；部分入口通往事件內描述的其他地點。

|事件|高一月份|地圖入口|前置事件|官方核對來源|
|---|---|---|---|---|
|保健室裡，沒說出口的名字|7|學校操場|開場八奈見事件|[第2話](https://makeine-anime.com/story/?id=ep02)|
|合宿前，先交出一頁故事|7|文藝社社辦|開場八奈見事件|[第3話](https://makeine-anime.com/story/?id=ep03)|
|非常階梯上的交往傳聞|7|教室|合宿前，先交出一頁故事|[第4話](https://makeine-anime.com/story/?id=ep04)|
|咖啡店外，第三個人的疑問|8|家庭餐廳|開場八奈見事件|[第5話](https://makeine-anime.com/story/?id=ep05)|
|星象館散場後的距離|8|綜合動植物公園|咖啡店外，第三個人的疑問|[第6話](https://makeine-anime.com/story/?id=ep06)|
|夜裡的校庭，留給她自己的話|8|學校操場|星象館散場後的距離|[第7話](https://makeine-anime.com/story/?id=ep07)|
|下一任部長與校慶企劃|10|文藝社社辦|開場八奈見事件|[第8話](https://makeine-anime.com/story/?id=ep08)|
|圖書館回程，抱緊的展示稿|10|精文館書店|下一任部長與校慶企劃|[第9話](https://makeine-anime.com/story/?id=ep09)|
|石蕗祭，一起離開攤位片刻|10|文藝社社辦|圖書館回程，抱緊的展示稿|[第10話](https://makeine-anime.com/story/?id=ep10)|
|動植物公園裡的報告練習|11|綜合動植物公園|石蕗祭，一起離開攤位片刻|[第11話](https://makeine-anime.com/story/?id=ep11)|

## 檔案與更新

- `core/canon-events.ts`：劇情與一次性新增邏輯；`core/story.ts::upgradeStories` 由 `core/content.ts` 載入時呼叫。
- `content/game.json`：正式預設內容快照，已加入相同事件。
- `content/canon-stills.json`：每張圖的官方頁面、原圖網址與本機路徑。
- `content/assets/cg/00000000-0000-4000-8000-000000000302.jpg` 至 `00000000-0000-4000-8000-000000000311.jpg`：未修改的官方公開場面圖。
- `scripts/fetch-canon-stills.ts`：依已核對的場面序號重新下載圖片。

舊內容首次讀取時加入劇情包並附上 `storyPacks` 標記；editor 儲存後保留標記，後續不再補回作者刪除的事件。既有事件的文字、圖片與玩家存檔不會被覆蓋。高一月份已過的存檔不會倒轉日期；可從較早存檔或新故事體驗對應事件。

每個事件限高一、不可重複，需先完成前置選項。可觸發時地圖副標題顯示原作事件名稱；校內事件沿用週末校舍不開放規則。選擇後使用既有好感、記憶與相冊流程。

## 驗證

`tests/canon-events.test.ts` 逐一以遊戲引擎走過10個事件，驗證觸發順序、選擇完成、相冊解鎖、學年限制及本機圖片；另驗證一次性更新、editor 刪改與匯出後資料保留。
