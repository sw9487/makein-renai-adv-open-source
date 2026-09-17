# 環境區分：正式、開發與測試

**语言导航 / Languages / 言語:** [繁體中文](environments.md) · [English](../en/environments.md) · [日本語](../ja/environments.md)


本專案把資料存到 PostgreSQL（SQLite 已移除），並把環境分成三個互不共用、互不干擾的 Docker compose 專案。下面列出每一種環境的啟動方式、連線資訊與隔離原則。

## 三種環境總覽

| | 正式環境（production） | 開發環境（dev） | 測試環境（test） |
| --- | --- | --- | --- |
| compose 檔 | `compose.yaml` | `compose.dev.yaml` | `compose.test.yaml` |
| compose project 名稱 | `adv` | `makein-dev` | `makein-test` |
| 提供服務 | postgres、s3、app | postgres-dev、s3-dev | postgres-test |
| app / 伺服器 | Docker 內（`app` 服務，跑 Bun） | 本機奉命 Bun（`bun scripts/dev.mjs`） | （無；由 `bun test` 內嵌啟用） |
| 預設位址 | http://localhost:9487/ | http://localhost:9487/ | — |

三個 compose 檔的 `name`、宿主機埠、資料卷、網路與資料庫名稱都互不相同，因此可以同時存在、各自獨立啟動與停止，不會互相污染或搶埠。

## 各環境詳細設定

### 正式環境（production）

- **compose 檔**：`compose.yaml`（project 名稱 `adv`）
- **服務**：`postgres`、`s3`、`app`
- **宿主機埠映射**：
  - `app` → 宿主機 `9487`
  - `postgres` → 宿主機 `5438`（刻意避開 5432）
  - `s3` → 宿主機 `8333`
- **資料庫**：`MAKEIN_DB`（使用者 admin）
- **資料卷**：`adv_postgres_data`、`adv_s3_data`
- **內部網路**：`adv_default`
- **app 容器內連線**（docker 內網主機名）：
  - `DATABASE_URL=postgresql://admin:105114@postgres:5432/MAKEIN_DB`
  - `S3_ENDPOINT=http://s3:8333`
  - `S3_BUCKET=makein-s3`

啟動／停止：

```sh
docker compose up -d --build   # 建置並啟動正式版
docker compose ps
docker compose logs -f app
docker compose stop            # 停止（保留資料）
docker compose start           # 再次啟動
docker compose down            # 移除容器（保留資料卷）
docker compose down -v         # ⚠️ 會刪除正式 PostgreSQL/S3 資料，勿隨意執行
```

> 正式版用 `compose.yaml`（project `adv`），`docker compose up`（不加 `-f`）預設就是它。

### 開發環境（dev）

- **compose 檔**：`compose.dev.yaml`（project 名稱 `makein-dev`）
- **提供服務**：`postgres-dev`、`s3-dev`（**不包含 app**；開發伺服器跑在本機）
- **宿主機埠映射**：
  - `postgres-dev` → 宿主機 `5439`
  - `s3-dev` → 宿主機 `8334`
- **資料庫**：`MAKEIN_DEV_DB`（使用者 admin）
- **資料卷**：`makein-dev_dev_postgres_data`、`makein-dev_dev_s3_data`
- **內部網路**：`makein-dev_default`
- **本機伺服器連線**（開發伺服器跑在宿主機，走 `127.0.0.1`）：
  - `DATABASE_URL=postgresql://admin:105114@127.0.0.1:5439/MAKEIN_DEV_DB`
  - `S3_ENDPOINT=http://127.0.0.1:8334`
  - `S3_BUCKET=makein-dev-s3`

啟動 dev 基礎服務 + 開發伺服器：

```sh
cp .env.development.example .env.development   # 首次，建立 dev 環境變數
docker compose -f compose.dev.yaml up -d       # 啟動 postgres-dev / s3-dev
docker compose -f compose.dev.yaml ps          # 確認兩者 healthy
npm run dev -- --env-file .env.development     # 在宿主機啟動開發伺服器（Bun）
```

- 開發版位址：http://localhost:9487/ 。
- `.env.development` 已被 Git 忽略，不會提交密鑰；需要的話可依 `.env.development.example` 填入 LLM / Stable Diffusion 設定。
- 若正式 App 正在佔用 `9487`，開發伺服器會無法綁定，請先 `docker compose stop app`，完成後再 `docker compose start app`。

