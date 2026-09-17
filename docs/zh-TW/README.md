# 開發文件

**语言导航 / Languages / 言語:** [繁體中文](README.md) · [English](../en/README.md) · [日本語](../ja/README.md)

本目錄記錄遊戲、Editor、LLM 整合與各功能模組的設計。

| 文件 | 內容 |
| --- | --- |
| [開發指南](development-guide.md) | 本機開發、架構與測試 |
| [環境區分](environments.md) | 正式／開發／測試環境的啟動、連線與隔離 |
| [LLM 與 Editor](ai-editor.md) | AI 設定、驗證與 Editor 行為 |
| [日曆](calendar.md) | 日期與事件系統 |
| [LINE](line.md) | LINE 模擬功能 |
| [Twitter](twitter.md) | Twitter 模擬功能 |
| [Stable Diffusion](stable-diffusion.md) | 圖像生成整合 |
| [Web Search](web-search.md) | 網路搜尋整合 |
| [遊戲知識](game-knowledge.md) | 世界觀與知識資料 |
| [LLM 場景效能](llm-scene-performance.md) | 場景生成與效能 |

專案以 GitHub 原始碼形式提供。使用者 clone 後以 `npm ci` 安裝依賴，再依根目錄 README 的指令建置與啟動；不再透過 npm 套件或 `bunx` 發佈、更新及下載素材。