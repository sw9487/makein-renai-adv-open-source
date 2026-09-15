import {modelFetch} from './model-runtime';
import {apiFetch} from './api-fetch';
import {apiSettings,validateApiUrl} from './repository';
import {webSearch} from './web-search';
import {saveKnowledgeFiles,knowledgeRoot,metadata,safeKnowledgePath} from './knowledge';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {stringify} from 'yaml';
import {prompt} from './prompt';

export function prepareKnowledgeFiles(raw:unknown){
 if(!Array.isArray(raw)||raw.length<2||raw.length>10||raw.some(f=>!f||typeof f.path!=='string'||typeof f.text!=='string'||f.text.length>12000))throw Error('需提供索引與 references 知識正文，最多10個檔案。');
 const files=raw as {path:string;text:string}[];
 const name=files[0].path.split('/')[0];
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)||new Set(files.map(f=>f.path)).size!==files.length)throw Error('生成資料夾結構不正確。');
 for(const f of files){
  safeKnowledgePath(f.path);
  if(f.path!==name+'/KNOWLEDGE.md'&&!new RegExp('^'+name+'/references/[^/]+\\.md$').test(f.path))throw Error('知識正文必須放在 references/*.md。');
 }
 const main=files.find(f=>f.path===name+'/KNOWLEDGE.md');if(!main)throw Error('缺少 KNOWLEDGE.md。');
 const meta=metadata(main.text,name);
 const articles=files.filter(f=>f!==main);
 if(!articles.length||articles.some(f=>!f.text.replace(/^#+[^\n]*/gm,'').trim()||f.text.length>4000))throw Error('references 必須包含完整知識正文，每檔最多4000字，不能只有來源清單或標題。');
 const description=meta.description;
 // Build the index ourselves so all links point to actual content files.
 const index='---\n'+stringify({name,description})+'---\n\n# '+name+'\n\n## 內容索引\n\n'+articles.map(f=>{
  const path=f.path.slice(name.length+1);return `- [${path}](${path})`;
 }).join('\n')+'\n';
 return {name,files:[{path:main.path,text:index},...articles]};
}

export async function generateKnowledge(a:any,signal:AbortSignal){
 if(typeof a.topic!=='string'||!a.topic.trim()||a.topic.length>200||typeof a.direction!=='string'||a.direction.length>2000||typeof a.search!=='boolean')throw Error('請填寫主題（200字內）與方向（2000字內）。');
 const settings=await apiSettings();if(!settings.key||!settings.url||!settings.model)throw Error('請先設定 AI 服務。');
 const searchResults=a.search?await webSearch(a.topic.slice(0,200),signal,'knowledge'):[];
 const research=searchResults.map((s:{title:string;snippet:string})=>({title:s.title,summary:s.snippet}));
 const base=validateApiUrl(settings.url),endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
 const response=await modelFetch(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.key},signal:signal,body:JSON.stringify({model:settings.model,max_tokens:8000,temperature:0.6,tools:[{type:'function',function:{name:'create_knowledge',description:prompt('knowledge.generatorTool'),parameters:{type:'object',properties:{files:{type:'array',minItems:2,maxItems:10,items:{type:'object',properties:{path:{type:'string'},text:{type:'string'}},required:['path','text'],additionalProperties:false}}},required:['files'],additionalProperties:false}}}],tool_choice:{type:'function',function:{name:'create_knowledge'}},parallel_tool_calls:false,messages:[
  {role:'system',content:prompt('knowledge.generator')},
  {role:'user',content:JSON.stringify({topic:a.topic,direction:a.direction,research})},
 ]})});
 if(!response.ok)throw Error(`AI 建立失敗（${response.status}），未儲存。`);
 const data=await response.json();if(data.choices?.[0]?.finish_reason==='length')throw Error('AI 知識內容被截斷，未儲存。請縮小主題後重試。');
 const calls=data.choices?.[0]?.message?.tool_calls;if(calls?.length!==1||calls[0].function?.name!=='create_knowledge')throw Error('AI 未回傳完整的知識文件。');
 const result=prepareKnowledgeFiles(JSON.parse(calls[0].function.arguments).files);
 if(existsSync(join(knowledgeRoot(),result.name)))throw Error('同名知識已存在，未覆寫。請換個更具體的主題再建立。');
 if(signal.aborted)throw Error('建立已取消。');
 saveKnowledgeFiles(result.files);return {name:result.name,files:result.files.map(f=>f.path)};
}
