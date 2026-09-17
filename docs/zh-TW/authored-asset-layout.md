# 內建圖片目錄

**语言导航 / Languages / 言語:** [繁體中文](authored-asset-layout.md) · [English](../en/authored-asset-layout.md) · [日本語](../ja/authored-asset-layout.md)


`content/assets/` 只放遊戲正式內建圖片；玩家上傳與測試生成圖片仍留在使用者資料目錄，不會因為這個分類而自動進入 GitHub 原始碼。

| 子目錄 | 用途 |
| --- | --- |
| `sprites/<角色 ID>/` | 該角色原圖與所有表情立繪；`archive/` 存保留但不引用的舊肖像 |
| `avatars/<角色 ID>/` | 人物頭像；與立繪共用來源時也保有獨立副本 |
| `backgrounds/` | 遊戲地點與場景背景，含預載用 JPG |
| `cg/` | 劇情事件 CG 與官方場面圖 |
| `books/` | 素材書庫的書籍封面 |
| `covers/` | 若作者素材放在此處，供社群帳號橫幅使用 |
| `misc/` | 尚無專屬類別的正式圖片 |

在 `content/game.json` 等設定中，圖片網址須保留分類路徑，例如 `/assets/authored/sprites/tamaki/tamaki-smug-expression.png`。本機伺服器與建置流程都依這個相對路徑尋找圖片。新增作者素材時，不要再只存放於 `content/assets/` 根目錄。

立繪的透明畫布與顯示尺寸分開處理：圖檔保留完整肢體；遊戲依可見像素對齊頭部，對畫布佔比過低的全身姿勢再校正可見身高。檢查既有圖檔尺寸可用 `python scripts/normalize-expression-sizes.py --check`。
