# LLM Settings, Game Entry and Editor Translation

**Languages:** [繁體中文](../zh-TW/ai-editor.md) · [English](ai-editor.md) · [日本語](../ja/ai-editor.md)

The LLM is not an optional plug-in. Story, choices, character dialogue, LINE, Twitter and a number of image decisions all share the OpenAI-compatible Chat Completions service configured by the player. The API URL, Key and model can be supplied through environment variables, but settings already saved in the Editor take priority; the key only ever stays on the server.

## Validation is split into two layers

1. Game entry and Editor readiness: `server/ai-status.ts` converts the configured URL into `/v1/models` and confirms that the response list contains the current model. If this does not succeed, the player cannot skip ahead into the game; the Editor's "Return to game" and the four one-click translation buttons are disabled, and a direction to fix the settings is shown. This is a connection/model-existence check and does not re-run the VLM.
2. Editor "Save AI settings": `server/editor-api.ts` makes a single multimodal request using `web/public/assets/check img.png`, asking the model to answer the image's gender via a `report_gender` tool call; the settings are only saved if it returns `girl`. Players should choose a model that supports both image recognition and tool calls. After updating the URL, key or model, the settings must be re-saved and re-validated.

The entry points are `web/components/game-entry.tsx` and `web/components/editor.tsx` respectively; the status endpoint is `GET /api/ai-status`. Do not mistakenly treat a successful `/v1/models` response as verification of image or tool capability; and do not put the expensive image test into every game entry check.

## Editor one-click translation

Character settings, scenes and encounters, event scripts and the asset book library each have a one-click translation. On the front end, `translationFields` lists the translatable text by JSON path, with one `translate-field` API request per field, running concurrently with a limited worker pool; the server restricts the section/path/language and returns a single translation of the same path via a `translate_field` tool call. The model must not be allowed to reassemble the whole JSON, change IDs or omit fields.

During translation the completed/total count, percentage and a progress bar are shown; leaving the Editor, switching language, switching page and changing AI settings are all blocked. The front end first collects results on a content copy and only applies and marks them as pending-save once everything is complete; a failure must not leave a partial set of content behind. The supported target languages are determined by the allowlist in `server/editor-api.ts`. Regression tests: `tests/ai-status.test.ts`, `tests/editor-ai.test.ts`, `tests/i18n.test.ts`.

External model capability, translation fidelity and naming conventions cannot be guaranteed by schema alone; long text and fields with placeholders need to be spot-checked by a human.