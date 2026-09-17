# Development Documentation

**Languages:** [繁體中文](../zh-TW/README.md) · [English](README.md) · [日本語](../ja/README.md)

This directory records the design of the game, the Editor, the LLM integration and the various feature modules.

| Document | Contents |
| --- | --- |
| [Development Guide](development-guide.md) | Local development, architecture and testing |
| [Environment Separation](environments.md) | Starting, connecting and isolating the production/development/test environments |
| [LLM and Editor](ai-editor.md) | AI settings, validation and Editor behavior |
| [Calendar](calendar.md) | Date and event system |
| [LINE](line.md) | LINE simulation features |
| [Twitter](twitter.md) | Twitter simulation features |
| [Stable Diffusion](stable-diffusion.md) | Image generation integration |
| [Web Search](web-search.md) | Web search integration |
| [Game Knowledge](game-knowledge.md) | Worldbuilding and knowledge data |
| [LLM Scene Performance](llm-scene-performance.md) | Scene generation and performance |

The project is provided as GitHub source. After cloning, the user installs dependencies with `npm ci`, then builds and starts it according to the instructions in the root README; it is no longer published, updated or distributed for asset downloads through npm packages or `bunx`.