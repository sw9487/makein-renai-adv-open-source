# LLM 設定、ゲーム入口と Editor 翻訳

**言語:** [繁體中文](../zh-TW/ai-editor.md) · [English](../en/ai-editor.md) · [日本語](ai-editor.md)

LLM は選択式のプラグインではない。ストーリー、選択肢、キャラクター会話、LINE、Twitter、および複数の画像判断は、プレイヤーが設定した OpenAI 互換の Chat Completions サービスを共有する。API URL、Key、モデルは環境変数で提供できるが、Editor に保存された設定が優先される。キーはサーバーにのみ残る。

## 検証は二層

1. ゲーム入口と Editor の準備状態：`server/ai-status.ts` は設定された URL を `/v1/models` に置き換え、応答リストに現在のモデルが含まれることを確認する。成功しなければゲームを省略して進めない。Editor の「ゲームに戻る」と四つの一括翻訳ボタンは無効化され、設定の方向を示す。これは接続／モデル存在の確認であり、VLM を再テストしない。
2. Editor の「AI 設定を保存」：`server/editor-api.ts` は `web/public/assets/check img.png` を一件のマルチモーダルリクエストとして使用し、モデルに `report_gender` tool call で画像の性別を答えるよう要求する。`girl` を返した場合のみ保存する。ユーザーは画像認識と tool call を同時にサポートするモデルを選ぶべきである。URL、Key、またはモデルを更新した後は、再保存の検証が必要である。

入口はそれぞれ `web/components/game-entry.tsx`、`web/components/editor.tsx` にあり、状態エンドポイントは `GET /api/ai-status` である。`/v1/models` の成功を、画像やツール機能を検証済みとして誤って書いてはならない。高価な画像テストを毎回のゲーム入口チェックに入れてはならない。

## Editor 一括翻訳

人物設定、シーンと出会い、イベント台本、素材ライブラリにはそれぞれ一括翻訳がある。フロントエンドの `translationFields` は JSON パスで翻訳対象のテキストを列挙し、一フィールドごとに一つの `translate-field` API リクエストを、限定された worker 並行で送る。サーバーは section／path／言語を制限し、`translate_field` tool call で同一パスの一つの翻訳を返す。モデルが JSON 全体を再構成したり、ID を変更したり、フィールドを欠落させたりしてはならない。

翻訳中は完了／総数、パーセンテージと進捗バーが表示され、Editor の離脱、言語切り替え、ページ切り替え、AI 設定の変更がブロックされる。フロントエンドはまず内容のコピー上で結果を収集し、全て完了してから適用し、保存待ちと標示する。失敗時に半分だけの内容を残してはならない。サポートされる対象言語は `server/editor-api.ts` の許可リストに従う。回帰テスト：`tests/ai-status.test.ts`、`tests/editor-ai.test.ts`、`tests/i18n.test.ts`。

外部モデルの能力、翻訳の忠実度、命名の慣習は schema だけでは保証できない。長いテキストとプレースホルダーを含むフィールドをサンプリングして人手で確認する必要がある。