# Twitter 技術說明

最後檢查：2026-09-11。這是遊戲內的虛擬社群，不會連接或發布到真實 Twitter。本文件以目前程式為準，供開發人員追查排程、工具、權限、UI 與存檔行為；不是只列預期功能。

## 1. 模組與資料所有權

| 檔案 | 責任 |
| --- | --- |
| `core/twitter.ts` | 社群型別、預設互追、角色社群設定、閱讀權限、玩家資料投影、通知指紋及在線／輸入狀態 |
| `server/twitter.ts` | HTTP 操作、LLM 決策、排程、提交去重、回追、圖片發布及 Twitter → LINE 反應 |
| `server/http.ts` | `/api/twitter` 的 GET／POST／PATCH 路由 |
| `server/proactive-line.ts` | 遊戲時段提交時呼叫 `startTwitterSlot`，成功後啟動排程 |
| `server/game-api.ts` | 恢復排程、新故事及讀檔生命週期 |
| `server/repository.ts`、`server/concurrent-state.ts` | 持久化、compare-and-swap、與其他遊戲操作合併 |
| `server/stable-diffusion.ts` | 圖片工具解析、純物件限制、共用 SD 執行入口 |
| `server/image-queue.ts`、`server/image-history.ts` | 生圖佇列、圖片工作紀錄 |
| `web/components/twitter-panel.tsx` | 首頁／探索／個人頁／通知／討論串、操作與輪詢 |
| `twitter-account.tsx`、`twitter-typing.tsx`、`twitter-upload.tsx` | 頭貼在線綠點、輸入動畫、配圖動畫 |
| `web/components/twitter.css` | 明暗色、版面、有限縮排、動畫及減少動態效果設定 |
| `web/locales/{zh-TW,ja,en}.json` | 模型指令與新增 UI 文案 |

正式資料存於目前玩家的 `GameState.twitter`，而非前端臨時陣列。LLM 不直接修改資料庫；它只能回傳工具參數，由後端重新驗證與提交。

### 主要欄位

- `accounts[id]`：handle、private；由角色設定重建。玩家私人狀態另存 `playerPrivate`，優先於人物預設。
- `following[actor][target]`：有向追蹤關係，`true` 才算追蹤。取消後可能保留 `false`。
- `requests[target][applicant]`：待審核追蹤請求；處理後設為 `false`。
- `requestVersions[target][applicant]`：每次新申請的 UUID，不對前端公開。取消再申請會換版本；重複送出尚未取消的同一申請不換版本。舊存檔補入穩定的 legacy 識別。
- `posts[id]`：文字、作者、遊戲日期／時段、真實排序時間 `created`、配圖、`replyTo`、likes、reposts。
- `jobs[id]`：actor、原始日期／時段、due、可讀候選快照 posts、status、trigger、error。
- `online`／`onlineSlot`：本時段在線者；工作做完不等於下線。
- `npcInteractionLimit`／`npcInteractions[slot]`：預設 3、可調 0～20 的 NPC 即時互動額度。
- `follows`／`unfollows`：回追與取消追蹤反應事件；handled 避免重複處理。
- `threadSeen[actor][root]`：離線補看討論串的時間戳。
- `operations[requestId]`：玩家操作意圖，防止請求重送造成重複貼文或切換兩次。
- `typing`：只在對外投影時計算，不是獨立持久化的「假輸入」排程。

`imageSession` 是配圖工作所屬程序／run 的內部識別，不回傳給前端。`jobs`、`operations`、follow/unfollow 事件及互動計數等內部狀態也不交給前端；UI 只收到經權限過濾的貼文及必要社群資料。

## 2. 時段啟動與在線排程

```text
新故事／推進日期或時段／GET 修復缺少名單
  → twitterState：初始化、預設網路、讀取角色設定
  → startTwitterSlot：決定在線名單並保存
  → 每人建立 base 工作 + discovery 工作 + 可選 catchup 工作
  → 存檔成功後 resumeTwitter
  → 到 due 時 runTwitterJob
  → fresh-state 驗證 → LLM → fresh-state 提交 → 喚醒其他在線角色
```

候選是所有「遊戲時間已登場」的 NPC，不限玩家已認識的人；尚未登場不等於尚未認識。每人基礎機率乘上低／中／高活躍權重 0.4／1／1.5，再補足至少 6 人，其中至少 4 人為已認識者；候選不足取實際數量。

