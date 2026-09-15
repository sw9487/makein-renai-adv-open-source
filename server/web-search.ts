import {modelFetch} from './model-runtime';
import {apiFetch} from './api-fetch';
import {read,write,apiSettings,validateApiUrl} from './repository';
import {prompt} from './prompt';
export type SearchSettings={enabled:boolean;knowledgeEnabled:boolean;provider:'brave'|'serpapi';keys:Partial<Record<'brave'|'serpapi',string>>};
export async function searchSettings(){const s=await read<SearchSettings>('web-search',{enabled:false,knowledgeEnabled:false,provider:'brave',keys:{}});return {...s,knowledgeEnabled:s.knowledgeEnabled??s.enabled};}
export async function publicSearchSettings(){const s=await searchSettings();return {enabled:s.enabled,knowledgeEnabled:s.knowledgeEnabled,provider:s.provider,hasKey:!!s.keys[s.provider],configured:{brave:!!s.keys.brave,serpapi:!!s.keys.serpapi}};}
export async function saveSearchSettings(a:any){
 if(typeof a.enabled!=='boolean'||(a.knowledgeEnabled!==undefined&&typeof a.knowledgeEnabled!=='boolean')||!['brave','serpapi'].includes(a.provider)||typeof a.key!=='string'||a.key.length>4000)throw Error('搜尋設定格式不正確。');
 const s=await searchSettings();const provider=a.provider as SearchSettings['provider'];const keys={...s.keys,[provider]:a.clearKey?'':a.key.trim()||s.keys[provider]||''};
 if((a.enabled||(a.knowledgeEnabled??a.enabled))&&!keys[provider])throw Error('請先輸入所選搜尋服務的 API Key，再開啟 Web Search。');
 await write('web-search',{enabled:a.enabled,knowledgeEnabled:a.knowledgeEnabled??a.enabled,provider,keys});return publicSearchSettings();
}
export async function webSearch(query:string,signal?:AbortSignal,purpose: 'game'|'knowledge'='game'){
 const s=await searchSettings();if(!(purpose==='knowledge'?s.knowledgeEnabled:s.enabled)||!s.keys[s.provider])throw Error('Web Search 尚未啟用或缺少 API Key。');
 if(typeof query!=='string'||!query.trim()||query.length>300)throw Error('搜尋文字需介於1–300字。');
 const url=new URL(s.provider==='brave'?'https://api.search.brave.com/res/v1/web/search':'https://serpapi.com/search.json');url.searchParams.set('q',query);
 const headers:Record<string,string>={Accept:'application/json'};
 if(s.provider==='brave'){url.searchParams.set('count','5');headers['X-Subscription-Token']=s.keys.brave!;}else{url.searchParams.set('engine','google');url.searchParams.set('num','5');url.searchParams.set('api_key',s.keys.serpapi!);}
 let response:Response;try{response=await apiFetch(url,{headers,redirect:'error',signal:signal});}catch{throw Error('搜尋服務連線失敗，請稍後重試。');}
 if(!response.ok)throw Error(`搜尋服務回應 ${response.status}。`);const data=await response.json();if(data.error)throw Error('搜尋服務無法完成請求。');
 return ((s.provider==='brave'?data.web?.results:data.organic_results)??[]).slice(0,5).map((r:any)=>({title:String(r.title??'').slice(0,160),url:String(r.url??r.link??'').slice(0,500),snippet:String(r.description??r.snippet??'').slice(0,650)}));
}
export async function searchContext(query:string,signal?:AbortSignal,purpose: 'game'|'knowledge'='game'){
 const s=await searchSettings();if(!s.enabled||!s.keys[s.provider])return '';
 const a=await apiSettings();if(!a.key||!a.model||!a.url)return '';
 const base=validateApiUrl(a.url),endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
 try{
  const r=await modelFetch(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.key},signal:signal,body:JSON.stringify({model:a.model,max_tokens:180,temperature:0,tools:[{type:'function',function:{name:'web_search',description:prompt('web.tool'),parameters:{type:'object',properties:{query:{type:'string',maxLength:300}},required:['query'],additionalProperties:false}}}],tool_choice:'auto',parallel_tool_calls:false,messages:[{role:'system',content:prompt('web.decision')},{role:'user',content:query.slice(0,1500)}]})});
  if(!r.ok)return '';const data=await r.json();const calls=data.choices?.[0]?.message?.tool_calls;if(calls?.length!==1||calls[0].function.name!=='web_search')return '';
  const result=await webSearch(JSON.parse(calls[0].function.arguments).query,signal);
  return '\n'+prompt('web.result')+'\n'+JSON.stringify(result);
 }catch{return '\n'+prompt('web.missing');}
}
