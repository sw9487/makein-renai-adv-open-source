# Stable Diffusion Optional Plugin

**Languages:** [繁體中文](../zh-TW/stable-diffusion.md) · [English](stable-diffusion.md) · [日本語](../ja/stable-diffusion.md)

Go to Editor → System Settings and enable it in the Stable Diffusion card. It is off by default and does not connect or require a generative image service at startup.

Set the root URL of a local or online **AUTOMATIC1111-compatible API**, or fill in the full `/sdapi/v1/txt2img` path. Supports reverse-proxy path prefixes and an optional Bearer API Key. Third parties must provide the same request/response format; proprietary APIs from other providers require an adapter. The local WebUI must be started with `--api`; the game will not start the WebUI for you.

The `.env` variables `SD_ENABLED=false`, `SD_AUTO_STORY=false`, `SD_API_URL`, and `SD_API_KEY` can also be used. Settings saved in the Editor take precedence and apply on the next operation; environment variables require a restart. A blank key is preserved; press "Clear saved key" and then save to remove it, and it will not be returned to the game page.

Once enabled, manual mode shows "Generate story image" on the story stage. In auto mode, after story operations and in-person dialogue, the LLM decides whether to call `generate_image`. LINE may decide whether to send a photo based on the dialogue semantics, character personality, affection, and memory, or may not send one at all; it is not triggered by text keywords. LINE's decision and the generated image result are handed to the original character reply flow, and after success the photo is saved alongside the message.

The image tools are `generate_image` (characters and legitimate character LoRAs), `generate_object_image` (objects without people), and `generate_scene_image` (scenery/places without people). Objects and scenery each get their own positive/negative composition tags and exclude character LoRAs; LINE and new Twitter posts can use the applicable types, while Twitter replies provide no image tool at all. The decisions, tag cleaning, and final validation are in `server/stable-diffusion.ts`, `server/image-art-direction.ts`, and `server/twitter.ts`; you cannot disable a capability by only claiming so in a prompt.

The generation settings must select **Illustrious/Pony** and fill in the matching full checkpoint name. Switching the type clears the checkpoint and resets the character guidelines and recommended parameters; after saving, the settings apply to manual, auto story CG, and LINE. Older configurations that did not specify a type are migrated to Illustrious, adopting the new guidelines and parameters while retaining the service connection settings.

| Type | Recommended Model | LoRA ZIP | Install Location |
| --- | --- | --- | --- |
| Illustrious | [Nova Anime XL specified version](https://civitai.com/models/376130/nova-anime-xl?modelVersionId=2940478) | [Download](https://drive.google.com/file/d/12ZHjS8oQO713GPZcgMWFlRPznA0sLkdT/view?usp=sharing) | `models/Lora/Illustrious/` |
| Pony | [Zuki Clean Anime Mix](https://civitai.com/models/880541/zuki-clean-anime-mix) | [Download](https://drive.google.com/file/d/1cigyuhvk15DhxPyDLSlp8abTpxA6sQIr/view?usp=sharing) | `models/Lora/Pony/` |

After extracting the ZIP, keep the character subfolder and file names; if a Lora/type folder already exists, merge same-named directories. The game reads the actual names via `/sdapi/v1/loras`, and only allows selecting LoRAs inside the specified type folder. If two types have identically named files, add a type prefix, rename, and refresh the WebUI to avoid the WebUI loading the wrong LoRA. Third-party APIs must also provide this list with `name` and `path`.

| Type | Steps | CFG | Clip skip | Hires multiplier | Denoising |
| --- | --- | --- | --- | --- | --- |
| Illustrious | 25 | 5 | 2 | 2 | 0.7 |
| Pony | 30 | 6 | 2 | 1.5 | 0.45 |

Both default to Euler a and the Automatic scheduler, enable Hires.fix, and use R-ESRGAN 4x+ Anime6B; Hires steps 0 means reusing the main sampling steps. Illustrious picks defaults per its documentation of 20–30 steps, CFG 4–6, Clip skip 1–2, denoising 0.65–0.8; Pony per its documentation of 30 steps, CFG 6, 1.5–2x and denoising 0.4–0.5. The Pony documentation does not specify a sampler, scheduler, clip skip, or upscaler, so these are adjustable project defaults.

`core/sd-profiles.ts` has the positive/negative bases of the two model documents and each character's trigger words built in; it is updated by `bun scripts/update-sd-profiles.mjs`, and deployment does not need to read the Markdown. Illustrious uses the masterpiece/quality tags from the document and the BREAK lighting suffix; Pony uses `score_9, score_8_up, score_7_up, source_anime`, and the negative uses the corresponding document's score_6/5/4 and other tags. The server removes LLM-duplicated or cross-model quality prefixes, then applies the selected model base. Model-specific trigger words for characters such as Karen, Tiara, and Kazuhiko switch with the guidelines. The UI can preview the positive/negative bases and re-apply the recommended parameters and guidelines.

The prompt rules live in `server/image-art-direction.ts`. The LLM generates comma-separated English tags and character/outfit trigger words according to the selected model's guidelines; it does not use plain sentences and has no minimum word count. Scenes select tags in the order of characters, appearance/outfit, action/expression, single camera angle, environment, and lighting; composition instructions should not be copied into the SD prompt.

The parameters and character guidelines this time are based on the root `Illustrious - makein-renai-stable-diffusion.md` and `Pony - makein-renai-stable-diffusion.md`. Image-output comparison with a fixed seed has not yet been done against actual checkpoints.

Story CG emphasizes narrative action, background depth, and the blank space for the bottom dialogue box; LINE images use a natural lifestyle-photo composition, but still keep a 2D illustration style and do not draw a chat interface. Prompt changes only affect newly generated images. Actual image quality still needs to be confirmed by the results produced with the in-use checkpoint and LoRA.

The backend is responsible for calling the LLM and forwarding image generation; the browser does not directly touch the upstream key. At most one image per request and at most one generation request at a time. Images are stored in the existing asset storage and served via `/api/media/`; story images persist with the save, and LINE images persist with the message. If the service is offline or returns a malformed format, it only shows an "image incomplete" prompt and does not block the text story or dialogue submission.

Manual generation uses a backend job; the frontend keeps polling until completion or until the service reports a failure, with no SD generation time limit. While generating, you cannot end the current story stage or resubmit generation, but you can still read the existing dialogue text, and LINE can send messages independently. Refreshing resumes waiting; a temporarily disconnected poll does not cancel the job. Updating an image does not replay the scene transition, reset the reading page, or reset the typewriter progress. Job tracking still has in-process state, so restarting the main project may interrupt the current job; please avoid restarting during generation.

A Twitter image-and-text main post first enters a pending-image state visible only to the author; it is published to others only after the image is complete. On failure or interruption, the text is kept and you can press "Retry image" on the original post; success updates the same post without force-regenerating the NPC reply. While the image job is running, replies, likes, and reposts on that post are not operable. Regression tests live in `tests/stable-diffusion.test.ts` and `tests/twitter.test.ts`.

If SD reports `NansException`, it means the model computation produced invalid values, not a successful image generation. You can first enable SD's `Upcast cross attention layer to float32`; if it still fails, start with `--api --no-half`. Do not replace fixing the computation problem by turning off the NaN check.