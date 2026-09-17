# LINE: Messages, Read Receipts and Cross-platform Reactions

**Languages:** [繁體中文](../zh-TW/line.md) · [English](line.md) · [日本語](../ja/line.md)

The in-game LINE does not connect to a real messaging service. The threshold for a character to be contactable is determined by the character settings; once an exchange succeeds, an initial greeting that fits the character's style can be scheduled. LINE, face-to-face dialogue and Twitter can mutually provide context, but every action must preserve the real speaker, platform, date and source, and a character's tweet must not be mistaken for something the player said.

## Messages and read receipts

Messages are stored in `GameState.messages[characterId]`, using `id`, `from`, `date`, `phase`, optional image and `readByPlayerAt`/`readByCharacterAt`. When the player opens that conversation, the front end submits `line-read` and the back end marks the messages that character had not yet read; messages sent by the player show "read" only after the character reads them. Unread notification calculation lives in `core/line-inbox.ts`; the front end's opened position is also stored in localStorage.

Whether a character responds is decided by the model and the context; a read receipt does not mean a reply is required. `conversationClosed` and `expectsReply` help distinguish a conversation that ended naturally from messages still awaiting an answer. Proactive LINE can sense that the player has unread or read-but-not-replied messages, but it must not hard-judge a finished conversation such as a goodnight or a farewell as being cold-shouldered. Proactive work and the first message live in `server/proactive-line.ts`; general message generation is in `server/chat.ts`.

## Images, dates and retries

Once SD is enabled, a character can send images using the person, object-without-person or scenery image tools depending on context; successful results are persisted together with the text, and a failure must not claim the image was delivered. For detailed model labels and the queue, see [Stable Diffusion](stable-diffusion.md).

The player can disable LINE in the game settings. When disabled, the entry points, exchanging LINE and date invitations are hidden, the server rejects LINE chat/read/invite requests and skips proactive messages and the first greeting; the private-transfer-to-LINE tool in Twitter is also not provided. Old saves remain enabled by default, and the preference is retained after starting a new story and after loading a save.

A date invitation first creates a player message and shows it in LINE, then waits for the character's reply; only after the reply completes is the other party's message shown along with confirmation of the destination. Choosing the same location should still go through the normal scene transition. A failed LINE/dialogue retry is a new API attempt, not a replay of the previously failed requestId; see `core/navigation.ts::freshRetryAction`.

A character can post on Twitter due to a LINE conflict or other meaningful interaction; Twitter context can likewise trigger a private LINE. These side effects are still constrained by contact permission, blocks, runId and state-submission checks. Tests: `tests/line.test.ts`, `tests/proactive-line.test.ts`, `tests/social-bridge.test.ts`, `tests/date.test.ts`.