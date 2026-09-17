# Twitter Technical Notes

**Languages:** [繁體中文](../zh-TW/Twitter技術說明.md) · [English](Twitter技術說明.md) · [日本語](../ja/Twitter技術說明.md)

Last checked: 2026-09-11. This is an in-game fictional community that does not connect to or publish to real Twitter. This document reflects the current program and is for developers tracking scheduling, tools, permissions, UI, and save behavior; it is not merely a list of intended features.

## 1. Modules and Data Ownership

| File | Responsibility |
| --- | --- |
| `core/twitter.ts` | Community types, default mutual follows, character community settings, read permissions, player-data projection, notification fingerprints, and online/typing state |
| `server/twitter.ts` | HTTP operations, LLM decisions, scheduling, submission deduplication, follow-back, image publishing, and Twitter → LINE reactions |
| `server/http.ts` | GET/POST/PATCH routes for `/api/twitter` |
| `server/proactive-line.ts` | Calls `startTwitterSlot` on game-slot submission and starts scheduling after success |
| `server/game-api.ts` | Resume scheduling, new story, and savefile-read lifecycle |
| `server/repository.ts`, `server/concurrent-state.ts` | Persistence, compare-and-swap, merging with other game operations |
| `server/stable-diffusion.ts` | Image tool parsing, object-only restriction, shared SD execution entry |
| `server/image-queue.ts`, `server/image-history.ts` | Image queue, image work records |
| `web/components/twitter-panel.tsx` | Home/Explore/Profile/Notifications/threads, operations, and polling |
| `twitter-account.tsx`, `twitter-typing.tsx`, `twitter-upload.tsx` | Avatar online green dot, typing animation, image-mount animation |
| `web/components/twitter.css` | Light/dark theme, layout, limited indentation, animations, and reduced-motion settings |
| `web/locales/{zh-TW,ja,en}.json` | Model instructions and added UI copy |

Official data lives in the current player's `GameState.twitter`, not in frontend temporary arrays. The LLM does not directly modify the database; it can only return tool parameters, which the backend re-validates and submits.

### Main Fields

- `accounts[id]`: handle, private; rebuilt from character settings. The player's private status is separately stored in `playerPrivate`, which takes priority over the character default.
- `following[actor][target]`: directed follow relationship; `true` counts as following. After an unfollow, a `false` may remain.
- `requests[target][applicant]`: pending follow requests for review; set to `false` after processing.
- `requestVersions[target][applicant]`: the UUID of each new application, not exposed to the frontend. Canceling and re-applying changes the version; resending the same not-yet-canceled application does not change the version. Old save files are backfilled with a stable legacy identifier.
- `posts[id]`: text, author, in-game date/slot, real sort time `created`, attached image, `replyTo`, likes, reposts.
- `jobs[id]`: actor, original date/slot, due, readable-candidate snapshot posts, status, trigger, error.
- `online`/`onlineSlot`: who is online this slot; finishing a job does not mean going offline.
- `npcInteractionLimit`/`npcInteractions[slot]`: NPC immediate-interaction quota, default 3, tunable 0–20.
- `follows`/`unfollows`: follow-back and unfollow reaction events; handled avoids duplicate processing.
- `threadSeen[actor][root]`: timestamps for offline catch-up of threads.
- `operations[requestId]`: player operation intents, preventing duplicate posts or double toggling from request resends.
- `typing`: computed only when projecting externally; not a separately persisted "fake typing" schedule.

`imageSession` is an internal identifier of the process/run the image-mount job belongs to and is not returned to the frontend. Internal states such as `jobs`, `operations`, follow/unfollow events, and interaction counters are also not given to the frontend; the UI only receives permission-filtered posts and the necessary community data.

## 2. Slot Start and Online Scheduling

```text
New story / advancing date or slot / GET fixes a missing roster
  → twitterState: initialize, default network, read character settings
  → startTwitterSlot: decide the online roster and save it
  → create base job + discovery job + optional catchup job per person
  → after save succeeds, resumeTwitter
  → at due time, runTwitterJob
  → fresh-state validation → LLM → fresh-state submit → wake other online characters
```

