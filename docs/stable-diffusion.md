# Stable Diffusion 選用外掛

到 Editor → 系統設定，在 Stable Diffusion 卡片啟用。預設關閉，不會在啟動時連線或要求安裝生圖服務。

設定本機或線上 **AUTOMATIC1111 相容 API** 根網址，也可填完整 `/sdapi/v1/txt2img` 路徑。支援反向代理的路徑前綴及選填 Bearer API Key。第三方須提供相同請求／回應格式；其他供應商的專有 API 需要轉接器。本機 WebUI 需以 `--api` 啟動，遊戲不會代為啟動 WebUI。

也可使用 `.env` 的 `SD_ENABLED=false`、`SD_AUTO_STORY=false`、`SD_API_URL`、`SD_API_KEY`。Editor 儲存的設定優先，修改後下次操作生效；環境變數需重啟。金鑰留白保留，按「清除已存金鑰」再儲存可移除，不會回傳給遊戲頁面。

啟用後，手動模式在劇情舞台顯示「產生劇情圖片」。自動模式會在劇情操作、當面對話後由 LLM 判斷是否呼叫 `generate_image`。LINE 可依對話語意、角色個性、好感與記憶決定是否傳照片，也可以不傳；不是文字關鍵字觸發。LINE 的決策及生圖結果交給原角色回覆流程，成功後照片隨訊息保存。

圖片工具分為 `generate_image`（人物與合法角色 LoRA）、`generate_object_image`（無人物物件）、`generate_scene_image`（無人物風景／場所）。物件與風景會補各自的正負面構圖標籤並排除人物 LoRA；LINE 與 Twitter 新貼文可使用適用的類型，Twitter 回覆完全不提供配圖工具。決策、標籤清理與最終驗證在 `server/stable-diffusion.ts`、`server/image-art-direction.ts`、`server/twitter.ts`，不可只靠 prompt 宣稱禁用某能力。

生圖設定必須選擇 **Illustrious／Pony**，並填入相符的 checkpoint 完整名稱。切換類型會清空 checkpoint、重設角色指南與推薦參數；儲存後套用到手動、自动劇情 CG 及 LINE。舊版未指定類型的設定遷移為 Illustrious，套用新版指南與參數，保留服務連線設定。

| 類型 | 推薦模型 | LoRA ZIP | 安裝位置 |
| --- | --- | --- | --- |
| Illustrious | [Nova Anime XL 指定版本](https://civitai.com/models/376130/nova-anime-xl?modelVersionId=2940478) | [下載](https://drive.google.com/file/d/12ZHjS8oQO713GPZcgMWFlRPznA0sLkdT/view?usp=sharing) | `models/Lora/Illustrious/` |
| Pony | [Zuki Clean Anime Mix](https://civitai.com/models/880541/zuki-clean-anime-mix) | [下載](https://drive.google.com/file/d/1cigyuhvk15DhxPyDLSlp8abTpxA6sQIr/view?usp=sharing) | `models/Lora/Pony/` |

ZIP 解壓縮後保留角色子資料夾與檔名，已有 Lora／類型資料夾則合併同名目錄。遊戲透過 `/sdapi/v1/loras` 讀取實際名稱，只允許選用指定類型資料夾內的 LoRA。若兩類型出現同名檔案，請加上類型前綴重新命名後刷新 WebUI，避免 WebUI 載入錯誤 LoRA。第三方 API 也需提供含 `name`、`path` 的此清單。

| 類型 | Steps | CFG | Clip skip | Hires 倍率 | Denoising |
| --- | --- | --- | --- | --- | --- |
| Illustrious | 25 | 5 | 2 | 2 | 0.7 |
| Pony | 30 | 6 | 2 | 1.5 | 0.45 |

兩者預設 Euler a、Automatic scheduler，開啟 Hires.fix，使用 R-ESRGAN 4x+ Anime6B；Hires steps 0 表示沿用主採樣步數。Illustrious 依文件的 20–30 steps、CFG 4–6、Clip skip 1–2、去噪 0.65–0.8 選取預設；Pony 依文件的 30 steps、CFG 6、1.5–2 倍與去噪 0.4–0.5。Pony 文件未指定 sampler、scheduler、clip skip 或 upscaler，這些是可調整的專案預設。

`core/sd-profiles.ts` 內建兩份模型文件的正負基底與各自角色觸發詞，由 `bun scripts/update-sd-profiles.mjs` 更新，部署無須讀取 Markdown。Illustrious 使用文件中的 masterpiece／quality 標籤與 BREAK 光影後綴；Pony 使用 `score_9, score_8_up, score_7_up, source_anime`，負面使用對應文件的 score_6／5／4 等標籤。伺服器移除 LLM 重複或跨模型的品質前綴，再套用選定模型基底。華戀、天愛星、和彥等角色的模型專屬觸發詞隨指南切換。UI 可預覽正負基底並重新套用推薦參數與指南。

提示詞規則位於 `server/image-art-direction.ts`。LLM 依選定模型指南生成逗號分隔的英文標籤與角色／服裝觸發詞，不使用白話句子、不設最低字數。場景依人物、外貌服裝、動作表情、單一鏡位、環境、光線順序選取標籤；構圖指示不應複製到 SD prompt。

本次參數及角色指南以根目錄 `Illustrious - makein-renai-stable-diffusion.md` 與 `Pony - makein-renai-stable-diffusion.md` 為依據。尚未以實際 checkpoint 做固定 seed 的出圖比較。

劇情 CG 強調敘事動作、背景縱深與底部對話框的留白；LINE 圖片採自然生活照構圖，但仍維持 2D 插畫風格，不繪製聊天介面。提示詞改動只影響新生成的圖片。實際畫質仍需以使用中的 checkpoint 與 LoRA 生成結果確認。

後端負責呼叫 LLM 與轉發生圖，瀏覽器不直接接觸上游金鑰。每次最多一張、同時最多一個生圖請求。圖片存入既有素材儲存並由 `/api/media/` 提供；劇情圖片隨存檔、LINE 圖片隨訊息保留。服務離線或格式錯誤只顯示圖片未完成提示，不阻止文字劇情或對話提交。

手動生圖使用後端工作，前端持續查詢直到完成或服務回報失敗，不設 SD 生成時間上限。生成時不能結束當前劇情階段或重複送出生圖，但仍可翻閱當前已有的對話文字，LINE 可獨立傳訊息。重新整理會接續等待，查詢暫時斷線不會取消工作；更新圖片不重新播放換場、不重置閱讀頁碼或打字機進度。工作追蹤仍有程序內狀態，重啟主專案可能中斷當次工作，請避免在生成中重啟。

Twitter 圖文主貼文先建立待配圖狀態，只有作者能看到；圖完成後才對他人發布。失敗或中斷時保留文字，可在原貼文按「重試配圖」，成功更新同一則貼文而不強制重新生成 NPC 回覆。配圖工作期間回覆、讚及轉發不可操作該文。回歸測試在 `tests/stable-diffusion.test.ts` 與 `tests/twitter.test.ts`。

若 SD 回報 `NansException`，代表模型計算產生無效數值，而非成功生成圖片。可先啟用 SD 的 `Upcast cross attention layer to float32`，若仍失敗再使用 `--api --no-half` 啟動。不要以關閉 NaN 檢查取代修正計算問題。
