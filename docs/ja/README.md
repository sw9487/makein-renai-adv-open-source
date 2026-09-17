# 開発ドキュメント

**言語:** [繁體中文](../zh-TW/README.md) · [English](../en/README.md) · [日本語](README.md)

このディレクトリには、ゲーム、Editor、LLM 統合、および各機能モジュールの設計が記録されています。

| ドキュメント | 内容 |
| --- | --- |
| [開発ガイド](development-guide.md) | ローカル開発、アーキテクチャ、テスト |
| [環境の区別](environments.md) | 本番／開発／テスト環境の起動、接続、分離 |
| [LLM と Editor](ai-editor.md) | AI 設定、検証、Editor の動作 |
| [カレンダー](calendar.md) | 日付とイベントシステム |
| [LINE](line.md) | LINE シミュレーション機能 |
| [Twitter](twitter.md) | Twitter シミュレーション機能 |
| [Stable Diffusion](stable-diffusion.md) | 画像生成統合 |
| [Web Search](web-search.md) | ウェブ検索統合 |
| [ゲーム知識](game-knowledge.md) | 世界観と知識データ |
| [LLM シーン性能](llm-scene-performance.md) | シーン生成と性能 |

プロジェクトは GitHub のソースコード形式で提供されます。利用者は clone 後、`npm ci` で依存をインストールし、ルートの README の手順に従ってビルドと起動を行います。npm パッケージや `bunx` による公開、更新、素材のダウンロードは行いません。