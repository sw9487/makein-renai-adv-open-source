import {apiFetch} from './api-fetch';
import {
  apiSettings,
  bindings,
  content,
  sourceContent,
  isEditor,
  json,
  sameOrigin,
  token,
  write,
  read,
  validateApiUrl,
  db,
} from "./repository";
import { validateContent } from "./validation";
import { localizeImages } from './localize-images';
import { runtimeConfig } from './runtime';
import { join } from 'node:path';
import {recentTimings} from './timings';
import {readFileSync,existsSync} from 'node:fs';
import {modelsEndpoint} from './ai-status';

function chatEndpoint(value:string){
 const base=validateApiUrl(value);
 return base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
}

function checkImagePath(){
 const runtime=runtimeConfig();
 const candidates=[
  runtime.clientDir&&join(runtime.clientDir,'assets','check img.png'),
  runtime.projectDir&&join(runtime.projectDir,'web','public','assets','check img.png'),
  runtime.packageDir&&join(runtime.packageDir,'dist','client','assets','check img.png'),
  join(import.meta.dir,'../web/public/assets/check img.png'),
  join(import.meta.dir,'client','assets','check img.png'),
 ].filter((value):value is string=>!!value);
 const found=candidates.find(existsSync);if(!found)throw Error('找不到 AI 能力檢查圖片。');return found;
}

async function verifyAiCapabilities(settings:{url:string;model:string;key:string}){
 const image=readFileSync(checkImagePath()).toString('base64');
 const tool={type:'function',function:{name:'report_gender',description:'Report the gender of the person shown in the supplied image.',parameters:{type:'object',properties:{gender:{type:'string',enum:['girl','boy']}},required:['gender'],additionalProperties:false}}};
 const response=await apiFetch(chatEndpoint(settings.url),{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.key},body:JSON.stringify({model:settings.model,max_tokens:256,parallel_tool_calls:false,tools:[tool],tool_choice:{type:'function',function:{name:'report_gender'}},messages:[{role:'user',content:[{type:'text',text:'Inspect this image. Call report_gender exactly once. Use girl when the depicted person is female, otherwise use boy.'},{type:'image_url',image_url:{url:'data:image/png;base64,'+image,detail:'low'}}]}]})});
 if(!response.ok)throw Error(`AI 能力檢查失敗（HTTP ${response.status}）。請選擇支援圖片辨識與 tool call 的模型。`);
 const data=await response.json(),calls=data.choices?.[0]?.message?.tool_calls;
 if(data.choices?.[0]?.finish_reason==='length'||calls?.length!==1||calls[0]?.function?.name!=='report_gender')throw Error('AI 未使用指定 tool call 回答。請選擇支援圖片辨識與 tool call 的模型。');
 let result:any;try{result=JSON.parse(calls[0].function.arguments);}catch{throw Error('AI tool call 的參數格式無效。');}
 if(result.gender!=='girl')throw Error('AI 未正確辨識檢查圖片中的女生。請改用具有 VLM 圖片辨識能力的模型。');
}