Candidates are all NPCs "who have appeared in game time", not limited to characters the player already knows; not yet appeared is not the same as not yet acquainted. Each person's base probability is multiplied by the low/medium/high activity weight 0.4/1/1.5, then fill up to at least 6 people, of whom at least 4 are already acquainted; if candidates are insufficient, take the actual count.

Ordinary jobs are delayed about 5–50 seconds; befriending jobs about 2 seconds; immediate reactions about 0.5–2 seconds, plus model and queue time. This is not a forced post every second. The slot roster, job IDs, and completion states are saved; when repairing an empty roster, first look for existing jobs to avoid resending completed same-slot jobs.

When the same character already has a running job, other jobs are deferred; different characters can run in parallel. `activeJobs` prevents the same process from re-scheduling the same timer. After a process restart, scheduled jobs resume; running jobs that lost their state are marked interrupted and are not automatically resent, as they may have been paid model requests. Pending jobs are no longer executed once the game has ended; progress that ends during a model wait also does not submit new community actions.

### Online Green Dot and Typing Animation

The right side "People you know" prioritizes showing online characters, with the green dot at the top-right of the avatar, and does not show "0 online". Reaching the interaction limit does not remove the green dot.

`twitterView` projects only the current slot's running, target-visible, character-acquainted, and online post/reply/catchup jobs into `typing: [{actor, postId}]`. The frontend shows the name and a three-dot animation under that post or comment, merging multiple people together. It is removed on completion, idle, like, repost, failure, interruption, or when permission disappears; it does not add extra delay to the request to perform the animation.

Since the model judges actions and generates text in the same request, "typing" means this content is being processed, not a guarantee that text will eventually be sent. When base autonomous browsing has no definite target yet, it does not arbitrarily attach typing state to some post. The panel polls every 1.5 seconds, skips when the page is hidden, and never overlaps a single poll. Very fast requests may not be caught by the screen. The animation respects `prefers-reduced-motion`.

## 3. LLM Tools and Social Decisions

The only community tool, `twitter_action`, must return exactly one legal tool call:

```json
{"action":"reply","target":"post or comment ID","text":"reply content","image":false}
```

| action | target | backend effect |
| --- | --- | --- |
| idle | empty string | no change to community content |
| post | empty string | create a main post |
| reply | the directly-replied message ID | create a new message with replyTo, without mistakenly hanging the comment on the root post |
| like | message ID | NPC marked as liked; player can toggle |
| repost | message ID | NPC marked as reposted; player can toggle; private threads refuse |
| follow/unfollow | account ID | public follows immediately, private sends request; or remove relationship/request |
| accept/decline | applicant ID | process an existing request sent to oneself |
| delete | own message ID | delete own main post or comment |

Text is at most 280 characters; post/reply cannot be blank; only post/reply can request an image. Model HTTP failure, truncation, wrong tool, multiple tools, illegal action, or an unread interaction target all do not submit. Permissions are re-checked at submission; data changes during LLM generation must not bypass limits.

The NPC payload includes the character prompt, immediate identity, date/slot, online roster, account data, followCandidates, existing follows and requests, affection toward the player, personal memories, and readable posts. Ordinary browsing uses candidate snapshots from job creation (at most 35 posts); reaction jobs with an explicit discussion target supply the root post and the whole thread's visible descendant comments, sorted by created.

Each valid local attached image is tagged with its post ID and converted to a multimodal `image_url`, not just the file path as text. Nonexistent or non-local legal media paths are not attached. `detail: low` is the current image-input setting; the model must support images. There is no additional semantic summarization or automatic token trimming for very long threads yet, so the model's context capacity is still the limit.

### Autonomous Befriending and Follow-Back Are Not the Same Feature

discovery is an independent LLM job for each online person and is not consumed by "this one already posted". Candidates prioritize other NPCs not followed, not interacted with, and not yet following the character, with public bios and common accounts provided; it is not filtered by player met status. This job can only follow/accept/decline/idle, and validates that the follow target is in the candidate set.

The proactive follow-back switch is a deterministic preference: upon receiving a valid new follow, the character checks the event the next time it runs a job, and follows back if enabled. Private targets still send a request rather than being directly approved. Events already canceled, already followed, or with a pending request are not redone. When the switch is off, natural LLM follow-back is not guaranteed.

