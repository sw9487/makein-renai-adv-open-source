# Development Guide

**Languages:** [繁體中文](../zh-TW/development-guide.md) · [English](development-guide.md) · [日本語](../ja/development-guide.md)

This project treats "minimal capabilities, minimal data, server-side final verification" as the basic rules for all AI API integrations. These rules are not prompt suggestions but requirements on the payload and program structure.

## Local Development and Real Data

From the project root, run `npm ci`, `npm ci --prefix web`, then use `npm run dev` (default 9487) to start the development server. The frontend is bundled by `vite build` into `dist/client` and served by the server on 9487. `package.json` lists the full check commands. The development database, uploads, and keys are not version-control content; content saved by the Editor is written only to the local player data directory. Do not point tests or real-device diagnostics at player saves.

> The development environment uses `compose.dev.yaml` (postgres-dev 5439, s3-dev 8334), with the server running Bun locally; it is fully independent from the production (`compose.yaml`) and test (`compose.test.yaml`) containers, data volumes, databases, and networks, with no mutual interference. For the full startup method and isolation comparison, see [Environment Separation](environments.md). SQLite has been removed, so postgres-dev must be started before development.

## LLM Payload Rules

1. **Do not write into the payload capabilities that are not allowed.** If a situation cannot generate images, cannot search, or cannot operate on a certain type of data, do not provide the corresponding tool, tool parameters, images, or context. Do not substitute "still provide the capability, then use a prompt to tell the model not to use it" for structural restrictions.
2. **Send only the data needed for this decision.** When selecting a Twitter reply target, send only text data; once the target is determined, send that target's single image in a separate request. Do not feed all the images of candidate posts or comments into the model at once.
3. **Assemble the schema according to the situation.** General Twitter actions use a text tool without an image field; only new image-text posts provide a separate image-post tool. Fixed actions keep only the fields and enums that action actually needs.
4. **Use separate requests for independent data.** When translating JSON, each translatable field is its own API request; limited concurrency is allowed, but you must not merge fields, omit paths, or let the model reconstruct the entire configuration.
5. **Media is high-cost by default.** Images, audio, and large historical content are included only when the target is selected and actually needed, at the lowest quality and smallest quantity sufficient to complete the task.

## Verification and Failure Strategy

- JSON schema's `additionalProperties` should be set to `false`; tool returns must still be parsed, permission-verified, and re-checked against the current state by the server.
- The prompt is responsible only for semantics and quality, not security boundaries or capability disabling; capability boundaries are guaranteed by the payload and server program.
- Paid or non-repeatable requests complete local validation before being sent. When state has changed, discard stale results and do not write expired results back.
- If a batch operation requires integrity, collect all results first and apply them all at once after everything succeeds; a mid-way failure must not leave a half-applied dataset.
- Game operations carry `runId`, `requestId`, and the necessary revision checks; the target must be re-checked again when the model or image finishes. Non-idempotent external requests with unknown results should not be blindly resent. Persistent requests and events are in `server/harness-request.ts` and `server/harness-events.ts`; Twitter additionally records operation deduplication in its own API.
- Public/private community visibility, character memory, and the full work log are separate boundaries; a general game snapshot must not directly leak raw Twitter data. Tool actions across LINE/Twitter/story need to track the actor and source clearly, and must not mislabel community events as the player speaking.

## Testing Requirements

Changes involving LLM payloads should test at least:

- Disallowed tools or fields truly do not exist, not merely being `false`.
- Images are not included before a target is selected; after selection, only the corresponding single image is included.
- When the model returns over-privileged actions, extra capabilities, or expired targets, the server refuses to apply them.
- Fully run `bun run check`, `bun run audit:i18n`, `bun run test`, and `bun run build`.

> Test environment: tests depend on a PostgreSQL test database (see `compose.test.yaml`, local port 5450), connected by `tests/bootstrap.ts` via `MAKEIN_TEST_DATABASE_URL` (default `postgresql://admin:105114@127.0.0.1:5450/MAKEIN_TEST_DB`). `bun run test` already includes `--timeout=40000` — because postgres.js is slow and connection-desync recovery makes cases such as web-search exceed Bun's default 5 seconds; running `bun test ./tests` directly does not carry this argument (Bun 1.3.14 ignores `bunfig.toml [test].timeout`). Before repeating tests, you can run `bun scripts/drop-test-schemas.ts` to clear accumulated test schemas.

Content event or map updates additionally run the corresponding `tests/canon-events.test.ts`, `tests/novel-events.test.ts`, `tests/mainline-continuation.test.ts`, `tests/momozono.test.ts`; community, image, knowledge, and search have their own same-named tests. Live audits against external real APIs may consume credits and should be run with an isolated save and only explicitly on demand; mock tests passing does not mean all model writing quality or SD image quality has been visually verified.

## Image Asset Locations

- `content/assets/`: character sprites, avatars, scenes, event CG, and official game content manageable through the Editor's asset library.
- `web/public/assets/`: fixed UI / brand icons and frontend system assets such as AI capability checks, for example LINE and Twitter icons and `check img.png`.
- `web/public/favicon.svg`: the site favicon, kept in the public root according to the Vite public-file convention.
- Player-uploaded and generated images are stored in the player data directory's `uploads/` and must not be written back into official content assets.

Before adding an image, first decide whether it belongs to game content or system UI; assets of the same type must be placed in the same location, and the program references, asset records, and license/source notes must be updated in sync.

Built-in scenes and official-location images retain their original PNGs, alongside a same-name JPEG display version at quality 88; `web/lib/scene-images.ts` switches only the listed built-in scenes to the display version, and player-uploaded assets are not rewritten. When updating these original images, you must also regenerate the same-name JPEG and maintain the file's list in sync. The transition black screen waits for the next background and character sprite to finish decoding; each load attempt has a 30-second safety cap, falling back to the original image if the display version fails. The author asset route provides a one-hour cache and ETag, and the browser re-validates after asset content updates.

## Content Upgrades and Stable Identifiers

`core/story.ts::upgradeStories` handles, in order: existing text patches, character story fixes, Volumes 1–3 material, Volumes 4–9 import, Momozono Junior High, mainline continuation, novel bibliography, and the public-places pack. Each pack is added once via the `storyPacks` flag and thereafter should preserve the Editor's deletions/edits; before adding an event or location, check prerequisites, dates, grade, scene images, and old-save paths.

Event IDs, location IDs, character IDs, and community account IDs are persistent references, not just UI strings. When renaming, sync the author content, in-progress location / pending dates, the relationship table, post authors / mentions, and tests; you must not only change the display name or @handle. The existing `gusto-kaimei` → `gusto-hashira` location fix can be referenced in `core/official-places.ts`; new migrations should explicitly protect existing player data.

Feature details are entered from the [documentation index](README.md); if this document conflicts with historical research notes, give priority to the current source code and tests.