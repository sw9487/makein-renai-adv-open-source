# Environment Separation: Production, Development, and Test

**Languages:** [繁體中文](../zh-TW/environments.md) · [English](environments.md) · [日本語](../ja/environments.md)

This project stores its data in PostgreSQL (SQLite has been removed), and divides the environment into three independent Docker Compose projects that neither share nor interfere with one another. Below are the startup method, connection information, and isolation principles for each environment.

## Overview of the Three Environments

| | Production | Development (dev) | Test |
| --- | --- | --- | --- |
| Compose file | `compose.yaml` | `compose.dev.yaml` | `compose.test.yaml` |
| Compose project name | `adv` | `makein-dev` | `makein-test` |
| Provided services | postgres, s3, app | postgres-dev, s3-dev | postgres-test |
| app / server | Inside Docker (the `app` service, running Bun) | Runs on the local machine with Bun (`bun scripts/dev.mjs`) | (None; launched embedded by `bun test`) |
| Default address | http://localhost:9487/ | http://localhost:9487/ | — |

The three Compose files each have a different `name`, host ports, data volumes, network, and database name, so they can coexist and each be started and stopped independently without contaminating one another or fighting over ports.

## Per-Environment Details

### Production

- **Compose file**: `compose.yaml` (project name `adv`)
- **Services**: `postgres`, `s3`, `app`
- **Host port mappings**:
  - `app` → host `9487`
  - `postgres` → host `5438` (deliberately avoiding 5432)
  - `s3` → host `8333`
- **Database**: `MAKEIN_DB` (user admin)
- **Data volumes**: `adv_postgres_data`, `adv_s3_data`
- **Internal network**: `adv_default`
- **Connections inside the app container** (Docker internal hostnames):
  - `DATABASE_URL=postgresql://admin:105114@postgres:5432/MAKEIN_DB`
  - `S3_ENDPOINT=http://s3:8333`
  - `S3_BUCKET=makein-s3`

Start / stop:

```sh
docker compose up -d --build   # build and start the production build
docker compose ps
docker compose logs -f app
docker compose stop            # stop (data preserved)
docker compose start           # start again
docker compose down            # remove containers (data volumes preserved)
docker compose down -v         # ⚠️ deletes production PostgreSQL/S3 data; do not run carelessly
```

> The production build uses `compose.yaml` (project `adv`); `docker compose up` (without `-f`) defaults to it.

### Development (dev)

- **Compose file**: `compose.dev.yaml` (project name `makein-dev`)
- **Provided services**: `postgres-dev`, `s3-dev` (**does not include app**; the development server runs on the local machine)
- **Host port mappings**:
  - `postgres-dev` → host `5439`
  - `s3-dev` → host `8334`
- **Database**: `MAKEIN_DEV_DB` (user admin)
- **Data volumes**: `makein-dev_dev_postgres_data`, `makein-dev_dev_s3_data`
- **Internal network**: `makein-dev_default`
- **Local server connections** (the development server runs on the host, through `127.0.0.1`):
  - `DATABASE_URL=postgresql://admin:105114@127.0.0.1:5439/MAKEIN_DEV_DB`
  - `S3_ENDPOINT=http://127.0.0.1:8334`
  - `S3_BUCKET=makein-dev-s3`

Start the dev base services + development server:

```sh
cp .env.development.example .env.development   # first time: create the dev environment variables
docker compose -f compose.dev.yaml up -d       # start postgres-dev / s3-dev
docker compose -f compose.dev.yaml ps          # confirm both are healthy
npm run dev -- --env-file .env.development     # start the development server on the host (Bun)
```

- Development address: http://localhost:9487/ .
- `.env.development` is Git-ignored, so secrets are not committed; if needed, fill in the LLM / Stable Diffusion settings following `.env.development.example`.
- If the production app is already occupying `9487`, the development server will be unable to bind; run `docker compose stop app` first, then `docker compose start app` when done.