停止／清空（只影響 dev）：

```sh
docker compose -f compose.dev.yaml down        # 保留 dev 資料
docker compose -f compose.dev.yaml down -v     # ⚠️ 只清空 dev 資料卷，不影響正式
```

> **⚠️ SQLite 已移除**：開發環境現在**必須**先讓 `postgres-dev` 起來，`DATABASE_URL` 未設定時開發伺服器會直接報錯。不再能「零基礎」啟動。

### 測試環境（test）

- **compose 檔**：`compose.test.yaml`（project 名稱 `makein-test`）
- **提供服務**：`postgres-test`（無 s3、無 app）
- **宿主機埠映射**：`postgres-test` → 宿主機 `5450`
- **資料庫**：`MAKEIN_TEST_DB`（使用者 admin）
- **資料卷**：`makein-test_test_postgres_data`
- **內部網路**：`makein-test_default`
- 額外掛載 `docker/test-init.sql` 作初始化腳本
- **測試連線**（`tests/bootstrap.ts`）：`postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB`

建立測試庫並執行測試：

```sh
docker compose -f compose.test.yaml up -d
bun scripts/drop-test-schemas.ts   # 每次整批跑測試前，清掉累積的測試 schema
bun run test                       # = bun test --timeout=40000 ./tests
```

- 測試只針對 `MAKEIN_TEST_DB` 內以 `t_<hash>` 命名的 schema，測完由 `drop-test-schemas.ts` 清理；**不會碰正式 `MAKEIN_DB` 或開發 `MAKEIN_DEV_DB`**。
- 測試依賴測試容器在跑；起不完就測會失敗（這是「需要它」，不是被正式／開發影響）。

## 隔離原則（為何互不干擾）

1. **compose project 名稱不同**：`adv` / `makein-dev` / `makein-test`，容器、網路、資料卷都各自命名，`docker compose up`（預設）只管理正式，不會碰到 dev/test。
2. **宿主機埠零重疊**：正式 5438/8333/9487、dev 5439/8334、測試 5450。
3. **資料卷不同**：三個 postgres 用各自的 named volume，資料不會互相污染。
4. **網路隔離**：正式 app 用內網主機名 `postgres:5432`，只在 `adv_default` 內解析，不會連到 dev/test 的 postgres。
5. **資料庫與設定獨立**：`MAKEIN_DB` / `MAKEIN_DEV_DB` / `MAKEIN_TEST_DB` 各自獨立；Editor 儲存的 API、Stable Diffusion 與設定只寫入該環境所連線的 PostgreSQL，兩邊互不影響。

## 跨平台（Win / macOS / Linux）

- **架構上平台中立，隨處可跑**：所有服務都是容器（`postgres:17-alpine`、`oven/bun`、`node:22-alpine`，皆 multi-arch），Bun／Node 本身亦跨平台；開發連線走 env／`.env`，無作業系統特定的路徑或指令。
- **Apple Silicon（arm64）**：`chrislusf/seaweedfs:latest` 多為 amd64 映像，在 M 晶片 Mac 上會以 Docker Desktop 模擬執行（可用但較慢）。`postgres:17-alpine`、`node:22-alpine`、`oven/bun` 無此限制。
- **開發必備基礎設施**：因 SQLite 已移除，任何平台要做開發都得先啟動 PostgreSQL（dev 用 `compose.dev.yaml` 的 5439）。這是 SQLite 移除後的一致需求，不是平台限制。

## 常見問題

- **問：開發與正式會互相干擾嗎？**
  不會。兩者是不同的 compose 專案、資料卷、資料庫與網路，埠也不重疊；資料與 Editor 設定完全獨立。
- **問：跑 `bun test` 會不會破壞我的正式或開發資料？**
  不會。測試只連測試庫 `MAKEIN_TEST_DB` 並只操作 `t_<hash>` schema。
- **問：為什麼 dev 現在起不來？**
  SQLite 已移除，dev 需先 `docker compose -f compose.dev.yaml up -d` 讓 `postgres-dev` 起來，且 `DATABASE_URL` 要指向 `127.0.0.1:5439/MAKEIN_DEV_DB`。
