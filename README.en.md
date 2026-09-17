# Makein Renai ADV

**Languages:** [繁體中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

This project is a romance adventure (ADV) game and its content editor. The game and the Editor share port **9487**.

> **Unofficial, non-commercial fan project**: This project is not for any commercial purpose. It is made purely by fans who love *Too Many Losing Heroines!* (*Makeine*) as a way to express their appreciation for the work through sharing and creation. This project respects the original work, its author, and all rightsholders, and encourages everyone to support the original author and the official releases by purchasing the legitimate copies. This project is intended solely for personal research, study, fan exchange, and non-commercial entertainment. It must not be used for profit, advertising, paid services, crowdfunding rewards, resale, commercial operation, or any other use that is expected to bring commercial benefit. This project has no partnership, license, or endorsement relationship with the original author, the publisher, the anime production committee, or any other rightsholders.

- Game: http://localhost:9487/
- Editor: http://localhost:9487/editor

## License and Usage Restrictions

This project is licensed under the **PolyForm Noncommercial License 1.0.0**. It is a "source-available" **non-commercial** license, **not** the MIT License, and **not** an OSI-approved open-source license.

- Original code whose copyright is owned by the author may be used, studied, modified, and distributed for the non-commercial purposes specified in the [LICENSE](LICENSE).
- The code or modified versions must not be used in commercial products, paid services, advertising-backed monetization, internal commercial projects, or any use with an anticipated commercial application; a commercial license requires separate written consent from the author.
- Characters, names, stories, settings, official artwork, anime stills, novel illustrations, logos, trademarks, and other third-party material from the original work do not belong to the author and are **not licensed to you by this project's LICENSE**. Their rights remain with their respective rightsholders.
- The "fan project" and "non-commercial" labels describe the author's own restrictions on the code the author created; they do not mean the rightsholders have consented to publication, reproduction, adaptation, or distribution of the relevant IP material.
- Before forking or submitting contributions, confirm that you hold the necessary rights to the new content. Do not submit unauthorized third-party images, audio, text, or other material.

Please refer to [NOTICE.md](NOTICE.md) for the full source credits and rights statements. If you are not sure whether a use is commercial, stop and obtain written permission from the author first.

## Storage Architecture

- Game progress, saves, character memory, and service settings: PostgreSQL
- Generated and uploaded images: S3 (Docker uses SeaweedFS to provide an S3-compatible service)
- Browser cookies: only used to identify the player; actual game data is not stored in the browser

The production Docker and development environments use different databases, S3 ports, buckets, and Docker volumes; they never share data.

## Production: Full Docker

Full Docker starts the App, PostgreSQL, and S3 together. Inside Docker, the App connects directly to PostgreSQL and S3.

### First Launch

Install and start Docker Desktop first, then run this in the project root:

```sh
docker compose up -d --build
```

Wait for the health checks:

```sh
docker compose ps
```

Once `postgres` and `s3` show `healthy` and `app` shows `Up`, open http://localhost:9487/.

### Viewing Logs

```sh
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f s3
```

Pressing `Ctrl+C` only exits the log view; it does not stop the services.

### Stopping and Restarting

```sh
# Stop containers but keep PostgreSQL and S3 data
docker compose stop

# Start again
docker compose start

# Stop and remove containers but still keep data volumes
docker compose down

# Rebuild and start the latest code
docker compose up -d --build
```

All three services use `restart: unless-stopped`. After a reboot with Docker Desktop started, they recover automatically; if you stopped the services manually, run `docker compose up -d`.

> Warning: `docker compose down -v` deletes the production PostgreSQL and S3 volumes, along with all game progress, settings, and images. Do not add `-v` for a normal stop.

### Production Ports and Data

| Service | Host port | Docker volume |
| --- | ---: | --- |
| App | 9487 | — |
| PostgreSQL | 5438 | `adv_postgres_data` |
| S3 | 8333 | `adv_s3_data` |

Inside Docker the App uses `postgres:5432` and `s3:8333`; it does not go through the host ports.

## Development: Local App + Dedicated dev PostgreSQL/S3

In development mode, only PostgreSQL and S3 run in Docker; the App is started locally with `npm run dev`. Development data uses the `makein-dev` Compose project and dedicated volumes, and never reads or writes the production Docker data.

### 1. Install Dependencies

You need Node.js, npm, [Bun 1.3+](https://bun.com/docs/installation), and Docker Desktop.

```sh
npm ci
npm ci --prefix web
```

### 2. Create the Development Environment File

Windows PowerShell:

```powershell
Copy-Item .env.development.example .env.development
```

macOS/Linux:

```sh
cp .env.development.example .env.development
```

If you need LLM or Stable Diffusion, edit `.env.development`. This file is git-ignored, so no keys are committed.

### 3. Start the Dedicated dev Base Services

```sh
docker compose -f compose.dev.yaml up -d
docker compose -f compose.dev.yaml ps
```

Confirm that both `postgres-dev` and `s3-dev` show `healthy`.

### 4. Start the Development Server

```sh
npm run dev -- --env-file .env.development
```

The development build is at http://localhost:9487/. If the production App is already using 9487, stop it first with `docker compose stop app`; after development you can restore it with `docker compose start app`.

### 5. Stop the dev Base Services

```sh
# Stop and remove dev containers, keeping dev data
docker compose -f compose.dev.yaml down

# Start again, reusing the existing dev data
docker compose -f compose.dev.yaml up -d
```

Only when you are sure you want to clear all development data:

```sh
docker compose -f compose.dev.yaml down -v
```

This only deletes the dev volumes; it does not affect the production PostgreSQL/S3.

### dev and Production Data Isolation

| Service | Production | Development | Test |
| --- | --- | --- | --- |
| PostgreSQL host port | 5438 | 5439 | 5450 |
| PostgreSQL database | `MAKEIN_DB` | `MAKEIN_DEV_DB` | `MAKEIN_TEST_DB` |
| PostgreSQL volume | `adv_postgres_data` | `makein-dev_dev_postgres_data` | `makein-test_test_postgres_data` |
| S3 host port | 8333 | 8334 | — (no S3 in tests) |
| S3 bucket | `makein-s3` | `makein-dev-s3` | — |
| S3 volume | `adv_s3_data` | `makein-dev_dev_s3_data` | — |

The three environments use different Compose projects (`adv` / `makein-dev` / `makein-test`), data volumes, databases, and networks, and their host ports do not overlap at all, so they can coexist without interfering. For the full startup procedure, connection info, isolation principles, and cross-platform notes, see [Environment Separation](docs/environments.md).

## API and Editor Configuration

LLM uses an OpenAI-compatible Chat Completions URL, API key, and model. Stable Diffusion uses an A1111-compatible API. You can provide initial values in `.env` / `.env.development`, or save them from the Editor; the settings saved from the Editor are written to the PostgreSQL connected by the current environment.

Keys are only used on the server side and are never sent back to the game frontend or written into game content. Production and dev use different databases, so the API, Stable Diffusion, and Editor settings on each side are independent.

### Recommended Stable Diffusion Resources

This project uses an [AUTOMATIC1111 Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui)-compatible API. The initial setup defaults to **Pony**; if the database already has a setting, the original choice is kept and is not overwritten automatically. The checkpoint and LoRA must be from a compatible model family; please read the license, usage restrictions, and recommended parameters on each download page yourself.

- Pony recommended model: [Zuki Clean Anime Mix](https://civitai.com/models/880541/zuki-clean-anime-mix)
- Illustrious recommended model: [Nova Anime XL](https://civitai.com/models/376130/nova-anime-xl?modelVersionId=2940478)
- Recommended LoRA creators: [Ibukimakisiko](https://civitai.com/user/Ibukimakisiko), [nochekaiser881](https://civitai.com/user/nochekaiser881), [soralz](https://civitai.com/user/soralz)

The links above are only recommendations to help users find compatible resources; they do not imply a partnership, license, or endorsement relationship between this project and the related creators or platforms. The models and LoRAs are also not distributed with this project.

## Acknowledgment to the Original Work

Everything wonderful about *Too Many Losing Heroines!* comes from the original author, Takibi Amamori, the character designer, Imigimuru, and the publisher, the anime production team, and everyone involved in the original work and its official expansions. Without them, there would be no such wonderful original. This project is just an unofficial, non-commercial fan work made out of love; it never claims to have created or to own the original characters, world, or achievements.

- Original author Takibi Amamori: [X (@amamori_takibi)](https://x.com/amamori_takibi)
- [Official special site (Gagaga Bunko / Shogakukan)](https://gagagabunko.jp/special/makeine/)
- [TV anime official website](https://makeine-anime.com/)

The author earns nothing from this project and has no commercial team or resources; making the game is simply driven by love for the work. If any rightsholder believes the content of this project is offensive or touches their rights, please notify us through the project's contact methods and point out the specific content. The author will cooperate to remove or fix it, and if necessary, take down the repository. This statement is a good-faith contact and handling mechanism; it does not imply that a license has been obtained, and it does not restrict any rightsholder's rights under the law.

The Editor can modify character data, prompts, character art, scenes, events, affection, and CG. Uploaded or generated images are written to the S3 bucket specified for the current environment, not back into the Git working directory.

## Game Data and the Browser

The player cookie is the identifier for the game record in PostgreSQL. Clearing the cookie creates a new player's progress, but does not delete the old record in the database. When the same browser keeps the cookie, refreshing, restarting the App, or restarting Docker will load the same progress.

The project includes character dialogue, LINE, per-character memory, affection, auto-save, a six-slot manual save, event review, and CG. For content and asset licensing, see [NOTICE.md](NOTICE.md); for character settings, see [content/CHARACTERS.md](content/CHARACTERS.md).

For the design of the background jobs and the requestId deduplication mechanism, see [DeepSeek Harness comparison](docs/deepseek-harness-review.md). For the AI payload, validation strategy, and image asset rules, see the [development guide](docs/development-guide.md).

## Tests and Build

```sh
npm run check
npm test
npm run build
```

> `npm test` (= `bun test --timeout=40000 ./tests`) requires a running PostgreSQL test database (`docker compose -f compose.test.yaml up -d`, host port 5450); `tests/bootstrap.ts` reads `MAKEIN_TEST_DATABASE_URL` to connect. If the test database is not started, start it before running the tests.

## Project Structure

| Directory | Purpose |
| --- | --- |
| `core/` | Game engine and shared types |
| `content/` | Built-in game content and assets |
| `web/` | React frontend and Editor |
| `server/` | Bun HTTP API, PostgreSQL and S3 access |
| `scripts/` | Development, build, and check scripts |
| `tests/` | Automated tests |
| `dist/` | Build output |

For licenses and third-party asset notices, see [NOTICE.md](NOTICE.md).