When the LLM's accept/decline is submitted, the same compare-and-swap confirms that it is still pending, that the application is indeed in the model snapshot, and that requestVersions match. A new application after cancellation does not accept an old LLM decision; an expired job ends without changing the relationship, memory, or review notification. Follow reactions are scheduled by application version, so a new application is not merged into an old scheduled/running job; not-yet-executed expired application jobs are simply skipped rather than wasting model calls.

NPC private requests to the player have an affection threshold. Below the threshold, accept is forbidden; the existing program turns an at-threshold decline into an accept (not relying on the prompt alone). The model can still choose another action or idle, so immediate acceptance is not promised. Player review of requests sent to oneself is not subject to the "not yet acquainted with the applicant" restriction, to avoid requests from unknown NPCs never being processable.

### Reaction Types and Continued Commenting

A new post wakes online followers; a new comment wakes the root author, the direct target, and thread participants; a valid @ wakes the mentioned; a like notifies the original author; a repost notifies the original author and the reposter's online followers, so information spreads along social circles. Unliking/unreposting does not create a new reaction job. Follow-related events notify the target. Private content must still be readable, and the player themselves does not enter NPC jobs; when a saved online roster exists for the slot, use it as the source of truth rather than relying only on the existence of old jobs to determine online status.

You do not need to @ to reply. Every new comment has an independent ID and can continue waking other online participants; when the same NPC already has a reply to the same target, no more are sent. Likes and reposts are also deduplicated; you cannot game the submission check through repeated text rewrites. If the target is deleted or the character loses read permission, the job ends, and the old text saved in trigger is not fed to the model again.

When an offline character comes online, it chooses the nearest relevant unread thread for catch-up, marking the other old threads as seen rather than mechanically backfilling each one. When a new comment advances the created time, old threads can surface again. The model may choose not to reply, letting the discussion naturally sink.

The interaction instruction clearly distinguishes: public info worth spreading is prioritized for repost; everyday approval needing no text is prioritized for like; new questions, direct replies, and clarifications are prioritized for reply. This is a contextual preference, not a hard probability or quota; it does not manufacture follows/likes/reposts the model did not choose.

## 4. Interaction Limit and Concurrency Consistency

Every submission clones from newly read state, checks runId, and retries compare-and-swap failure at most 8 times. Community updates raise the revision but preserve the original sceneRevision to avoid interfering with the story screen. A new story/savefile read changes the runId, and old requests cannot write into new progress.

| Behavior | Consumes NPC's current-slot quota |
| --- | --- |
| New post, follow, follow-back, request processing, idle | No |
| Player–NPC interaction | No |
| Responding to posts/comments that existed before the character came online | No, determined by that NPC's base-job posts snapshot |
| Responding to past date/slot content | No |
| Two online NPCs in the current slot reply/like/repost to current-slot content added after coming online | Yes |
| Duplicate submission of already-replied/liked/reposted | No, not executed |

The quota is a shared total across NPCs in the same player progress, same slot — not 3 times per person. The payload's interactionBudget provides limit, used, remaining, and limitedTargetIds, letting the model avoid interactions it cannot submit in advance; the full context is not trimmed for this reason. Counting and the community action happen in the same compare-and-swap; when no budget remains it becomes idle, and it cannot over-deduct. Reaching the limit does not lock the player out of continuing to chat. An image-mount reply already consumes that action's quota at the time the pending message is created; others wait until the image is published to interact.

## 5. Image Publishing and Object-Only Tools

```text
post/reply(image=true)
  → author-visible pending message + upload animation
  → image-planning LLM → validate tool/tags/LoRA → SD queue
  → image saved successfully → atomic attach, cancel pending, write memory, wake online
  → definitive failure / cross-process interrupt → mark failed, keep and publish text-only
```

While pending, others cannot read it, and NPC decisions also exclude their own pending content, so no interaction memory, likes, replies, reposts, or new-post notifications are written early. Reactions are triggered only after the image and text become readable together. An image that returns after a delete or a run change does not recreate the post.

`imageSession` is bound to the process and run; after a service restart or savefile read, pending images that lost their owner become an explicit failed text post rather than staying stuck in the animation forever, and paid generation is not automatically resent. This is a failure downgrade, not a claim that an image exists.

