# Makein Renai ADV

**语言导航 / Languages / 言語:** [繁體中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

本專案是一套戀愛 ADV 與內容編輯器。遊戲與 Editor 共用 **9487** port。

> **非官方、非商業同人專案**：本專案完全不作商業用途，純粹由喜愛《負けヒロインが多すぎる！》的同好製作，希望透過交流與創作表達對作品的喜愛。本專案尊重原著、原作者與所有權利人，鼓勵讀者購買正版作品並以實際行動支持作者及官方。本專案僅供個人研究、學習、同好交流與非商業娛樂，不得用於營利、廣告、付費服務、募資回饋、販售、商業代營運，或其他預期帶來商業利益的用途。本專案與原作者、出版社、動畫製作委員會及其他權利人沒有合作、授權或背書關係。

- 遊戲：http://localhost:9487/
- Editor：http://localhost:9487/editor

## 授權與使用限制

本專案採 **PolyForm Noncommercial License 1.0.0**，屬於「原始碼公開（source-available）」的非商業授權，**不是 MIT，也不是符合 OSI 定義的開源授權**。

- 作者擁有著作權的原創程式碼，可在 [LICENSE](LICENSE) 規定的非商業目的內使用、研究、修改與散布。
- 禁止將程式碼或修改版用於商業產品、收費服務、廣告營利、公司內部商業專案，或任何預期的商業應用；商業授權必須另行取得作者書面同意。
- 原作角色、名稱、故事、官方立繪、動畫場面圖、小說插圖、Logo、商標及其他第三方素材不屬於作者，**不因本專案的 LICENSE 而獲得任何授權**。其權利仍歸原權利人所有。
- 「僅供交流」及「禁止商用」是本專案作者對自己程式碼設定的限制，不代表原權利人已同意公開、重製、改作或散布相關 IP 素材。
- Fork 或提交貢獻前，請確認自己對新增內容具有必要權利；不得提交未獲授權的第三方圖片、音訊、文字或其他素材。

完整素材來源與權利聲明請參閱 [NOTICE.md](NOTICE.md)。如不確定某項用途是否屬於商業用途，請先停止使用並向作者取得書面許可。

### English

This is an unofficial fan-made project created entirely without commercial purpose by fans who sincerely love *Too Many Losing Heroines!* (*Makeine*). It exists solely to express appreciation for the original work through fan creativity and community exchange. We respect the original work, its author, and all rightsholders, and strongly encourage everyone to purchase official releases and directly support the author and official production. The project is provided solely for personal research, study, community exchange, and noncommercial entertainment. It is not affiliated with, authorized by, sponsored by, or endorsed by the author, publisher, anime production committee, or any other rightsholder.

The original software code owned by the project author is available under the [PolyForm Noncommercial License 1.0.0](LICENSE). This is a **source-available, noncommercial license**, not the MIT License or an OSI-approved open-source license. Commercial products, paid services, advertising-supported use, crowdfunding rewards, resale, commercial hosting, internal business projects, and any use with an anticipated commercial application require the project author's prior written permission.

No license is granted to any third-party characters, names, stories, settings, official artwork, anime stills, novel illustrations, logos, trademarks, audio, or other third-party material. Their rights remain with their respective rightsholders. The labels “noncommercial,” “fan project,” and “unofficial” do not constitute permission from those rightsholders. Contributors must not submit third-party material unless they have all permissions necessary for its use and distribution. See [NOTICE.md](NOTICE.md) for details.

### 日本語

本プロジェクトは、『負けヒロインが多すぎる！』を心から愛するファンが、営利を一切目的とせずに制作した非公式のファンプロジェクトです。ファン創作と交流を通じて原作への愛情と敬意を表すことのみを目的としています。原作、原作者およびすべての権利者を尊重し、正規版を購入して原作者と公式展開を直接応援することを強く推奨します。本プロジェクトは、個人による研究、学習、ファン同士の交流および非営利の娯楽のみを目的としています。原作者、出版社、アニメ製作委員会その他の権利者とは提携しておらず、許諾、協賛または推奨を受けたものではありません。

プロジェクト作者が著作権を有するオリジナルのソフトウェアコードは、[PolyForm Noncommercial License 1.0.0](LICENSE) に基づいて提供されます。これは **ソース公開型（source-available）の非商用ライセンス**であり、MIT License または OSI の定義に準拠するオープンソースライセンスではありません。商用製品、有料サービス、広告収益を伴う利用、クラウドファンディングの返礼、販売、商用ホスティング、企業内の商用プロジェクト、その他商用利用が予定される用途には、プロジェクト作者の事前の書面による許可が必要です。

第三者が権利を有するキャラクター、名称、物語、設定、公式画像、アニメの場面画像、小説の挿絵、ロゴ、商標、音声その他の素材について、本プロジェクトは一切の利用許諾を与えるものではありません。これらの権利は各権利者に帰属します。「非営利」「ファンプロジェクト」「非公式」と表示しても、権利者から許諾を得たことにはなりません。コントリビューターは、利用および配布に必要な権利を有しない第三者素材を提出してはなりません。詳細は [NOTICE.md](NOTICE.md) を参照してください。

## 儲存架構

- 遊戲進度、存檔、角色記憶與服務設定：PostgreSQL
- 生成及上傳的圖片：S3（Docker 使用 SeaweedFS 提供 S3 相容服務）
- 瀏覽器 cookie：只用來辨識玩家，實際遊戲資料不存於瀏覽器

正式 Docker 與開發環境使用不同的資料庫、S3 port、bucket 和 Docker volumes，不會共用資料。

## 正式環境：完整 Docker

完整 Docker 會同時啟動 App、PostgreSQL 和 S3。App 在 Docker 內直接連線到 PostgreSQL 與 S3。

### 第一次啟動

請先安裝並啟動 Docker Desktop，然後在專案根目錄執行：

```sh
docker compose up -d --build
```

等待健康檢查完成：

```sh
docker compose ps
```

`postgres` 和 `s3` 顯示 `healthy`、`app` 顯示 `Up` 後，即可開啟 http://localhost:9487/。

### 查看日誌

```sh
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f s3
```

按 `Ctrl+C` 只會離開日誌畫面，不會停止服務。

### 停止與再次啟動

```sh
# 停止容器，但保留 PostgreSQL 與 S3 資料
docker compose stop

# 再次啟動
docker compose start

# 停止並移除容器，但仍保留資料 volumes
docker compose down

# 重新建立並啟動最新程式
docker compose up -d --build
```

三個服務均使用 `restart: unless-stopped`。電腦重開並啟動 Docker Desktop 後會自動恢復；如果曾手動停止服務，請執行 `docker compose up -d`。

> 警告：`docker compose down -v` 會刪除正式 PostgreSQL 與 S3 volumes，連同遊戲進度、設定和圖片一起刪除。一般停止服務不要加 `-v`。

### 正式環境 ports 與資料

| 服務 | 主機 port | Docker volume |
| --- | ---: | --- |
| App | 9487 | — |
| PostgreSQL | 5438 | `adv_postgres_data` |
| S3 | 8333 | `adv_s3_data` |

App 在 Docker 內使用 `postgres:5432` 和 `s3:8333`，不會經由主機 port。

## 開發環境：本機 App + 獨立 dev PostgreSQL/S3

開發模式只把 PostgreSQL 與 S3 跑在 Docker；App 由本機的 `npm run dev` 啟動。開發資料使用 `makein-dev` Compose project 和獨立 volumes，不會讀寫正式 Docker 資料。

### 1. 安裝依賴

需要 Node.js、npm、[Bun 1.3+](https://bun.com/docs/installation) 與 Docker Desktop。

```sh
npm ci
npm ci --prefix web
```

### 2. 建立開發環境設定

Windows PowerShell：

```powershell
Copy-Item .env.development.example .env.development
```

macOS/Linux：

```sh
cp .env.development.example .env.development
```

如需 LLM 或 Stable Diffusion，請編輯 `.env.development`。此檔案已被 Git 忽略，不會提交密鑰。

### 3. 啟動獨立 dev 基礎服務

```sh
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml ps
```

確認 `postgres-dev` 與 `s3-dev` 均顯示 `healthy`。

### 4. 啟動開發伺服器

```sh
npm run dev -- --env-file .env.development
```

開發版位於 http://localhost:9487/。正式 App 若正在使用 9487，請先執行 `docker compose stop app`；完成開發後可用 `docker compose start app` 恢復正式 App。

### 5. 停止 dev 基礎服務

```sh
# 停止並移除 dev 容器，保留 dev 資料
docker compose -f compose.dev.yaml down

# 再次啟動，沿用原本 dev 資料
docker compose -f compose.dev.yaml up -d
```

只有確定要清空所有開發資料時才執行：

```sh
docker compose -f compose.dev.yaml down -v
```

這只會刪除 dev volumes，不會影響正式 PostgreSQL/S3。

### dev 與正式資料隔離

| 服務 | 正式環境 | 開發環境 | 測試環境 |
| --- | --- | --- | --- |
| PostgreSQL 主機 port | 5438 | 5439 | 5450 |
| PostgreSQL database | `MAKEIN_DB` | `MAKEIN_DEV_DB` | `MAKEIN_TEST_DB` |
| PostgreSQL volume | `adv_postgres_data` | `makein-dev_dev_postgres_data` | `makein-test_test_postgres_data` |
| S3 主機 port | 8333 | 8334 | —（測試無 S3） |
| S3 bucket | `makein-s3` | `makein-dev-s3` | — |
| S3 volume | `adv_s3_data` | `makein-dev_dev_s3_data` | — |

三個環境使用不同的 compose project（`adv`／`makein-dev`／`makein-test`）、資料卷、資料庫與網路，且宿主機埠完全不重疊，故可同時存在、互不干擾。完整啟動方式、連線資訊、隔離原則與跨平台注意事項見 [環境區分](docs/environments.md)。

## API 與 Editor 設定

LLM 使用 OpenAI 相容的 Chat Completions URL、API key 與 model。Stable Diffusion 使用 A1111 相容 API。可以在 `.env`／`.env.development` 提供初始值，也可以由 Editor 儲存；Editor 儲存後的設定會寫入目前環境所連線的 PostgreSQL。

金鑰只在伺服器端使用，不會回傳給遊戲前端或寫入遊戲內容。正式與 dev 使用不同資料庫，因此兩邊的 API、Stable Diffusion 與 Editor 設定也彼此獨立。

### Stable Diffusion 推薦資源

本專案使用 [AUTOMATIC1111 Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) 相容 API，初次設定預設選擇 **Pony**；如果資料庫中已有設定，則會保留原本選擇，不會自動覆寫。Checkpoint 與 LoRA 必須選擇相容的模型家族，並請自行閱讀各下載頁面的授權、使用限制及建議參數。

- Pony 推薦模型：[Zuki Clean Anime Mix](https://civitai.com/models/880541/zuki-clean-anime-mix)
- Illustrious 推薦模型：[Nova Anime XL](https://civitai.com/models/376130/nova-anime-xl?modelVersionId=2940478)
- 推薦 LoRA 作者：[Ibukimakisiko](https://civitai.com/user/Ibukimakisiko)、[nochekaiser881](https://civitai.com/user/nochekaiser881)、[soralz](https://civitai.com/user/soralz)

以上連結僅是方便使用者尋找相容資源的推薦，不表示本專案與相關作者或平台具有合作、授權或背書關係；模型與 LoRA 也不隨本專案散布。

## 向原作致謝

《負けヒロインが多すぎる！》的一切美好，來自原作者雨森たきび老師、角色原案いみぎむる老師，以及出版社、動畫製作團隊與所有參與原作及官方展開的人員。沒有他們，就不會有如此美好的原作。本專案只是粉絲出於喜愛所製作的非官方、非商業同人作品，絕不主張自己創造或擁有原作的角色、世界觀與成就。

- 原作者雨森たきび老師：[X（@amamori_takibi）](https://x.com/amamori_takibi)
- [原作特設網站（ガガガ文庫／小学館）](https://gagagabunko.jp/special/makeine/)
- [TV 動畫官方網站](https://makeine-anime.com/)

作者沒有因本專案獲得收入，也沒有商業團隊或商業資源；製作遊戲只是單純憑著對作品的熱愛。若任何權利人認為本專案內容有所冒犯或涉及其權利，敬請透過專案聯絡方式通知並指出具體內容，作者會優先配合移除、修正，必要時下架 repository。此聲明是善意聯絡與處理機制，並不表示已取得授權，也不限制任何權利人依法享有的權利。

Editor 可修改角色資料、Prompt、立繪、場景、事件、好感度與 CG。上傳或生成的圖片會寫入目前環境指定的 S3 bucket，不會寫回 Git 工作目錄。

## 遊戲資料與瀏覽器

玩家 cookie 是 PostgreSQL 內遊戲紀錄的識別碼。清除 cookie 會建立另一位玩家的進度，但不會刪除資料庫內的舊紀錄。同一瀏覽器保留 cookie 時，重新整理、重新啟動 App 或重新啟動 Docker 都會載入相同進度。

專案包含角色對話、LINE、角色獨立記憶、好感度、自動存檔、六欄手動存檔、事件回顧及 CG。內容與素材授權資訊請參閱 [NOTICE.md](NOTICE.md)，角色設定資料請參閱 [content/CHARACTERS.md](content/CHARACTERS.md)。

背景工作與 requestId 去重機制的設計說明請參閱 [DeepSeek Harness 對照](docs/deepseek-harness-review.md)，AI payload、驗證策略與圖片資產規則請參閱[開發指南](docs/development-guide.md)。

## 測試與建置

```sh
npm run check
npm test
npm run build
```

> `npm test`（= `bun test --timeout=40000 ./tests`）需要一個執行中的 PostgreSQL 測試庫（`docker compose -f compose.test.yaml up -d`，本機 5450 埠），`tests/bootstrap.ts` 讀 `MAKEIN_TEST_DATABASE_URL` 連線。測試庫未啟動時請先啟動後再跑測試。

## 專案結構

| 目錄 | 用途 |
| --- | --- |
| `core/` | 遊戲引擎與共用型別 |
| `content/` | 內建遊戲內容與素材 |
| `web/` | React 前端與 Editor |
| `server/` | Bun HTTP API、PostgreSQL 與 S3 存取 |
| `scripts/` | 開發、建置與檢查腳本 |
| `tests/` | 自動化測試 |
| `dist/` | 建置輸出 |

授權與第三方素材說明請參閱 [NOTICE.md](NOTICE.md)。
