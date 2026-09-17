# Stable Diffusion の選定プラグイン

**言語:** [繁體中文](../zh-TW/stable-diffusion.md) · [English](../en/stable-diffusion.md) · [日本語](stable-diffusion.md)

Editor → システム設定の Stable Diffusion カードで有効化します。既定ではオフで、起動時に接続したり生図サービスを要求したりしません。

ローカルまたはオンラインの **AUTOMATIC1111 互換 API** のルート URL を設定します。完全な `/sdapi/v1/txt2img` パスを記入することもできます。リバースプロキシのパスプレフィックスと任意の Bearer API Key に対応します。サードパーティは同じリクエスト／レスポンス形式を提供する必要があります。他のベンダーの独自 API はアダプターが必要です。ローカル WebUI は `--api` で起動する必要があり、ゲームが WebUI を代わりに起動することはありません。

`.env` の `SD_ENABLED=false`、`SD_AUTO_STORY=false`、`SD_API_URL`、`SD_API_KEY` も利用できます。Editor で保存した設定が優先され、変更後は次の操作から有効になります。環境変数は再起動が必要です。キーは空欄のまま保持されるため、「保存済みキーをクリア」を押して保存すると削除でき、ゲームページには返されません。

有効化すると、手動モードではストーリー画面に「ストーリー画像を生成」が表示されます。自動モードでは、ストーリー操作や対面会話の後、LLM が `generate_image` を呼ぶかどうかを判断します。LINE は会話の意図、キャラクターの性格、好感度、記憶に応じて写真を送るかどうかを判断でき、送らないこともできます。文字キーワードによるトリガーではありません。LINE の判断と生図結果は元のキャラクター応答フローに委ねられ、成功後は写真がメッセージとともに保存されます。

画像ツールは `generate_image`（人物と合法キャラクター LoRA）、`generate_object_image`（人物なし物体）、`generate_scene_image`（人物なし風景／場所）に分かれます。物体と風景はそれぞれの正負構図タグを補完し、人物 LoRA を除外します。LINE と Twitter の新規投稿は適用可能なタイプを使用できますが、Twitter の返信には一切配図ツールを提供しません。判断、タグのクリーンアップ、最終検証は `server/stable-diffusion.ts`、`server/image-art-direction.ts`、`server/twitter.ts` にあり、prompt で何らかの能力を無効化したと主張するだけでは不十分です。

生図設定では **Illustrious／Pony** を選択し、一致する checkpoint の完全名を入力する必要があります。タイプを切り替えると checkpoint がクリアされ、キャラクターガイドと推奨パラメータがリセットされます。保存後は手動、自動ストーリー CG、LINE に適用されます。タイプを指定していない旧設定は Illustrious に移行し、新版ガイドとパラメータを適用し、サービス接続設定を保持します。