- LINE object-only tool: `generate_object_image`.
- Twitter object-only tool: the same `generate_object_image` and parser.
- Character tool: LINE's `generate_image` / Twitter's `twitter_image`, provided only for characters with character-tag support; the tool output must be an actually provided name and must not call a character tool that was not enabled.
- Object-only has no loras field; passing one is rejected. Positive forces `no humans, still life, object focus`, excluding person counts, weighted person tags, hair color, and body parts; negative forces person, face, hands, body, background person, and reflection tags. Before sending to SD, the objectOnly plan is checked again.
- Mentioning someone in the body does not mean that person appears in frame. Snacks, sweets, test papers, school bags, books, trophies, and medals should use the object tool; consider the character tool only when a character and an object explicitly need to be in the same frame.
- LINE/Twitter/story share the safe execution queue and media storage, but each image uses a UUID, not a shared fixed filename that could be overwritten; they are not three isolated SD execution processes.

Tag restrictions cannot replace post-generation visual review, and there is no automatic person detector yet; base models may still not follow the prompt. Image failure does not delete the player's text, nor change SD global settings.

## 6. Permissions, Memory, and Default Relationships

`canReadPost` checks all ancestors level by level; cycles/missing ancestors are treated as unreadable; a public comment must not leak a private root post. A private account or a thread containing a private ancestor must not be reposted. After deleting a main post, its descendants remain in storage but become unreadable for losing their ancestor, and do not cascade-delete other authors' data.

The player is additionally affected by game acquaintance/follow rules: a character not yet acquainted can post and befriend in the background but is not directly shown to the player; after being acquainted and followed, their past content becomes readable. Followed accounts' reposts of "acquainted, public, not yet followed" authors can also appear on the homepage; unacquainted or private authors are not exposed beyond their rights by this.

Autonomous posts, replies, likes, reposts, and follows write into the `channel: twitter` of the relevant character's `memories`, managed by the existing compactMemory, for use by LINE/story. @ and reply recipients must be able to read the full message for the body to be written, so private content does not bypass permissions through memory. Deleted content does not clear memories others legally read in the past.

A new story establishes the following two-way network; the three literature-club members follow each other in pairs:

| Group | Account IDs |
| --- | --- |
| Protagonist, Yoshiki | kazuhiko, kaju |
| Gondo, Yoshiki | asami, kaju |
| Yanami, Sosuke | anna, sosuke |
| Sosuke, Karen | sosuke, karen |
| Tamaki, Koto, Komari | tamaki, koto, komari |
| Mitsuki, Chihaya | mitsuki, chihaya |
| Lemon, Mitsuki | lemon, mitsuki |
| Amanatsu, Konuki | amanatsu, konuki |
| Hori, Tiara | hibari, tiara |

networkVersion prevents resetting relationships on every GET; an unfollow after initialization is not forcibly restored. A new story re-initializes Twitter posts, schedules, follows, and requests; manual backups and media files are not deleted. The panel uses runId as the React key to avoid old community page state being reused by a new story.

## 7. HTTP and Frontend Operations

| Route | Request/Response Highlights |
| --- | --- |
| GET `/api/twitter` | player cookie; repairs the current slot schedule if needed; returns twitter, revision, runId |
| POST `/api/twitter` | same-origin check; runId, requestId (UUID), action, target, text, image; returns latest view/revision/runId/notice |
| PATCH `/api/twitter` | same-origin check; runId, optional playerPrivate, npcInteractionLimit; returns latest state |

No player identity → 401, no progress → 404, operation error → 400; the methods a route supports are explicitly listed in the HTTP router. Deterministic operations (like, repost, follow, review, delete, settings) do not go through the LLM; player posts/comments still go through tool confirmation and do not rewrite the text the player specified.

The panel uses revision to ignore late old polling responses and runId to reject responses from other progresses; an operation can safely resend the same requestId. Likes/reposts do not show "submitted via LLM" copy.

Comments express direct relationship with replyTo, and Explore labels the root author; the comment page title is "Comments" and the back arrow returns to the root post. The page has a reply box and an image-mount toggle; deep threads are flattened with a maximum visual indent to avoid becoming ever narrower. Deleting your own comment/post uses an internal confirmation dialog, and like/repost and follow lists use an internal account dialog.

