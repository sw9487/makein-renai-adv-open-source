# 桃園中學

新增地點 `momozono`，對應佳樹、權藤亞沙美、橘聰的校園。`campus: middle` 與石蕗高中分開判定；角色必須已登場且尚在中學就讀。沿用遊戲既有平日放學後探訪、每時段一次、週末校舍關閉規則；不是校舍可自由入內的現實導覽。

高一2月完成 `novel-valentine-suspicion` 後，造訪可觸發 `novel-momozono-visit`，附3個好感選項與相冊解鎖。參觀日的具体日期與對話為遊戲安排。

使用者的完整主線整理保存在 [main-story-user-outline.md](main-story-user-outline.md)，作為創作參考。文件中的讀者解讀、推測與轉述不自動視為已核實原文。桃園中學參觀是第5卷導入與 [19 個主線接續事件](mainline-continuation.md) 之間的前置；後續事件包已實作，但仍是同人改寫，不等於原作逐章重現。

地點與參觀事件在 `core/momozono.ts`，由 `core/story.ts::upgradeStories` 一次性接入（`momozono-school-v1`）；回歸測試為 `tests/momozono.test.ts`。

## 原創背景

工具：內建 imagegen。資產：`content/assets/backgrounds/00000000-0000-4000-8000-000000000110.png`。生成後完整複製到專案，無剪裁或補畫；非官方插圖。已檢查校門、主樓與園藝花圃構圖。

生成提示：

> Create a polished Japanese visual novel background illustration, landscape 16:9, no people. A fictional public junior high school in Toyohashi Japan, viewed from inside its front gate looking across a small courtyard toward a modest three-story cream school building. Distinctive small gardening club area in the foreground right: green planter boxes, flowers, watering cans. Bicycle parking and low shrubs on the left. Warm late afternoon in February, clear sky, soft golden sunlight, subtle winter trees, clean realistic architecture, painterly anime background style, elegant detailed textures, calm inviting mood. Leave lower quarter uncluttered for dialogue overlay. No text, no signage lettering, no watermarks. This is Momozono middle school atmosphere for a fan visual novel, original environment, not a reproduction of an official image.