一般工作延遲約 5～50 秒；交友工作約 2 秒；即時反應約 0.5～2 秒，另加模型與佇列耗時。這不是每秒強制產生貼文。時段名單、工作 ID 與完成狀態會保存，修復空名單時先找既有工作，避免把已完成的同時段工作重新送出。

同一角色已有 running 工作時，其他工作延後；不同角色可並行。`activeJobs` 防止同程序重排同一 timer。程序重啟後，scheduled 工作恢復，失去執行中的 running 工作標示 interrupted，不自動重送可能已付費的模型請求。遊戲已結束時不再執行待處理工作；模型等待期間結束的進度也不再提交新社群行動。

### 在線綠點與輸入動畫

右側「你認識的人」優先顯示在線角色，綠點在頭貼右上角，不顯示「0 人在線」。達到互動上限也不移除綠點。

`twitterView` 只把本時段 running、目標可見、角色已認識且在線的 post／reply／catchup 工作投影成 `typing: [{actor, postId}]`。前端在該貼文或留言下顯示名字與三點動畫，多人合併顯示。完成、idle、按讚、轉發、失敗、中斷或權限消失時都會移除；不額外拖延請求來演出動畫。

模型在同一請求中判斷行動並生成文字，因此「正在輸入」表示正在處理這則內容，不保證最後一定送出文字。base 自主瀏覽還沒有確定目標時，不會隨意把輸入狀態掛到某則貼文。面板每 1.5 秒輪詢、頁面隱藏時略過、單一輪詢不重疊。非常快的請求可能來不及被畫面捕捉。動畫尊重 `prefers-reduced-motion`。

## 3. LLM 工具與社交決策

唯一社群工具 `twitter_action` 必須回傳一次合法 tool call：

```json
{"action":"reply","target":"貼文或留言 ID","text":"回覆內容","image":false}
```

| action | target | 後端效果 |
| --- | --- | --- |
| idle | 空字串 | 不改社群內容 |
| post | 空字串 | 建立主貼文 |
| reply | 直接回覆的訊息 ID | 建立帶 replyTo 的新訊息，不把留言誤掛根貼文 |
| like | 訊息 ID | NPC 設為已讚；玩家可切換 |
| repost | 訊息 ID | NPC 設為已轉發；玩家可切換；私人串拒絕 |
| follow／unfollow | 帳號 ID | 公開立即追蹤、私人送請求；或取消關係／請求 |
| accept／decline | 申請人 ID | 處理寄給自己的現有請求 |
| delete | 自己的訊息 ID | 刪除自己的主貼文或留言 |

文字最多 280 字元；post／reply 不可空白；只有 post／reply 能要求配圖。模型 HTTP 非成功、截斷、錯誤工具、多個工具、非法 action 或未讀取的互動目標都不提交。提交時再次檢查權限，不能因 LLM 生成期間資料改變就繞過限制。

NPC payload 包含角色 prompt、即時身分、日期／時段、在線名單、帳號資料、followCandidates、既有追蹤與請求、對玩家好感、個人記憶及可讀貼文。普通瀏覽採工作建立時的候選快照（最多取 35 則）；有明確討論目標的反應工作，提供根貼文與整串可見後代留言，按 created 排序。

每張有效的本機配圖都以貼文 ID 標註並轉為多模態 `image_url`，不只把檔案路徑當文字。不存在或非本機合法媒體路徑不附入。`detail: low` 是目前影像輸入設定；模型必須支援圖片。超長討論串尚無額外語意摘要或 token 自動裁切，模型端上下文容量仍是限制。

### 自主交友與回追不是同一功能

discovery 是每位在線者的獨立 LLM 工作，不會被「這次已發文」吃掉。候選優先未追蹤、未互動、尚未追蹤自己的其他 NPC，提供公開簡介與共同帳號；不依玩家 met 過濾。此工作僅可 follow／accept／decline／idle，並驗證 follow 目標位於候選集合。

主動回追 switch 是確定性偏好：收到有效新追蹤後，角色下次執行工作時檢查事件；已開啟就回追。私人目標仍送請求，不直接批准。已取消、已追蹤、已有待審請求的事件不重做。switch 關閉時不保證由 LLM 自然回追。

LLM 的 accept／decline 提交時，同一次 CAS 會確認目前仍待審、模型快照中確有该申請，且 requestVersions 相同。取消後的新申請不接受舊 LLM 決策；過期工作結束而不改關係、記憶或審核通知。follow 反應排程以申請版本區分，讓新申請不被旧的 scheduled／running 工作合併；尚未執行的過期申請工作直接略過，不浪費模型呼叫。

