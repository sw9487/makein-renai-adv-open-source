# In-Game Twitter: Development Contract

**Languages:** [繁體中文](../zh-TW/twitter.md) · [English](twitter.md) · [日本語](../ja/twitter.md)

This is a fictional community inside the local game; it does not connect to real Twitter. The implementation entry points are `core/twitter.ts`, `core/twitter-public.ts`, `server/twitter.ts`, `web/components/twitter-panel.tsx`.

## API and Save Data

- `GET /api/twitter` returns accounts, posts, and notifications based on the player's permissions, and also repairs and continues the current slot's work. `POST /api/twitter` receives player posts, replies, quotes, likes, direct reposts, follow/unfollow, review requests, block/unblock, deletes, and image retries. `PATCH /api/twitter` updates the player's public/private status and the NPC same-thread interaction limit.
- POST requires the current `runId` and a UUID `requestId`; resending the same request does not execute it twice, and a different payload for the same ID is rejected. Reading a savefile changes the runId. The raw community state is in `GameState.twitter`; ordinary game API/streaming strips the raw community data, and only the dedicated endpoint returns the filtered `twitterView` result.
- `TwitterState` holds `accounts`, `following`, `requests`, `blocks`, `posts`, `jobs`, `notices`, `operations`, etc. A new story rebuilds the state; old work results must not be written into a new run.

## Accounts, Online Status, and Work

The characters' handles, privacy, online frequency, proactive follow-back, and private-account approval thresholds are in the character settings. For new progress, Yoshiki is defaulted to a LINE contact and a two-way Twitter follow; later unfollowing does not automatically restore it. Each NPC is sampled per time slot by online rate, filling in as many as 6 usable characters where possible, of which 4 are characters the player already knows; when offline they do not reply immediately, but after coming online they can review old threads via catch-up.

Public accounts are stored in `Content.publicAccounts`, and older content is filled in by `core/twitter-public.ts::defaultPublicAccounts`; they are always public, blue-checked, and continuously online, but do not necessarily post every slot and do not follow back. In the Editor, "Character Settings → Public Accounts" allows adding accounts, setting the avatar/Twitter banner, bio, and identity Prompt, and independently enabling capability modules and writing their Prompts; the one-click translation translates only the name, bio, and Prompt, not the ID, handle, or image. Character friendships, posts, reactions, and catch-up work are saved in the save file, and on submission are checked against the date, run, and current state so that old results do not overwrite new progress.

The game settings can disable LINE and Twitter separately; both default to enabled. `core/social-apps.ts` provides the enabled default for old savefiles. When Twitter is disabled, the homepage button, polling, API operations, posting tools, and scheduling are all disabled, and in-progress old decisions must not be submitted; they resume only after re-enabling. The toggle persists across new stories and after reading a savefile.

"The maximum number of interactions between NPCs in the same post per time slot" is isolated by the root post, default 3, range 0–20. Player interactions, new posts, first reactions to new comments, old-thread catch-up, befriending, and idle do not consume this quota; exhausting the quota does not mean a character is offline.

## Visibility and Relationships

- An ordinary main post by a private account is readable only by the author, approved followers, or accounts directly `@`-mentioned in that post. Replies by a private account under a public main post are visible according to the public main thread's permissions; the replier's private settings must not be wrongly applied to the whole thread.
- Blocking removes two-way follows and pending requests, and neither party can read the other's main posts/comments or `@` the other. Unblocking does not restore follows.
- Private follows first send a request, which the target accepts or rejects; the player reviews requests on the notifications page. Public accounts can be followed directly without first being acquainted. Characters can also send requests to other characters or to the player.
- The backend `canReadPost` checks permissions along the reply ancestors; `twitterView` then applies the player's acquainted/following view. Every permission change must test main posts, private replies under public threads, direct mentions, and blocks.

## Posts, AI, and Public Behavior

Main posts, replies, and quotes express their relationships with `replyTo`/`quoteTo`; direct reposts are recorded in the original post's `reposts`. Replies cannot carry images. `@handle` can mention accounts that are not followed (except blocked ones). `#hashtag` can be searched and clicked; trends sort by recency, interaction count, and author count of readable posts.

