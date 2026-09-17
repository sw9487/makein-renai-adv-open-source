# 桃園中学

**言語:** [繁體中文](../zh-TW/momozono-map.md) · [English](../en/momozono-map.md) · [日本語](momozono-map.md)

新しい場所 `momozono` を追加する。これは佳樹、権藤亜沙美、橘聡のキャンパスに対応する。`campus: middle` は石蕗高校とは分けて判定され、キャラクターは既に登場しており、まだ中学に通っている必要がある。ゲームの既存の平日放課後の訪問、時限ごとに一度、週末は校舎閉鎖というルールを踏襲する。校舎に自由に入れる現実のガイドではない。

高1の2月に `novel-valentine-suspicion` を完了すると、訪問で `novel-momozono-visit` を発火でき、好感度選択肢 3 つとアルバム解禁が付く。訪問日の具体的な日付と会話はゲームの進行による。

ユーザーの完全なメインストーリー整理は [main-story-user-outline.md](main-story-user-outline.md) に保存され、創作の参考とされる。書類中の読者の解釈、推測、転述は自動的に確認済みの原文とはみなされない。桃園中学の訪問は第5巻の導入と [19 のメインストーリー継続イベント](mainline-continuation.md) の間の前置である。後続のイベントパックは実装済みだが、やはり同人改作であり、原作の章ごとの再現と同義ではない。

場所と訪問イベントは `core/momozono.ts` にあり、`core/story.ts::upgradeStories` で一度に組み込まれる（`momozono-school-v1`）。回帰テストは `tests/momozono.test.ts`。

## オリジナル背景

ツール：内蔵 imagegen。アセット：`content/assets/backgrounds/00000000-0000-4000-8000-000000000110.png`。生成後に完全にプロジェクトへコピーされ、切り抜きや補描きはない。非公式のイラストである。校門、本館、園芸花壇の構図は確認済み。

生成プロンプト:

> Create a polished Japanese visual novel background illustration, landscape 16:9, no people. A fictional public junior high school in Toyohashi Japan, viewed from inside its front gate looking across a small courtyard toward a modest three-story cream school building. Distinctive small gardening club area in the foreground right: green planter boxes, flowers, watering cans. Bicycle parking and low shrubs on the left. Warm late afternoon in February, clear sky, soft golden sunlight, subtle winter trees, clean realistic architecture, painterly anime background style, elegant detailed textures, calm inviting mood. Leave lower quarter uncluttered for dialogue overlay. No text, no signage lettering, no watermarks. This is Momozono middle school atmosphere for a fan visual novel, original environment, not a reproduction of an official image.