NPC 對玩家的私人請求有好感門檻。未達標禁止 accept；現行程式會把達標的 decline 改成 accept（不是只靠 prompt）。模型仍可選其他行動或 idle，因此不承諾立即接受。玩家審核寄給自己的請求不受「尚未認識申請者」限制，避免未知 NPC 的請求永遠無法處理。

### 反應種類與持續留言

新文喚醒在線追蹤者；新留言喚醒根作者、直接對象與討論串參與者；有效 @ 喚醒被提及者；like 通知原作者；repost 通知原作者及轉發者的在線追蹤者，讓資訊能沿社交圈傳播。取消讚／取消轉發不建立新反應工作。追蹤相關事件通知對象。私有內容仍需可讀，玩家自己不進 NPC 工作；已保存本時段 online 名單時，以名單為準，不只靠舊工作存在判定在線。

不必 @ 才能回覆。每則新留言都有獨立 ID，可繼續喚醒其他在線參與者；相同 NPC 對同一 target 已有回覆時不再發送。按讚與轉發亦去重；不能用反覆文字改寫鑽過提交檢查。目標已刪除或角色已失去閱讀權限時，工作結束，不把 trigger 保存的舊文字再傳給模型。

離線角色上線時選最近的相關未讀討論串作 catchup，其餘舊串標記已看過而非逐筆機械補回。新留言推進 created 時間後，舊串能再浮現。模型可不回覆，讓討論自然沉下去。

互動指令明確區分：值得傳播的公開資訊優先評估 repost；不需文字的日常認同優先 like；新問題、直接回覆及澄清才優先 reply。這是情境偏好，不是硬性機率或配額；不製造模型未選擇的追蹤／讚／轉發。

## 4. 互動上限與併發一致性

所有提交以新讀取狀態 clone，檢查 runId，compare-and-swap 失敗最多重試 8 次。社群更新提高 revision，但保存原 sceneRevision，避免干擾劇情畫面。新故事／讀檔更換 runId，舊請求不能寫入新進度。

| 行為 | 是否消耗 NPC 本時段額度 |
| --- | --- |
| 發新貼文、追蹤、回追、處理請求、idle | 否 |
| 玩家與 NPC 之間互動 | 否 |
| 回應角色上線前已存在的貼文／留言 | 否，以該 NPC base 工作 posts 快照判定 |
| 回應過往日期／時段內容 | 否 |
| 兩位本時段在線 NPC 對上線後新增的本時段內容 reply／like／repost | 是 |
| 已回覆／已讚／已轉發的重複提交 | 否，不執行 |

額度是同一玩家進度、同一時段的 NPC 共用總額，不是每人各 3 次。payload 的 interactionBudget 提供 limit、used、remaining 及 limitedTargetIds，讓模型事先避開無法提交的互動；完整上下文不因此被裁掉。計次與社群動作同一次 CAS；沒有餘額改為 idle，不會超扣。達上限不封鎖玩家繼續聊天。配圖回覆在建立待發布訊息時已佔用該次行動額度，別人要等圖片發布後才能互動。

## 5. 圖片發布與純物件工具

```text
post/reply(image=true)
  → 作者可見的 pending 訊息 + 上傳動畫
  → 圖片規劃 LLM → 驗證工具／tags／LoRA → SD 佇列
  → 圖片保存成功 → 原子附圖、取消 pending、寫入記憶、喚醒在線者
  → 確定失敗／跨程序中斷 → 標示失敗、保留並發布純文字
```

pending 時其他人不可讀，NPC 決策也排除自己的 pending 內容，不提前寫入互動記憶、按讚、回覆、轉發或發出新文通知。圖片與文字一起可讀後才觸發反應。刪文或換 run 後回來的圖片不重新建立貼文。

`imageSession` 綁程序與 run；服務重啟或讀檔後失去擁有者的 pending 圖片會轉為明確的失敗文字貼文，不永遠卡在動畫，也不自動重送付費生圖。這是失敗降級，不會謊稱有圖。