Typing @ provides the followed-friends list, with up/down keys to select and Enter to insert; Enter is not intercepted during Chinese/Japanese IME composition. Public valid handles display in blue with a hover card, without mistaking part of a long account's prefix for another person.

Escape closes the candidate list rather than only resetting the selected item, and reopens it after continued input; @ can also start after Chinese punctuation. During an operation or after the game ends, no reply operation is started anymore.

Notifications include follow requests, notices, a follower's new posts, @, and your content receiving replies/likes/reposts, and can jump to the corresponding page. The scene Twitter button's red dot uses a read fingerprint in localStorage keyed by runId; opening the panel marks it read. Unread is now determined by "added token"; a token decrease from deleting a post/unliking does not create false new notifications; a pending image produces no new-post token.

## 8. Verification, Troubleshooting, and Limitations

Run:

```sh
bun run check
bun run test
bun run build
bun scripts/twitter-live-audit.ts --live
```

`--live` uses the configured model and consumes API usage, but uses an isolated temporary progress and does not change the player's save. On 2026-09-11, in this first round we observed the model choosing a text reply in both like and repost situations; after adjusting engagementSystem, the second round's four situations actually produced active follow, like, repost, and a no-@ reply. A single sampling does not represent a permanent success rate, and model results are not hardcoded.

Test highlights: `twitter.test.ts` covers scheduling, permissions, interaction tools, memory, limit, dedup, image wait and interruption, and typing projection; `twitter-http.test.ts` uses real HTTP to test PATCH and community reset; `twitter-ui.test.ts` renders the actual components and checks the green dot/animation CSS; `stable-diffusion.test.ts` checks that community images share the SD payload.

### Social-Circle Regression Scan

| Flow | Checks and validation |
| --- | --- |
| Routes and player operations | GET/POST/PATCH, same-origin, runId, requestId, illegal tools and cancel operations |
| Autonomous befriending | independent discovery, stranger NPC candidates, public follows/private requests, duplicate requests not rewriting memory |
| Follow-back and review | switch, one-shot event handling, private-target requests, unknown applicants reviewable |
| Online and scheduling | multi-person roster, resume, same-character serialization, no longer running background social for ended progress |
| Continued discussion | three NPCs responding to the player in the same thread, picking up new comments, still responding to the player after the NPC shared quota is used up |
| Like/repost | real tools, submission dedup, cancel not waking NPCs, repost notifying original author and online followers |
| Image mount | publish wait, object-only restriction, multimodal context, failure downgrade, process interruption and old run |
| Reading and memory | private ancestor, unknown author, deleted posts, memory cannot exceed rights, other systems merging to preserve community update |
| Frontend | light/dark, green dot/typing/upload components, limited indent, reply box, @, notification navigation and version anti-regression |
| Character settings | handle uniqueness, private/follow-back switch, activity level, settings validation |

The three added NPC integration tests use isolated storage and mock LLM to run actual POSTs, job submissions, and multi-round propagation: all three reply to the player, the NPCs reach 3 and stop growing, and after the player comments again all three can still reply. This is a test of scheduling and submission rules, not a guarantee of the model's natural chat quality.

The full regression this round was 225 passed, 0 failed; type-check and the production build passed. The document is limited to Twitter behavior and the necessary persistence, media, and memory wiring, and does not include story options or character story background implementation.

Troubleshooting order:

1. Check whether the GET online roster matches the current date/slot; do not mistake a done job for offline.
2. Check whether internal jobs are scheduled/running/failed/interrupted, and what the error is; inspect model HTTP, tool parameters, and image support.
3. Check whether the interaction target still exists and all ancestors are readable; whether it is pending.
4. Check for repeated replies to the same target, already liked/reposted, or the current slot quota exhausted.
5. Check whether `twitterFollowBack` is enabled; whether the request is still valid; whether the private account is awaiting approval.
6. Check whether the frontend is still on an old run; whether the server has restarted loading the new program.

There is currently no available browser surface, so this round's UI verification consists of real component rendering, style, and data-projection tests, not pretending to be mouse/visual acceptance. The build still has existing large-bundle warnings, which are not build failures. Manual retry UI for failed LLM jobs, automatic token summarization for very long threads, and post-generation person recognition are not yet provided; these limitations must not be masked by "social simulation is perfect".