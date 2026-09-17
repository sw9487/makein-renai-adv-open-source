# 環境の区別：本番・開発・テスト

**言語:** [繁體中文](../zh-TW/environments.md) · [English](../en/environments.md) · [日本語](environments.md)

本プロジェクトはデータを PostgreSQL に保存しています（SQLite は削除済み）。環境は、互いに共有せず、互いに干渉しない 3 つの Docker compose プロジェクトに分けています。以下に、各環境の起動方法・接続情報・分離原則を示します。

## 3 つの環境の一覧

| | 本番環境（production） | 開発環境（dev） | テスト環境（test） |
| --- | --- | --- | --- |
| compose ファイル | `compose.yaml` | `compose.dev.yaml` | `compose.test.yaml` |
| compose project 名 | `adv` | `makein-dev` | `makein-test` |
| 提供するサービス | postgres、s3、app | postgres-dev、s3-dev | postgres-test |
| app / サーバー | Docker 内（`app` サービス、Bun で実行） | ローカルで Bun 実行（`bun scripts/dev.mjs`） | （なし。`bun test` で内蔵起動） |
| 既定のアドレス | http://localhost:9487/ | http://localhost:9487/ | — |

3 つの compose ファイルの `name`、ホストのポート、データボリューム、ネットワーク、データベース名はすべて異なるため、同時に存在し、それぞれ独立して起動・停止でき、互いに汚染したりポートを取り合ったりしません。

## 各環境の詳細設定

### 本番環境（production）

- **compose ファイル**：`compose.yaml`（project 名 `adv`）
- **サービス**：`postgres`、`s3`、`app`
- **ホストのポートマッピング**：
  - `app` → ホスト `9487`
  - `postgres` → ホスト `5438`（意図的に 5432 を避けています）
  - `s3` → ホスト `8333`
- **データベース**：`MAKEIN_DB`（ユーザー admin）
- **データボリューム**：`adv_postgres_data`、`adv_s3_data`
- **内部ネットワーク**：`adv_default`
- **app コンテナ内の接続**（docker 内ネットワークのホスト名）：
  - `DATABASE_URL=postgresql://admin:105114@postgres:5432/MAKEIN_DB`
  - `S3_ENDPOINT=http://s3:8333`
  - `S3_BUCKET=makein-s3`

起動／停止：

```sh
docker compose up -d --build   # 本番版をビルドして起動
docker compose ps
docker compose logs -f app
docker compose stop            # 停止（データは保持）
docker compose start           # 再起動
docker compose down            # コンテナを削除（データボリュームは保持）
docker compose down -v         # ⚠️ 本番の PostgreSQL/S3 データを削除するため、安易に実行しないこと
```

> 本番版は `compose.yaml`（project `adv`）を使用し、`docker compose up`（`-f` なし）の既定はこれです。

### 開発環境（dev）

- **compose ファイル**：`compose.dev.yaml`（project 名 `makein-dev`）
- **提供するサービス**：`postgres-dev`、`s3-dev`（**app は含まない**。開発サーバーはローカルで実行）
- **ホストのポートマッピング**：
  - `postgres-dev` → ホスト `5439`
  - `s3-dev` → ホスト `8334`
- **データベース**：`MAKEIN_DEV_DB`（ユーザー admin）
- **データボリューム**：`makein-dev_dev_postgres_data`、`makein-dev_dev_s3_data`
- **内部ネットワーク**：`makein-dev_default`
- **ローカルサーバーの接続**（開発サーバーはホスト上で実行され、`127.0.0.1` 経由）：
  - `DATABASE_URL=postgresql://admin:105114@127.0.0.1:5439/MAKEIN_DEV_DB`
  - `S3_ENDPOINT=http://127.0.0.1:8334`
  - `S3_BUCKET=makein-dev-s3`

dev の基盤サービス + 開発サーバーを起動：

```sh
cp .env.development.example .env.development   # 初回。dev 用の環境変数を作成
docker compose -f compose.dev.yaml up -d       # postgres-dev / s3-dev を起動
docker compose -f compose.dev.yaml ps          # 両方が healthy であることを確認
npm run dev -- --env-file .env.development     # ホスト上で開発サーバーを起動（Bun）
```

- 開発版のアドレス：http://localhost:9487/ 。
- `.env.development` は Git で無視されており、鍵はコミットされません。必要に応じて `.env.development.example` に従って LLM / Stable Diffusion の設定を記入してください。
- 本番 App が `9487` を占有している場合、開発サーバーはバインドできません。先に `docker compose stop app` を実行し、完了後に `docker compose start app` を実行してください。

停止／消去（dev のみに影響）：

