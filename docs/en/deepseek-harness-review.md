# DeepSeek Harness Comparison and Optimization Plan

**Languages:** [繁體中文](../zh-TW/deepseek-harness-review.md) · [English](deepseek-harness-review.md) · [日本語](../ja/deepseek-harness-review.md)

This document preserves the research from 2026-09-10 and the implementation proposal that was current at the time; **the "not yet available / recommended to add" sections in sections 1–5 are a snapshot from that time, not a description of the latest runtime**. To read the current state, first see "The First Version of Harness Already Implemented" at the end of this document and [開發指南](development-guide.md), then cross-check `server/harness-request.ts`, `server/harness-events.ts`, `server/tool-registry.ts`, `server/model-runtime.ts`, `server/memory-view.ts`.

Original review date: 2026-09-10. Compared against the official source commit `b2e3b2a0125854567a4a5fcba75782e42fe84901`. dsh was not installed or executed, nor was this game's runtime replaced.

Official project: https://github.com/deepseek-ai/deepseek-harness

## Conclusion

It is worth borrowing from its request identity, durable events, tool execution contract, model adaptation, and context-organization approach. First implement these incrementally on the existing Bun/SQLite, without introducing the entire Cordis plugin tree. The official README explicitly marks it as a developer preview, so there may be incompatible changes.

Constraints retained: SD/search can be disabled; LINE and story are independent; the LLM decides whether to call tools; no new API time limit; game data separated from publishable content. Do not treat the Harness's timeoutMs option as a policy the game must adopt.

## 1. Add request identity across retries first

Upstream basis: the requestId/rpcId, pending submission, and existing acceptance-reuse contract in `packages/api/session-controller/README.md`.

This game already has frontend button locking, runId, and sceneRevision, but `server/game-api.ts` has no requestId deduplication. When a request completes but the response is lost in the network, a player retry is treated as another request.

Plan: the frontend creates a requestId on the first send and reuses the same ID on retries; SQLite keeps the input digest, work state, and result under a `(owner, runId, requestId)` unique constraint. A different input with the same ID is rejected; the same input with the same ID returns the original work or result. Game state updates and work-completion records go into the same transaction.

When an external SD does not support idempotency keys, cross-process-crash remote "exactly-once" cannot be guaranteed. When the remote result is unknown, mark it as unknown and keep the query and manual retry entry point; do not automatically resend.

Acceptance: two pages simultaneously send the same ID; retry after disconnection with a successful submission; same ID with different input; reading a savefile or starting a new game during generation; querying the original result after a process restart.

## 2. Use durable events to push LINE and work state

Upstream basis: durable Session events and transient Agent events in `docs/architecture.md`; follow, seq, and reconnect backfill in `packages/api/session-controller/README.md`.

This game already has a separate background LINE, unread state, and image-generation records, but the UI still polls every 1.5 seconds. `server/timings.ts` only keeps the last 100 in-process statistics and cannot reconstruct the full work history.

Plan: SQLite append-only events, each containing owner, runId, requestId, seq, type, payload. Use a single SSE channel to push events such as line.received, image.queued, image.started, image.completed; the client deduplicates by seq and, after a disconnect, resumes from the last cursor. Characters currently being output can be transient, but completed messages must be persisted first. When the cursor is too old, return a snapshot and reset the cursor.

Acceptance: reconnect backfill has no missing or duplicate messages, slow clients do not block generation, old events after reading a savefile do not pollute a new game, and receiving a message does not reset the typewriter. Record retention and event pagination must be considered; do not repeatedly place the full text of all memories into notifications.

## 3. Consolidate tool entry points into a small registry

Upstream basis: the schema, execute, canonical output, concurrency metadata, and cancellation contract in `docs/subsystems/tools.md` and `packages/core/tools/src/index.ts`.

Currently character, story, search, and SD each parse tool inputs separately. It is recommended to build a consistent tool definition: name, enable condition, input validation, result validation, execute, and whether it can safely run in parallel; domain rules remain in each module.

The tool list must contain only the functionality currently available. When SD is disabled, do not register image tools; nonexistent tools, bad arguments, service failure, player cancellation, and unknown results should be separated into distinguishable results. Only after a tool's execution result has been confirmed should it be claimed that an image was sent. Safe knowledge queries can run in parallel; the same SD service maintains a queue.

Acceptance: no network requests when the plugin is disabled; arbitrary LLM tool names/JSON do not corrupt state; the queue can continue after a failure; cancellation does not prematurely release work still running.