- LINE 純物件工具：`generate_object_image`。
- Twitter 純物件工具：同一個 `generate_object_image` 與解析器。
- 人物工具：LINE 的 `generate_image`／Twitter 的 `twitter_image`，只有具人物 tags 支援的角色才提供；工具輸出必須是實際提供的名稱，不能自行呼叫未啟用的人物工具。
- 純物件沒有 loras 欄位；若傳入即拒絕。正向強制 `no humans, still life, object focus`，排除人物數量、加權人物標籤、髮色、人體部位等；負向強制人物、臉、手、身體、背景人物與倒影 tags。送往 SD 前再次檢查 objectOnly 計畫。
- 正文提到誰不代表那個人要入鏡。零食、甜點、考卷、書包、書籍、獎盃及獎牌應使用物品工具；明確要求人物與物品同框才考慮人物工具。
- LINE／Twitter／劇情共用安全執行佇列與媒體儲存，但每張圖片使用 UUID，不共用會被覆寫的固定檔名；不是三個互相隔離的 SD 執行程序。

tags 限制不能代替生成後視覺審查，目前沒有自動人物偵測器；基礎模型仍可能不遵守 prompt。圖片失敗不刪玩家文字，也不改 SD 全域設定。

## 6. 權限、記憶與預設關係

`canReadPost` 逐層檢查所有祖先，循環／缺失祖先視為不可讀；公開留言不能洩漏私人根貼文。私人帳號或含私人祖先的串不得轉發。刪除主貼文後，其子孫保留於儲存但因失去祖先而不可讀，不連帶刪其他作者資料。

玩家 additionally 受遊戲認識／追蹤規則影響：未認識角色可以在背景發文、交友，但不直接顯示給玩家；認識並追蹤後可讀其過往內容。跟隨帳號轉發的「已認識、公開、尚未追蹤」作者也可出現在首頁；未認識或私有作者不因此越權曝光。

自發貼文、回覆、讚、轉發及追蹤等會寫入相關角色 `memories` 的 `channel: twitter`，經既有 compactMemory 管理，供 LINE／劇情使用。@ 與回覆接收者必須能讀取完整該訊息才寫入正文，不讓私人內容藉記憶繞过權限。已刪除內容不清除別人過去合法讀到的記憶。

新故事建立以下雙向網路；文藝社三人兩兩互追：

| 群組 | 帳號 ID |
| --- | --- |
| 主角、佳樹 | kazuhiko、kaju |
| 權藤、佳樹 | asami、kaju |
| 八奈見、草介 | anna、sosuke |
| 草介、華戀 | sosuke、karen |
| 玉木、古都、小鞠 | tamaki、koto、komari |
| 光希、千早 | mitsuki、chihaya |
| 檸檬、光希 | lemon、mitsuki |
| 甘夏、小拔 | amanatsu、konuki |
| 放虎原、馬剃 | hibari、tiara |

networkVersion 防止每次 GET 重設關係；初始化後的取消追蹤不強制恢復。新故事重新初始化 Twitter 貼文、排程、追蹤及請求；手動備份及媒體檔不刪除。面板以 runId 作 React key，避免新故事沿用舊社群頁面狀態。

## 7. HTTP 與前端操作

| 路由 | 請求／回應重點 |
| --- | --- |
| GET `/api/twitter` | 玩家 cookie；必要時修復本時段排程；回傳 twitter、revision、runId |
| POST `/api/twitter` | 同源檢查；runId、requestId(UUID)、action、target、text、image；回傳最新 view／revision／runId／notice |
| PATCH `/api/twitter` | 同源檢查；runId、可選 playerPrivate、npcInteractionLimit；回傳最新狀態 |

無玩家身分 401、無進度 404、操作錯誤 400；route 支援的方法明確列於 HTTP router。確定性操作（讚、转發、追蹤、審核、刪除、設定）不經 LLM；玩家發文／留言目前仍經工具確認，不改写玩家指定文字。

面板以 revision 忽略晚到的舊輪詢回應，以 runId 拒絕其他進度回應；操作可安全重送同一 requestId。按讚／轉發不顯示「透過 LLM 提交」文案。

留言以 replyTo 表達直接關係，探索標註根作者；留言頁標題為「留言」，返回箭頭回到根貼文。頁面有回覆框與配圖開關；深串以扁平展開、最大視覺縮排避免愈來愈窄。刪除自己的留言／貼文使用內部確認視窗，讚／轉發及追蹤名單使用內部帳號視窗。

輸入 @ 提供追蹤好友名單，上下鍵選擇、Enter 帶入；中文／日文 IME 組字期間不攔截 Enter。公開有效 handle 顯示藍字與懸停卡片，不把長帳號的部分前綴誤認為另一個人。