Player new posts/replies/quotes are confirmed by an LLM tool for text; deterministic operations such as likes, reposts, follows, and blocks do not call the LLM. An NPC's `twitter_action` can arrange up to three ordered actions in one decision, with the whole group validated before submission. When the context allows, it can proactively message the player on LINE, post after a conversation, and change affection. The bios and tone of each public account are in `core/twitter-public.ts`; do not mention out-of-universe sources such as the series or the sacred-ground map in in-game account content.

The Higashi-Aichi News Agency takes public main posts from the previous evening in the daytime, from the morning at noon, and from noon in the evening, uses `twitter_news_batch` to select 0–3 posts, produces a unified title/body/tags, and validates the source IDs. Toyohashi City Hall can quote public main posts of other Toyohashi public accounts with accompanying text. The Toyohashi Police Department patrols public main posts and comments, replying to, advising, or warning about dangerous content; patrol cannot block the source.

Autonomous posting scheduling is divided into `promotion` (store promotion), `civic` (public information), `advisory` (safety outreach), `municipal` (local quotes), and `reporting` (news batches); `patrol` additionally patrols public discussion. Each capability reads the account's `modules` and can be paired with a dedicated Prompt; disabling one module does not affect the others. Frequency rules are in `core/public-twitter-activity.ts`, and the per-module prompts and available actions are in `server/twitter-public-strategies.ts`; do not merge the special strategies back into a single generic draw function. News jobs rescan the source time slot before executing, briefly waiting for the previous slot's unfinished task; sources include all visible public personal and public-account main posts, and personal statements must note the source.

## Attached Images, UI, and Notifications

When selecting a reply target, only text candidates are sent; once the target is fixed and contains an image, another request carries only one low-detail image of that target. `twitter_action` has no image capability; only a new image+text main post can use `twitter_image_post`. SD can generate characters, object-only images, or landscape images; replies do not provide image attachment/generation.

While an image+text post is being illustrated, only the author sees the placeholder; other accounts cannot read, like, repost, or reply to it. Only after completion is it made public and reactions scheduled; on failure, the text is retained and the image can be retried on the same post without forcing another character comment.

The left side has Home, Explore, Account, Notifications, and My pages; the My page shows only your own main posts. The sidebar "Following" includes characters and public accounts. Comment counts include nested replies; sorting offers Most relevant, Oldest, and Most liked. Enter submits, Shift+Enter makes a new line, and during submission the button spins and the input field locks. Unfollow and block have confirmations.

The notifications page supports per-item read or one-click clear; when the player actively scrolls to a relevant post it is also marked read. The unread token feeds the left-side blue dot and the game entry red dot; read records are stored in browser localStorage keyed by runId, while the community events themselves live in the game state.

## Regression Verification

For adding a public account, prefer using the Editor: check stable ID/unique handle, natural Japanese bio and posting Prompt, avatar, Twitter banner, and usable official source links; modules can be configured separately, with `promotion`/`civic`/`advisory` deciding autonomous posting, `patrol` deciding patrol, `reporting` deciding news batches, and `municipal` deciding quote-sharing. For fictional accounts without an in-universe official source, do not use the anime sacred-ground map as a fake store source. Once an account ID enters the save file and posts, its spelling should not be arbitrarily changed; if a rename is necessary, design old-savefile migration and test follows, blocks, posts, notifications, and mentions. Place data is maintained separately in `core/official-places.ts` from account data.

Game location backgrounds use `/assets/places-official/`, and public-account banners use `/assets/twitter-official/covers/`; these are different fields with different purposes. If older content mistakenly stored a cover as a location background, the `twitter-official-places-v3` upgrade converts the built-in seven store locations and their asset records to independently generated ADV scene images; custom backgrounds are not overwritten. When adding images, check both sides' references and that the files exist; do not treat a narrow banner as a game scene.

`tests/twitter.test.ts` covers permissions, scheduling, tools, images, news, police, and cross-platform reactions; `tests/twitter-http.test.ts` covers HTTP and public-account follows; `tests/twitter-ui.test.ts` covers the interface contract. After changes, run `bun run check`, `bun run test`, `bun run build` (`bun run test` already includes `--timeout=40000` because postgres.js is slow). Real-model diagnostics with `bun scripts/twitter-live-audit.ts --live` should be run explicitly on demand and should not encode a single model choice as a fixed ratio.