const translationPaths={
 characters:/^characters\.\d+\.(?:name|reading|role|bio|prompt|source|imageNote|social\.twitterBio|timeline\.note|roles\.\d+\.(?:role|note))$/,
 publicAccounts:/^publicAccounts\.\d+\.(?:name|bio|prompt|modules\.(?:promotion|civic|advisory|patrol|reporting|municipal)\.prompt)$/,
 places:/^places\.\d+\.(?:name|subtitle)$/,
 events:/^events\.\d+\.(?:title|reference|text|script\.\d+\.(?:speaker|text)|choices\.\d+\.(?:text|reply))$/,
 assets:/^assets\.\d+\.(?:title|source|note)$/,
} as const;
async function translateField(a:any){
 const section=String(a.section??'') as keyof typeof translationPaths,path=String(a.path??''),text=String(a.text??''),language=String(a.language??'');
 if(!translationPaths[section]?.test(path)||!['ja','zh-Hant','en'].includes(language)||!text.trim()||text.length>24000)throw Error('翻譯欄位格式無效。');
 const ai=await apiSettings();if(!ai.url||!ai.key||!ai.model)throw Error('請先完成 LLM API 設定。');
 const target={ja:'Japanese','zh-Hant':'Traditional Chinese',en:'English'}[language]!;
 const tool={type:'function',function:{name:'translate_field',description:'Return one faithful translation without omissions or rewriting.',parameters:{type:'object',properties:{path:{type:'string',enum:[path]},translation:{type:'string'}},required:['path','translation'],additionalProperties:false}}};
 const response=await modelFetchTranslation(chatEndpoint(ai.url),ai,tool,path,text,target);
 if(!response.ok)throw Error(`AI 翻譯失敗（HTTP ${response.status}）。`);
 const data=await response.json(),calls=data.choices?.[0]?.message?.tool_calls,call=calls?.[0];
 if(data.choices?.[0]?.finish_reason==='length'||calls?.length!==1||call?.function?.name!=='translate_field')throw Error(`AI 未回傳欄位 ${path} 的完整翻譯。`);
 let result:any;try{result=JSON.parse(call.function.arguments);}catch{throw Error(`AI 回傳的欄位 ${path} 格式無效。`);}
 if(result.path!==path||typeof result.translation!=='string'||!result.translation.trim())throw Error(`AI 翻譯欄位 ${path} 時有缺漏。`);
 return result.translation as string;
}
function modelFetchTranslation(endpoint:string,ai:{model:string;key:string},tool:unknown,path:string,text:string,target:string){
 return apiFetch(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,max_tokens:8192,temperature:0,parallel_tool_calls:false,tools:[tool],tool_choice:{type:'function',function:{name:'translate_field'}},messages:[{role:'system',content:`Translate exactly one JSON field into ${target}. Preserve meaning, tone, identity, formatting, line breaks, placeholders, IDs and i18n keys. Use the conventional target-language rendering for personal names. Do not summarize, censor, embellish, explain, or omit anything. Return only the translate_field tool call.`},{role:'user',content:JSON.stringify({path,text})}]})});
}
export async function GET(req: Request) {
  if (!(await isEditor(req))) return json({ error: "請輸入 editor 密碼。" }, 401);
  const api = await apiSettings();
  return json({
    content: await content(),
    timings:recentTimings(),
    api: { url: api.url, model: api.model,contextTokens:api.contextTokens??65536, key: api.key, hasKey: !!api.key },
    revision:
      (
        await db()
          .prepare("SELECT updated FROM records WHERE key = ?")
          .bind("content")
          .first<{ updated: number }>()
      )?.updated ?? 0,
  });
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const raw = await req.text();
    if (raw.length > 1500000) throw Error("內容不能超過1.5MB。");
    const a = JSON.parse(raw);
    if (a.type === "login") {
      const password = String(bindings.EDITOR_PASSWORD ?? "");
      if (!password) throw Error("遠端 editor 尚未啟用。請在伺服器設定 EDITOR_PASSWORD。");
      if (typeof a.password !== "string" || a.password !== password) throw Error("密碼不正確。");
      const t = token();
      await write("editor-session:" + t, Date.now() + 8 * 3600000);
      return json({ ok: true }, 200, {
        "Set-Cookie": `makeine_editor=${t}; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=28800`,
      });
    }
    if (!(await isEditor(req))) return json({ error: "請先登入 editor。" }, 401);
    if (a.type === "content" || a.type === "reset-content") {
      const runtime=runtimeConfig();
      const c = a.type === "reset-content"
        ? validateContent(sourceContent())
        : await localizeImages(validateContent(a.content),join(runtime.dataDir,'uploads'),'/api/media/');
      if (!Number.isSafeInteger(a.revision) || a.revision < 0) throw Error("內容版本無效。");
      const revision = Math.max(Date.now(), a.revision + 1);
      const result =
        a.revision === 0
          ? await db()
              .prepare("INSERT OR IGNORE INTO records (key,value,updated) VALUES (?,?,?)")
              .bind("content", JSON.stringify(c), revision)
              .run()
          : await db()
              .prepare("UPDATE records SET value=?,updated=? WHERE key=? AND updated=?")
              .bind(JSON.stringify(c), revision, "content", a.revision)
              .run();
      if (!result.meta.changes) throw Error("內容已在另一個分頁變更，請重新載入。");
      if (a.type === "reset-content") return json({ ok: true, revision, content: c });
      return json({ok:true,revision,sourceSaved:false,content:c});
    }
    if (a.type === "api") {
      if (a.reset) {
        await write("api-settings", {});
        return json({ ok: true });
      }
      if (
        typeof a.url !== "string" ||
        typeof a.model !== "string" ||
        a.model.length > 200 ||
        typeof a.key !== "string" ||
        a.key.length > 4000
      )
        throw Error("API 欄位不正確。");
      const nextUrl = a.url.trim();
      const nextModel = a.model.trim();
      if (nextUrl) validateApiUrl(nextUrl);
      if(a.contextTokens!==undefined&&(!Number.isInteger(a.contextTokens)||a.contextTokens<4096||a.contextTokens>2000000))throw Error('上下文預算須介於 4096 與 2000000 token。');
      const old = await apiSettings();
      const nextKey = a.clearKey ? "" : a.key.trim() || old.key;
      if (!nextUrl || !nextModel || !nextKey)
        throw Error("API URL、模型與 API Key 為必填欄位。");
      await verifyAiCapabilities({url:nextUrl,model:nextModel,key:nextKey});
      await write("api-settings", {
        url: nextUrl,
        model: nextModel,
        contextTokens:a.contextTokens??old.contextTokens??65536,
        key: nextKey,
      });
      return json({ ok: true, aiReady:true });
    }
    if(a.type==='translate-field')return json({translation:await translateField(a)});
    if (a.type === "list-models") {
      if (typeof a.url !== "string" || !a.url.trim()) throw Error("請先輸入 API URL。");
      const base = validateApiUrl(a.url.trim());
      const auth = (typeof a.key === "string" && a.key) || (await apiSettings()).key;
      if (!auth) throw Error("請輸入 API Key 以查詢模型，或先儲存設定的金鑰。");
      const endpoint = modelsEndpoint(base);
      const r = await apiFetch(endpoint, {
        method: "GET",
        redirect: "manual",
        headers: { Authorization: "Bearer " + auth, Accept: "application/json" },

      });
      if (!r.ok) throw Error(`查詢模型失敗（${r.status}），請確認 API URL 已填到 /v1。`);
      const d = await r.json();
      const ids = (Array.isArray(d.data) ? d.data : d.models ?? [])
        .map((m: any) => (typeof m === "string" ? m : String(m.id ?? m.name ?? "")))
        .filter(Boolean);
      if (!ids.length) throw Error("未取得任何模型。");
      return json({ models: ids });
    }
    throw Error("未知操作。");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "儲存失敗。" }, 400);
  }
}