| タイプ | 推奨モデル | LoRA ZIP | インストール場所 |
| --- | --- | --- | --- |
| Illustrious | [Nova Anime XL 指定バージョン](https://civitai.com/models/376130/nova-anime-xl?modelVersionId=2940478) | [ダウンロード](https://drive.google.com/file/d/12ZHjS8oQO713GPZcgMWFlRPznA0sLkdT/view?usp=sharing) | `models/Lora/Illustrious/` |
| Pony | [Zuki Clean Anime Mix](https://civitai.com/models/880541/zuki-clean-anime-mix) | [ダウンロード](https://drive.google.com/file/d/1cigyuhvk15DhxPyDLSlp8abTpxA6sQIr/view?usp=sharing) | `models/Lora/Pony/` |

ZIP を解凍したらキャラクターのサブフォルダとファイル名を保持します。既に Lora／タイプフォルダがある場合は同名ディレクトリをマージします。ゲームは `/sdapi/v1/loras` から実際の名前を読み取り、指定したタイプフォルダ内の LoRA だけを選択できます。両タイプに同名ファイルがある場合は、タイププレフィックスを付けてリネームしてから WebUI をリロードし、WebUI が誤った LoRA を読み込まないようにします。サードパーティ API も、`name`、`path` を含むこの一覧を提供する必要があります。

| タイプ | Steps | CFG | Clip skip | Hires 倍率 | Denoising |
| --- | --- | --- | --- | --- | --- |
| Illustrious | 25 | 5 | 2 | 2 | 0.7 |
| Pony | 30 | 6 | 2 | 1.5 | 0.45 |

どちらも既定で Euler a、Automatic scheduler を使用し、Hires.fix を有効にして R-ESRGAN 4x+ Anime6B を使用します。Hires steps 0 はメインのサンプリングステップ数を引き継ぐことを意味します。Illustrious は文書の 20–30 steps、CFG 4–6、Clip skip 1–2、Denoising 0.65–0.8 から既定を選びます。Pony は文書の 30 steps、CFG 6、1.5–2 倍、Denoising 0.4–0.5 を使用します。Pony 文書は sampler、scheduler、clip skip、upscaler を指定していないため、これらは調整可能なプロジェクト既定です。

`core/sd-profiles.ts` には 2 つのモデル文書の正負ベースとそれぞれのキャラクタートリガーワードが組み込まれており、`bun scripts/update-sd-profiles.mjs` で更新され、デプロイに Markdown の読み取りは不要です。Illustrious は文書の masterpiece／quality タグと BREAK のライティング接尾辞を使用します。Pony は `score_9, score_8_up, score_7_up, source_anime`、負面は対応する文書の score_6／5／4 などのタグを使用します。サーバーは LLM の重複またはモデルをまたぐ品質プレフィックスを除去し、選択したモデルベースを適用します。華恋、天愛星、和彦などのキャラクターのモデル専用トリガーワードはガイドに応じて切り替わります。UI は正負ベースをプレビューし、推奨パラメータとガイドを再適用できます。

プロンプト規則は `server/image-art-direction.ts` にあります。LLM は選択モデルのガイドに従い、コンマ区切りの英語タグとキャラクター／衣装トリガーワードを生成します。口語的な文章は使わず、最低文字数も設定しません。シーンは人物、外見衣装、動作表情、単一カメラアングル、環境、光の順にタグを選びます。構図指示は SD prompt にコピーすべきではありません。

今回のパラメータとキャラクターガイドは、ルートの `Illustrious - makein-renai-stable-diffusion.md` と `Pony - makein-renai-stable-diffusion.md` に基づいています。実際の checkpoint による固定 seed での画像比較はまだ行っていません。

ストーリー CG は物語的な動作、背景の奥行き、下部会話ボックスの余白を重視します。LINE 画像は自然な生活写真の構図を取りますが、2D イラストスタイルを維持し、チャットインターフェースは描画しません。プロンプトの変更は新規生成画像にのみ影響します。実際の画質は、使用中の checkpoint と LoRA の生成結果で確認する必要があります。

バックエンドが LLM 呼び出しと生図転送を担当し、ブラウザは上流キーに直接触れません。1 回に最大 1 枚、同時に最大 1 つの生図リクエストです。画像は既存の素材保存に入り、`/api/media/` で提供されます。ストーリー画像はセーブとともに、LINE 画像はメッセージとともに保持されます。サービスオフラインまたは形式エラー時は画像未完了のヒントだけを表示し、テキストストーリーや会話の送信を妨げません。

手動生図はバックエンドの作業を使用し、完了かサービス失敗が報告されるまでフロントエンドが継続的にクエリします。SD 生成の時間上限は設けません。生成中は現在のストーリー段階を終了したり生図を重複送信したりできませんが、既存の会話テキストは閲覧でき、LINE は独立してメッセージを送信できます。更新で待機を引き継ぎ、クエリが一時的に切断されても作業はキャンセルされません。画像の更新で場面転換を再生し直したり、読了ページやタイプライターの進捗をリセットしたりしません。作業追跡には依然プログラム内状態があり、メインプロジェクトを再起動するとその作業が中断される可能性があるため、生成中は再起動を避けてください。

Twitter の画像付きメイン投稿は、まず配図待ち状態を作成し、作成者にだけ表示します。画像完成後にのみ他者へ公開されます。失敗または中断時はテキストを保持し、元投稿で「配図をリトライ」を押すと、NPC 返信を強制再生成することなく同じ投稿を更新します。配図作業中は返信、いいね、リポストがその投稿を操作できません。回帰テストは `tests/stable-diffusion.test.ts` と `tests/twitter.test.ts` にあります。

SD が `NansException` を報告した場合、それは画像生成成功ではなく、モデル計算が無効な数値を生成したことを意味します。まず SD の「Upcast cross attention layer to float32」を有効にし、それでも失敗する場合は `--api --no-half` で起動してください。NaN チェックを無効にして計算問題の修正を回避しないでください。