Stop / clear (only affects dev):

```sh
docker compose -f compose.dev.yaml down        # preserve dev data
docker compose -f compose.dev.yaml down -v     # ⚠️ only clears the dev data volumes; does not affect production
```

> **⚠️ SQLite has been removed**: the development environment now **must** have `postgres-dev` running first; if `DATABASE_URL` is not set, the development server will error out directly. It can no longer be started "from scratch".

### Test

- **Compose file**: `compose.test.yaml` (project name `makein-test`)
- **Provided services**: `postgres-test` (no s3, no app)
- **Host port mapping**: `postgres-test` → host `5450`
- **Database**: `MAKEIN_TEST_DB` (user admin)
- **Data volumes**: `makein-test_test_postgres_data`
- **Internal network**: `makein-test_default`
- Additional mount of `docker/test-init.sql` as the initialization script
- **Test connection** (`tests/bootstrap.ts`): `postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB`

Create the test database and run the tests:

```sh
docker compose -f compose.test.yaml up -d
bun scripts/drop-test-schemas.ts   # before each full test run, drop accumulated test schemas
bun run test                       # = bun test --timeout=40000 ./tests
```

- The tests only target schemas named `t_<hash>` inside `MAKEIN_TEST_DB`, which are cleaned up by `drop-test-schemas.ts`; they **never touch production `MAKEIN_DB` or development `MAKEIN_DEV_DB`**.
- The tests depend on the test container running; running them before it is up will fail (this is "a requirement", not an effect of production/development).

## Isolation Principles (Why They Do Not Interfere)

1. **Different Compose project names**: `adv` / `makein-dev` / `makein-test`; containers, networks, and data volumes are each named separately, and `docker compose up` (default) only manages production, never touching dev/test.
2. **Zero overlap in host ports**: production 5438/8333/9487, dev 5439/8334, test 5450.
3. **Different data volumes**: the three postgres instances each use their own named volumes, so their data cannot contaminate each other.
4. **Network isolation**: the production app uses the internal hostname `postgres:5432`, which only resolves within `adv_default`, and cannot reach the dev/test postgres instances.
5. **Independent databases and settings**: `MAKEIN_DB` / `MAKEIN_DEV_DB` / `MAKEIN_TEST_DB` are each independent; the API components saved by the Editor, Stable Diffusion, and settings are written only to the PostgreSQL that the environment connects to, so the two sides do not affect each other.

## Cross-Platform (Win / macOS / Linux)

- **Architecturally platform-neutral and runs anywhere**: all services are containers (`postgres:17-alpine`, `oven/bun`, `node:22-alpine`, all multi-arch), and Bun/Node are themselves cross-platform; development connections go through env / `.env`, with no OS-specific paths or commands.
- **Apple Silicon (arm64)**: `chrislusf/seaweedfs:latest` is mostly an amd64 image; on M-chip Macs it runs under Docker Desktop emulation (usable but slower). `postgres:17-alpine`, `node:22-alpine`, and `oven/bun` have no such limitation.
- **Prerequisite infrastructure for development**: because SQLite has been removed, any platform must start PostgreSQL first to develop (dev uses port 5439 in `compose.dev.yaml`). This is a consistent requirement after the SQLite removal, not a platform limitation.

## Frequently Asked Questions

- **Q: Do development and production interfere with each other?**
  No. They are separate Compose projects, data volumes, databases, and networks, and their ports do not overlap; the data and Editor settings are fully independent.
- **Q: Will running `bun test` damage my production or development data?**
  No. The tests only connect to the test database `MAKEIN_TEST_DB` and only operate on `t_<hash>` schemas.
- **Q: Why can't dev start now?**
  SQLite has been removed; dev requires `docker compose -f compose.dev.yaml up -d` first so that `postgres-dev` is up, and `DATABASE_URL` must point to `127.0.0.1:5439/MAKEIN_DEV_DB`.