## 4. Add real context budgeting and traceable summaries

Upstream basis: pressure/context-overflow, source sequence numbers, summary-replacement transaction, and not replacing original content on failure in `docs/subsystems/compaction.md`.

Important memories already have dates and evidence, but the summary in `core/engine.ts::compactMemory` is still a string concatenation then tail truncation, and archive keeps only 200 entries. This is a limitation that remains after the previous improvement.

Plan: keep the original conversation events and produce a context view for the current request. Compute the budget from the available model capacity and estimated tokens, prioritizing character settings, the current date/time slot, recent full dialogs, and relevant important memories. Only lower-priority context is summarized; summaries carry source event IDs, versions, and coverage range, and replace the input view only after successful validation. If summarization fails, you can still fall back to the original records. Start with deterministic budget trimming and retrieval, then add LLM summarization.

Acceptance: cross-day memories are not mistaken for today; important agreements are traceable; summarization failure does not lose data; context overflow does not blindly resend the same over-long prompt; tool calls and their results are not split apart.

## 5. Model adaptation and structured errors

Upstream basis: the adapter, model context info, streaming vocabulary, and provider retry policy in `docs/subsystems/llm-streaming.md`; step/attempt/settlement in `docs/agent-lifecycle.md`.

Concentrate the scattered endpoint assembly, tool-call decoding, usage, finish_reason, and model errors into a shared adaptation layer. Keep the current OpenAI-compatible protocol for now and do not bind to DeepSeek models. The model list is a hint; do not block manual entry of unlisted models.

Distinguish: authentication/parameter errors, rate limiting, context overlong, output truncated, user cancellation, and unknown transfer results. Retries must conform to operation semantics and reuse requestId; do not conflate retry count, output token budget, and API timeout. Chain each step's duration with requestId, and avoid storing keys or unmasked headers.

## Recommended implementation order

1. requestId and work-state transactions, first eliminating duplicate side effects.
2. Durable events and SSE, replacing LINE polling and supporting backfill.
3. Tool registry and model adaptation, unifying the execution contract of existing modules.
4. Context budgeting, source retrieval, and summaries; additionally validate quality with long-play samples.

This is a design recommendation based on this game's code, not an applied feature, nor a claim that directly moving the upstream code in provides the above guarantees.

## The First Version of Harness Already Implemented

The following are subsequent implementation updates, replacing the "not yet implemented" status in the above proposal:

- `server/harness-request.ts`: persistent requestId, input digest, same-request merging, completed-result replay, and refusing automatic resend when the result is unknown. State submission and request settlement happen in the same SQLite transaction. Streaming observer disconnect does not cancel work already taken over.
- `server/harness-events.ts`: durable event sequence numbers, a single SSE, Last-Event-ID backfill, keeping the most recent 10000 events per player, and requesting snapshot sync when the cursor is too old. LINE no longer has fixed polling; manual images still keep the work-result query as a waiting/recognition mechanism.
- `server/tool-registry.ts`: image generation, knowledge reads, and active LINE share common input/result validation and execution entry. Character/story output retains the original dedicated validators to avoid weakening the speech, narration, and option rules.
- `server/model-runtime.ts`: chat, story, knowledge, search decisions, and image-generation decisions share the model transport and error classification; a tunable estimated budget defaulting to 65536 tokens, preserving the system and the current input, removing the entire old tool exchange, and not automatically retrying external requests.
- `server/memory-view.ts`: selects relevant important memories with source IDs for the model; original records moved out of the recent section are stored separately in the player's SQLite and do not disappear with prompt trimming. This version uses deterministic retrieval/trimming and does not claim to have completed LLM semantic summarization, nor treat estimates as the model's official tokenizer.
- Added `tests/harness.test.ts`, covering deduplication, conflicts, restart-with-unknown-result, atomic commit, savefile isolation, event replay, streaming disconnect, tool disablement, and model errors.

Compatibility: old clients without a requestId still work; new clients carry a requestId for all game operations. Remote SD work that cannot be confirmed after a server restart is not resent. Existing savefiles automatically pick up the new tables. The source code was implemented independently to this project's needs; no dsh runtime was moved in or started.

Still not claimed as complete: the official Harness's full plugin tree, the model's exact tokenizer, LLM semantic summarization, or external SD cross-process exactly-once. Tests are in `tests/harness.test.ts`; new features should first confirm whether their request settlement, event backfill, and data persistence actually follow these contracts, rather than only citing the recommendations in this research document.