```sh
docker compose -f compose.dev.yaml down        # dev のデータは保持
docker compose -f compose.dev.yaml down -v     # ⚠️ dev のデータボリュームのみ消去。本番には影響なし
```

> **⚠️ SQLite は削除済み**：開発環境では現在、**必ず** `postgres-dev` を先に起動する必要があります。`DATABASE_URL` が未設定の場合、開発サーバーは即座にエラーになります。「ゼロから」起動はもうできません。

### テスト環境（test）

- **compose ファイル**：`compose.test.yaml`（project 名 `makein-test`）
- **提供するサービス**：`postgres-test`（s3 なし、app なし）
- **ホストのポートマッピング**：`postgres-test` → ホスト `5450`
- **データベース**：`MAKEIN_TEST_DB`（ユーザー admin）
- **データボリューム**：`makein-test_test_postgres_data`
- **内部ネットワーク**：`makein-test_default`
- 初期化スクリプトとして `docker/test-init.sql` を追加マウント
- **テスト接続**（`tests/bootstrap.ts`）：`postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB`

テストデータベースを作成してテストを実行：

```sh
docker compose -f compose.test.yaml up -d
bun scripts/drop-test-schemas.ts   # テストを一括実行するたびに、蓄積されたテスト schema を削除
bun run test                       # = bun test --timeout=40000 ./tests
```

- テストは `MAKEIN_TEST_DB` 内の `t_<hash>` という名前の schema のみを対象とし、実行後は `drop-test-schemas.ts` で削除されます。**本番の `MAKEIN_DB` や開発の `MAKEIN_DEV_DB` には触れません**。
- テストはテストコンテナが起動していることに依存します。起動しきらないままテストすると失敗します（これは「必要なもの」であって、本番／開発による影響ではありません）。

## 分離原則（なぜ互いに干渉しないのか）

1. **compose project 名が異なる**：`adv` / `makein-dev` / `makein-test`。コンテナ・ネットワーク・データボリュームはそれぞれ名前付けされており、`docker compose up`（既定）は本番のみを管理し、dev/test には触れません。
2. **ホストのポートが完全に重複しない**：本番 5438/8333/9487、dev 5439/8334、テスト 5450。
3. **データボリュームが異なる**：3 つの postgres はそれぞれ固有の named volume を使用し、データが相互に汚染されることはありません。
4. **ネットワーク分離**：本番 app は内部ネットワークのホスト名 `postgres:5432` を使用し、`adv_default` 内でのみ解決されるため、dev/test の postgres には接続しません。
5. **データベースと設定が独立**：`MAKEIN_DB` / `MAKEIN_DEV_DB` / `MAKEIN_TEST_DB` はそれぞれ独立しています。Editor が保存する API、Stable Diffusion と設定は、その環境が接続している PostgreSQL にのみ書き込まれ、両者は互いに影響しません。

## クロスプラットフォーム（Win / macOS / Linux）

- **アーキテクチャ上はプラットフォーム非依存で、どこでも実行可能**：すべてのサービスはコンテナ（`postgres:17-alpine`、`oven/bun`、`node:22-alpine`、いずれも multi-arch）で、Bun／Node 自体もクロスプラットフォームです。開発接続は env／`.env` 経由で、OS 固有のパスやコマンドはありません。
- **Apple Silicon（arm64）**：`chrislusf/seaweedfs:latest` はほぼ amd64 イメージのため、M チップの Mac では Docker Desktop によりエミュレーション実行されます（使えますが低速）。`postgres:17-alpine`、`node:22-alpine`、`oven/bun` はこの制限がありません。
- **開発に必須の基盤**：SQLite が削除されたため、どのプラットフォームでも開発を行うにはまず PostgreSQL を起動する必要があります（dev は `compose.dev.yaml` の 5439）。これは SQLite 削除後の一貫した要件であり、プラットフォームによる制限ではありません。

## よくある質問

- **Q：開発と本番は互いに干渉しますか？**
  しません。両者は異なる compose プロジェクト・データボリューム・データベース・ネットワークで、ポートも重複していません。データと Editor の設定は完全に独立しています。
- **Q：`bun test` を実行すると本番や開発のデータが壊れますか？**
  壊れません。テストはテストデータベース `MAKEIN_TEST_DB` のみに接続し、`t_<hash>` schema だけを操作します。
- **Q：なぜ dev が今起動しないのですか？**
  SQLite が削除されたため、dev では先に `docker compose -f compose.dev.yaml up -d` で `postgres-dev` を起動する必要があり、`DATABASE_URL` は `127.0.0.1:5439/MAKEIN_DEV_DB` を指す必要があります。