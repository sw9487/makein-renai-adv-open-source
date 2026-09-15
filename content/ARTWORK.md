# 圖片來源與處理

所有立繪、頭像、場景及事件圖片只保存在 `content/assets/`。本機服務和 npm 套件直接讀取這個目錄，建置不再複製到 dist。`/assets/authored/` 是 HTTP 路由名稱，不是第二個實體資料夾。作者模式上傳圖片直接寫入同一目錄；一般安裝玩家的私人上傳存於其本機資料目錄。

## 水島小春

- 使用者指定來源：https://x.com/Shinianjun00/status/2066812229333471255
- 原始圖片：https://pbs.twimg.com/media/HK7KqurbgAEerdi.jpg
- 本機：`content/assets/sprites/koharu/00000000-0000-4000-8000-000000000025.png`
- 使用目前專案的 1697 × 2400 PNG，以 SVG 顯示裁切與多邊形遮罩保留左側彩色人物，排除右側黑白草圖；頭像獨立取臉部。
- 此為使用者指定的作者作品，不標為原作官方設定圖。

## 櫻井弘人

- 來源：使用者提供的動畫截圖，中央穿紅色背心的男子。
- 本機：`content/assets/sprites/hiroto/00000000-0000-4000-8000-000000000026.png`
- 使用內建 imagegen 編輯，移除其他角色與室內背景，補繪被遮住的部分。最終為白底，並非透明背景或逐像素裁切。角色臉部、紅棕髮、紅背心、灰長褲及原構圖作為保留目標。
- Prompt 1：Extract only the central Hiroto Sakurai from the user-attached anime screenshot; preserve face, hair, clothes, expression and pose; remove other people and room; restore only occluded body portions; do not invent shoes; request transparent background.
- 第一次輸出將棋盤格畫入背景，因此未採用。
- Prompt 2：Preserve the isolated boy and composition; replace the entire checkerboard with flat pure white #ffffff; no checkerboard, texture, shadows or gradients; do not add feet or change clothing.
- 此為 AI 輔助衍生素材，不標為未修改的官方立繪。

## 其他角色

- 動畫角色原圖：https://makeine-anime.com/character/
- 玉木慎太郎：官方全身 `img_main07.png`，頭像 `thumb_chara06_on.png`。
- 月之木古都：官方全身 `img_main06.png`，頭像 `thumb_chara07_on.png`。官方兩種圖片的編號順序不同。
- 白玉莉子：`00000000-0000-4000-8000-000000000021.jpg`，來源見角色 `source`。
- 橘聰：`00000000-0000-4000-8000-000000000023.png`，第5卷插圖局部，來源見角色 `source`。

角色圖片的出處、處理方式、裁切座標均隨遊戲內容一起保存，可在 editor 調整。

## 場景及事件 CG

內建 imagegen 生成 9 張場景背景（檔名尾碼 101–109）、1 張校內備用背景（111）及 6 張事件情境插圖（201–206），分別存於 `content/assets/backgrounds/` 與 `content/assets/cg/`。生成內容為原創日式校園 ADV 環境圖，不是官方截圖、精確實景重建或小說插圖。

9 個場景都有背景；30 個事件依內容使用上述插圖或場景圖，相近事件共用，並非 30 張獨立人物 CG。對應表在 `core/scene-assets.ts`，每張圖片可在 editor 單獨更換。Prompt 記錄見 `content/SCENE-PROMPTS.json`；共同要求為 16:9、手繪動畫背景風格、無人物、無拼圖。
