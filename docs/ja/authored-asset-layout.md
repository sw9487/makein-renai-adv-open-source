# 内蔵画像ディレクトリ

**言語:** [繁體中文](../zh-TW/authored-asset-layout.md) · [English](../en/authored-asset-layout.md) · [日本語](authored-asset-layout.md)

`content/assets/` にはゲーム正式な内蔵画像だけを置きます。プレイヤーのアップロードやテスト生成画像は引き続きユーザーデータディレクトリに保存され、この分類によって自動的に GitHub ソースには入りません。

| サブディレクトリ | 用途 |
| --- | --- |
| `sprites/<キャラID>/` | そのキャラクターの原図とすべての表情イラスト。`archive/` には保持するが参照しない旧肖像を保存 |
| `avatars/<キャラID>/` | 人物アイコン。イラストと同一ソースを共有する場合も独立したコピーを保持 |
| `backgrounds/` | ゲームの場所・シーン背景。プリロード用 JPG を含む |
| `cg/` | ストーリーイベント CG と公式場面図 |
| `books/` | 素材書庫の書籍表紙 |
| `covers/` | 著者素材をここに置く場合、コミュニティアカウントのバナーに使用 |
| `misc/` | まだ専用カテゴリのない正式画像 |

`content/game.json` などの設定では、画像 URL にカテゴリパスを保持する必要があります。例：`/assets/authored/sprites/tamaki/tamaki-smug-expression.png`。ローカルサーバーとビルド処理はどちらもこの相対パスで画像を探します。著者素材を追加するときは、`content/assets/` ルート直下だけに置かないでください。

イラストの透明キャンバスと表示サイズは分けて扱います：画像ファイルは全身を保持し、ゲームは可視ピクセルに合わせて頭部を整列させ、キャンバスに占める割合が低すぎる全身ポーズについては可視の身長を再補正します。既存画像ファイルの寸法確認には `python scripts/normalize-expression-sizes.py --check` を使えます。