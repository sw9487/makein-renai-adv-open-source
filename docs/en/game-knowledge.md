# Supplementary Knowledge Harness

**Languages:** [繁體中文](../zh-TW/game-knowledge.md) · [English](game-knowledge.md) · [日本語](../ja/game-knowledge.md)

The supplementary knowledge page can add, edit, import text folders, enable, and disable knowledge. In development mode it is stored in the project's `knowledge/`; at runtime it is stored in the game's data directory `knowledge/`. This data is independent of the restoration content defaults and does not disappear when events are reset.

It follows the YAML frontmatter and folder conventions of https://agentskills.io/specification:

```text
my-knowledge/
  KNOWLEDGE.md
  references/background.md
  references/details.md
```

`KNOWLEDGE.md` requires `name` and `description`, with `name` matching the folder name; the main file contains only the retrieval description and the body index. Full knowledge is stored by topic in `references/*.md`, including background, definitions, details, examples, and unverified matters. `references` holds content, not source lists or external URLs. This version is a text-reference runtime; it does not execute programs or read binary images/PDFs.

Chat, LINE, events, choice performances, and Twitter activity share on-demand retrieval; Twitter replies and illustration decisions can also use it. It first sends up to 40 names with a 180-character description each, and the model selects entries through a single-turn `read_knowledge`, which can select multiple entries at once. The system automatically loads each entry's main file and body, parses metadata and JSON/YAML formats, and injects them as readable text into the response model. When loading, it does not delete body text based on titles, filenames, or field names; the response model selects facts semantically, ignoring source lists, indexes, and irrelevant noise. Each file is limited to 4000 characters, with a total reference text budget of 12000 characters; retrieval output is limited to 300 tokens. This is a character budget, not an exact tokenizer count.

When AI creates knowledge, it must produce an index and at least one body file, up to 10 files. Before submission, the LLM reviews each section semantically and itself removes source descriptions, external URLs, and noise, keeping the knowledge details and uncertainties. The program only validates structure and builds the index based on actual body files; it does not delete or alter body text based on titles, keywords, or filenames, nor does it separately store search results. Web Search only provides organized leads; it cannot treat summaries as full-text verification; uncertain information is marked directly in the body. If a body file is missing, too long, or the model output is truncated, nothing is stored.

Knowledge content is only added to the current generation and is not written to long-term chat memory. Missing knowledge does not cause additional model requests. Retrieval failure degrades to the original generation. All paths are restricted to the knowledge root directory, rejecting path traversal and symbolic links; the API reuses the Editor authentication and same-origin restrictions. The tools do not grant permission to execute programs, access the network or databases, or read secrets. The documents are untrusted references and cannot override the characters, game rules, or output structure.

Capacity limits: 40 knowledge entries, 100 files per operation, 64KB per file, and 1MB total text. The UI uploads text files; after direct modification on disk, a rescan can be performed. Modifications and disabling take effect on the next generation.

Main program files: `server/knowledge.ts`, `server/knowledge-tree.ts`, `server/knowledge-generate.ts`; regression tests: `tests/knowledge.test.ts`, `tests/knowledge-tree.test.ts`, `tests/knowledge-generate.test.ts`. The above retrieval is an optional additional model request; on failure it continues the original conversation or post flow rather than claiming to have cited the knowledge.