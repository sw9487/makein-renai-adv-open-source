# Web Search and AI Knowledge Creation

**Languages:** [繁體中文](../zh-TW/web-search.md) · [English](web-search.md) · [日本語](../ja/web-search.md)

Editor → System settings → Web Search, choose SerpAPI or Brave Search, enter the corresponding key and save it independently. Enabling without a key shows an in-site dialog, and the back end also rejects it. The two providers keep their keys separately and never return them to the UI.

After enabling "Game reply · Allow on-demand search", the story/character dialogue and LINE and Twitter posts/replies can query on demand when external knowledge is needed; simple small talk need not search. A decision calls `web_search` at most once. Up to 5 results, each with a 650-character summary; it does not fetch whole pages. Search summaries are untrusted data and must not override character or tool rules, nor go directly into long-term memory. When disabled there are no search requests; on failure it must not claim to have verified anything. The implementation entry points are `server/web-search.ts`, `server/chat.ts`, `server/twitter.ts`.

Supplementary knowledge → AI knowledge creation, where a topic and direction can be entered. The search checkbox is only available when search is enabled and the selected provider has a key; the back end re-validates. When checked, it searches on the topic and hands the results to the generation model. Up to 10 text files, 4500 output tokens per single run / 45 seconds. Generated files must be in the same folder and contain a valid KNOWLEDGE.md; same-name files are rejected and not overwritten. All text is still subject to the knowledge capacity and path limits.

Search provides summaries rather than full-text reading; generated content still needs review by the user. Supplementary knowledge is an independent local reference library and does not require web search to be enabled; see [Supplementary knowledge](game-knowledge.md). `tests/web-search.test.ts` uses mock providers and models and never touches the user's key; when real verification is needed, an isolated environment should be used explicitly.

API references: [Brave Web Search](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started), [SerpAPI Search API](https://serpapi.com/search-api).