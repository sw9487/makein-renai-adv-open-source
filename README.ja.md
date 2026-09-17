# Makein Renai ADV

**対応言語:** [繁體中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

本プロジェクトは、恋愛アドベンチャー（ADV）ゲームとそのコンテンツエディターです。ゲームとエディターは **9487** 番ポートを共有します。

> **非公式・非営利のファンプロジェクト**: 本プロジェクトは営利を一切目的としていません。『負けヒロインが多すぎる！』を愛するファンが、共有と創作を通じて作品への敬意を表現するために制作したものです。本プロジェクトは原作、原作者およびすべての権利者を尊重し、読者に正規版を購入し原作者および公式を応援することを勧めています。本プロジェクトは個人の研究、学習、ファン交流および非営利の娯楽のみを目的とし、営利、広告、有料サービス、クラウドファンディングの返礼、販売、商業運営、その他営利を期待する用途に使用してはなりません。本プロジェクトは原作者、出版社、アニメ製作委員会その他の権利者と提携、許諾または推薦の関係にはありません。

- ゲーム: http://localhost:9487/
- エディター: http://localhost:9487/editor

## ライセンスと利用制限

本プロジェクトは **PolyForm Noncommercial License 1.0.0** で提供されます。これは「ソース公開型（source-available）」の**非商用**ライセンスであり、MIT License ではなく、OSI が承認するオープンソースライセンスでもありません。

- 作者が著作権を有するオリジナルのコードは、[LICENSE](LICENSE) に定める非営利目的の範囲内で、利用、研究、改変、頒布が可能です。
- コードまたは改変版を商用製品、有料サービス、広告収益を伴う利用、企業内の商用プロジェクト、その他商用利用が予定される用途に使用することは禁止されています。商用ライセンスには別途、作者の書面による同意が必要です。
- 原作のキャラクター、名称、物語、設定、公式画像、アニメの場面画像、小説の挿絵、ロゴ、商標その他の第三者の素材は作者のものではなく、**本プロジェクトの LICENSE によっていかなるライセンスも付与されません**。これらの権利は各権利者に帰属します。
- 「ファンプロジェクト」「非営利」という表示は、作者が自らのコードに設定した制限であり、権利者が関連 IP 素材の公開、複製、翻案、頒布に同意したことを意味するものではありません。
- Fork またはコントリビューションを行う前に、追加する内容について必要な権利を有していることを確認してください。許可のない第三者の画像、音声、テキストその他の素材を提出しないでください。

素材の出典と権利に関する完全な声明は [NOTICE.md](NOTICE.md) を参照してください。ある用途が商用に該当するか不明な場合は、使用を中止し、まず作者に書面による許可を求めてください。

## 保存アーキテクチャ

- ゲーム進行状況、セーブデータ、キャラクターの記憶、サービス設定: PostgreSQL
- 生成・アップロードされた画像: S3（Docker では SeaweedFS により S3 互換サービスを提供）
- ブラウザーの cookie: プレイヤー識別のみに使用。実際のゲームデータはブラウザーに保存されません

正式環境の Docker と開発環境では、データベース、S3 ポート、バケット、Docker ボリュームが異なり、データは共有されません。

## 正式環境: フル Docker

フル Docker では App、PostgreSQL、S3 を同時に起動します。App は Docker 内から直接 PostgreSQL と S3 に接続します。

### 初回起動

まず Docker Desktop をインストールして起動し、プロジェクトルートで次を実行します:

```sh
docker compose up -d --build
```

ヘルスチェックが完了するまで待ちます:

```sh
docker compose ps
```

`postgres` と `s3` が `healthy`、`app` が `Up` と表示されたら、http://localhost:9487/ を開いてください。

### ログの確認

```sh
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f s3
```

`Ctrl+C` はログ画面から抜けるだけで、サービスは停止しません。

### 停止と再起動

```sh
# コンテナを停止（PostgreSQL と S3 のデータは保持）
docker compose stop

# 再起動
docker compose start

# コンテナを停止して削除（データボリュームは保持）
docker compose down

# 最新のコードで再構築して起動
docker compose up -d --build
```

3 つのサービスはいずれも `restart: unless-stopped` です。PC を再起動して Docker Desktop を起動すると自動的に復旧します。手動で停止した場合は `docker compose up -d` を実行してください。

> 警告: `docker compose down -v` は正式環境の PostgreSQL と S3 のボリュームを削除し、ゲーム進行状況、設定、画像もすべて削除します。通常の停止では `-v` を付けないでください。

### 正式環境のポートとデータ

| サービス | ホストポート | Docker ボリューム |
| --- | ---: | --- |
| App | 9487 | — |
| PostgreSQL | 5438 | `adv_postgres_data` |
| S3 | 8333 | `adv_s3_data` |

Docker 内では App は `postgres:5432` と `s3:8333` を使用し、ホストポートを経由しません。

## 開発環境: ローカル App + 専用 dev PostgreSQL/S3

開発モードでは PostgreSQL と S3 のみ Docker で実行し、App はローカルの `npm run dev` で起動します。開発データは `makein-dev` Compose プロジェクトと専用ボリュームを使用し、正式環境の Docker データを読み書きすることはありません。

### 1. 依存関係のインストール

Node.js、npm、[Bun 1.3+](https://bun.com/docs/installation)、Docker Desktop が必要です。

```sh
npm ci
npm ci --prefix web
```

### 2. 開発環境設定ファイルの作成

Windows PowerShell:

```powershell
Copy-Item .env.development.example .env.development
```

macOS/Linux:

```sh
cp .env.development.example .env.development
```

LLM や Stable Diffusion を使用する場合は `.env.development` を編集してください。このファイルは Git で無視され、キーがコミットされることはありません。

### 3. 専用 dev 基盤サービスの起動

```sh
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml ps
```

`postgres-dev` と `s3-dev` が両方とも `healthy` になることを確認してください。

### 4. 開発サーバーの起動

```sh
npm run dev -- --env-file .env.development
```

開発版は http://localhost:9487/ です。正式環境の App が 9487 を使用中の場合は、先に `docker compose stop app` を実行してください。開発後は `docker compose start app` で正式環境の App を復旧できます。

### 5. dev 基盤サービスの停止

```sh
# dev コンテナを停止・削除（dev データは保持）
docker compose -f compose.dev.yaml down

# 再起動（既存の dev データを再利用）
docker compose -f compose.dev.yaml up -d
```

すべての開発データを消去すると決めた場合のみ:

```sh
docker compose -f compose.dev.yaml down -v
```

これは dev ボリュームのみを削除し、正式環境の PostgreSQL/S3 には影響しません。

### dev と正式データの分離

| サービス | 正式環境 | 開発環境 | テスト環境 |
| --- | --- | --- | --- |
| PostgreSQL ホストポート | 5438 | 5439 | 5450 |
| PostgreSQL データベース | `MAKEIN_DB` | `MAKEIN_DEV_DB` | `MAKEIN_TEST_DB` |
| PostgreSQL ボリューム | `adv_postgres_data` | `makein-dev_dev_postgres_data` | `makein-test_test_postgres_data` |
| S3 ホストポート | 8333 | 8334 | —（テストに S3 なし） |
| S3 バケット | `makein-s3` | `makein-dev-s3` | — |
| S3 ボリューム | `adv_s3_data` | `makein-dev_dev_s3_data` | — |

3 つの環境は異なる Compose プロジェクト（`adv` / `makein-dev` / `makein-test`）、データボリューム、データベース、ネットワークを使用し、ホストポートも完全に重複しないため、同時に共存して互いに干渉しません。完全な起動手順、接続情報、分離の考え方、クロスプラットフォームの注意点については[環境の区別](docs/environments.md)を参照してください。

## API とエディター設定

LLM は OpenAI 互換の Chat Completions URL、API キー、モデルを使用します。Stable Diffusion は A1111 互換 API を使用します。`.env` / `.env.development` で初期値を設定できるほか、エディターから保存することもできます。エディターから保存された設定は、現在の環境が接続している PostgreSQL に書き込まれます。

キーはサーバー側でのみ使用され、ゲームのフロントエンドに返されることも、ゲームコンテンツに書き込まれることもありません。正式環境と dev ではデータベースが異なるため、両者の API、Stable Diffusion、エディター設定もそれぞれ独立しています。

### Stable Diffusion のおすすめリソース

本プロジェクトは [AUTOMATIC1111 Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) 互換 API を使用します。初回設定ではデフォルトで **Pony** を選択します。データベースに既に設定がある場合は元の選択を維持し、自動的に上書きしません。Checkpoint と LoRA は互換性のあるモデルファミリーを選択する必要があり、各ダウンロードページのライセンス、利用制限、推奨パラメータを各自で確認してください。

- Pony おすすめモデル: [Zuki Clean Anime Mix](https://civitai.com/models/880541/zuki-clean-anime-mix)
- Illustrious おすすめモデル: [Nova Anime XL](https://civitai.com/models/376130/nova-anime-xl?modelVersionId=2940478)
- おすすめ LoRA 作者: [Ibukimakisiko](https://civitai.com/user/Ibukimakisiko)、[nochekaiser881](https://civitai.com/user/nochekaiser881)、[soralz](https://civitai.com/user/soralz)

上記のリンクは互換リソースを見つけやすくするための推薦であり、本プロジェクトと関連作者またはプラットフォームとの提携、許諾、推薦関係を意味するものではありません。モデルと LoRA も本プロジェクトとともに頒布されるものではありません。

## 原作への謝辞

『負けヒロインが多すぎる！』の素晴らしさのすべては、原作者の雨森たきび先生、キャラクター原案のいみぎむる先生、そして出版社、アニメ製作チーム、原作および公式展開に携わったすべての方々によるものです。彼らがいなければ、これほど素晴らしい原作は存在しませんでした。本プロジェクトはファンが愛情から制作した非公式・非営利の同人作品であり、原作のキャラクター、世界観、功績を自らが創造した、あるいは所有すると主張するものではありません。

- 原作者 雨森たきび先生: [X（@amamori_takibi）](https://x.com/amamori_takibi)
- [原作特設サイト（ガガガ文庫／小学館）](https://gagagabunko.jp/special/makeine/)
- [TV アニメ公式サイト](https://makeine-anime.com/)

作者は本プロジェクトから収入を得ておらず、商業チームや商業リソースもありません。ゲーム制作は単に作品への愛情に基づくものです。権利者が本プロジェクトの内容が不快である、または自らの権利に関わると考える場合は、プロジェクトの連絡方法を通じて通知し、具体的な内容を指摘してください。作者は削除、修正に協力し、必要に応じて repository を非公開にします。この声明は誠意ある連絡・対応のための仕組みであり、許諾を得たことを示すものではなく、権利者が法律上有する権利を制限するものでもありません。

エディターでは、キャラクターデータ、プロンプト、立ち絵、シーン、イベント、好感度、CG を変更できます。アップロードまたは生成された画像は、現在の環境で指定された S3 バケットに書き込まれ、Git 作業ディレクトリには書き戻されません。

## ゲームデータとブラウザー

プレイヤー cookie は PostgreSQL 内のゲーム記録を識別するためのものです。cookie を消去すると別のプレイヤーの進行状況が作成されますが、データベース内の古い記録は削除されません。同じブラウザーが cookie を保持している限り、再読み込み、App の再起動、Docker の再起動はいずれも同じ進行状況を読み込みます。

本プロジェクトには、キャラクターの会話、LINE、キャラクターごとの独立した記憶、好感度、自動保存、6 枠の手動セーブ、イベント回顧、CG が含まれます。コンテンツと素材のライセンス情報は [NOTICE.md](NOTICE.md)、キャラクター設定データは [content/CHARACTERS.md](content/CHARACTERS.md) を参照してください。

バックグラウンドジョブと requestId による重複排除の設計については [DeepSeek Harness 対照](docs/deepseek-harness-review.md) を、AI ペイロード、検証戦略、画像アセットの規則については[開発ガイド](docs/development-guide.md)を参照してください。

## テストとビルド

```sh
npm run check
npm test
npm run build
```

> `npm test`（= `bun test --timeout=40000 ./tests`）には、実行中の PostgreSQL テストデータベース（`docker compose -f compose.test.yaml up -d`、ホストポート 5450）が必要です。`tests/bootstrap.ts` は `MAKEIN_TEST_DATABASE_URL` を読み取って接続します。テストデータベースが起動していない場合は、先に起動してからテストを実行してください。

## プロジェクト構造

| ディレクトリ | 用途 |
| --- | --- |
| `core/` | ゲームエンジンと共有型 |
| `content/` | 内蔵のゲームコンテンツと素材 |
| `web/` | React フロントエンドとエディター |
| `server/` | Bun HTTP API、PostgreSQL と S3 へのアクセス |
| `scripts/` | 開発、ビルド、チェック用スクリプト |
| `tests/` | 自動テスト |
| `dist/` | ビルド出力 |

ライセンスと第三者素材の説明については [NOTICE.md](NOTICE.md) を参照してください。