Escape 會關閉候選而不只是重設選中項目，繼續輸入後重新開啟；中文標點後也可開始 @。操作中或遊戲結束後，不再啟動留言回覆操作。

通知包含追蹤請求、notice、追蹤者新文、@、自己的內容收到回覆／讚／轉發，可跳到對應頁。場景 Twitter 按鈕紅點用 runId 對應的 localStorage 已讀指紋；開啟面板時標記已讀。現在以「新增 token」判未讀，刪文／取消讚造成 token 減少不會製造假新通知；pending 圖片不產生新文 token。

## 8. 驗證、故障排查與限制

執行：

```sh
bun run check
bun test
bun run build
bun scripts/twitter-live-audit.ts --live
```

`--live` 會使用設定的模型並消耗 API 用量，但採隔離臨時進度，不改玩家存檔。2026-09-11 本次第一輪觀察到模型在讚／轉發情境都選文字回覆；調整 engagementSystem 後第二輪四個情境實際得到主動追蹤、按讚、轉發、無 @ 回覆。一次抽測不代表永久成功率，不硬編模型結果。

測試重點：`twitter.test.ts` 覆蓋排程、權限、互動工具、記憶、上限、去重、圖片等待與中斷、typing 投影；`twitter-http.test.ts` 使用真實 HTTP 測試 PATCH 與社群 reset；`twitter-ui.test.ts` 渲染實際元件及檢查綠點／動畫 CSS；`stable-diffusion.test.ts` 檢查社群圖片共用 SD payload。

### 社交圈回歸掃描

| 流程 | 檢查與驗證 |
| --- | --- |
| 路由與玩家操作 | GET／POST／PATCH、同源、runId、requestId、非法工具與取消操作 |
| 自主交友 | 獨立 discovery、陌生 NPC 候選、公開追蹤／私人請求、重複請求不重寫記憶 |
| 回追與審核 | switch、事件一次性處理、私人目標請求、未知申請人可審核 |
| 在線與排程 | 多人名單、恢復、同角色序列化、結束進度不再執行背景社交 |
| 持續討論 | 三位 NPC 同串回應玩家、接續新留言、NPC 共同額度用完仍回應玩家 |
| 按讚／轉發 | 真實工具、提交去重、取消不喚醒 NPC、轉發通知原作者及在線追蹤者 |
| 配圖 | 發布等待、純物件限制、多模態上下文、失敗降級、程序中斷與舊 run |
| 閱讀與記憶 | 私人祖先、未知作者、刪文、記憶不可越權、其他系統合併保留社群更新 |
| 前端 | 明暗色、綠點／typing／upload 元件、有限縮排、回覆框、@、通知導向與版本防倒退 |
| 人物設定 | handle 唯一性、私人／回追 switch、活躍程度、設定驗證 |

新增的三 NPC 整合測試使用隔離儲存與 mock LLM 執行實際 POST、工作提交及多輪傳播：三人都回覆玩家、NPC 彼此達 3 次停止增長、玩家再留言後三人仍可回覆。這是排程與提交規則測試，不是模型自然聊天品質的保證。

本輪完整回歸為 225 項通過、0 失敗；型別檢查與正式建置通過。文件限於 Twitter 行為與必要的持久化、媒體、記憶串接，不包含劇情選項或人物故事背景實作。

排查順序：

1. GET 在線名單是否對應目前日期／時段；勿把 done 工作誤認離線。
2. 內部工作有無 scheduled／running／failed／interrupted，error 為何；檢查模型 HTTP、工具參數與圖片支援。
3. 互動目標是否仍存在且祖先全可讀；是否 pending。
4. 是否重複回覆同一 target、已讚／已轉發，或本時段額度用盡。
5. `twitterFollowBack` 是否啟用；請求是否仍有效；私人帳號是否待批准。
6. 前端是否仍開著舊 run；伺服器是否已重啟載入新程式。

目前沒有可用瀏覽器表面，因此本次 UI 驗證為實際元件渲染、樣式與資料投影測試，不冒充滑鼠／目視驗收。建置仍有既有的大 bundle 警告，非建置失敗。尚未提供失敗 LLM 工作的手動重試 UI、超長討論的 token 自動摘要或生成後人物辨識；這些限制不可用「社交模擬已完美」掩蓋。
