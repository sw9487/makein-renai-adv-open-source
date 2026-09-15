import {ToolRegistry} from './tool-registry';
import {modelFetch,ModelError} from './model-runtime';
import {apiFetch} from './api-fetch';
import {mkdirSync,readdirSync,lstatSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,relative,sep} from 'node:path';
import {parse} from 'yaml';
import {runtimeConfig} from './runtime';
import {knowledgeText} from './knowledge-text';
import {prompt} from './prompt';
export const limits={knowledge:40,files:100,fileBytes:65536,totalBytes:1048576,contextChars:12000,reads:8,rounds:3};
export function knowledgeRoot(){const r=runtimeConfig();return join(r.projectDir??r.dataDir,'knowledge');}
export function safeKnowledgePath(path:string){
 if(!path||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)))throw Error('Knowledge 路徑無效。');
 const root=resolve(knowledgeRoot()),target=resolve(root,path);
 if(!target.startsWith(root+sep))throw Error('Knowledge 路徑越界。');
 let current=root;
 for(const part of ['',...path.split('/')]){if(part)current=join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw Error('Knowledge 不支援符號連結。');}
 return target;
}
export function metadata(text:string,folder:string){
 const match=text.replace(/^\uFEFF/,'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 if(!match)throw Error('KNOWLEDGE.md 需要 YAML frontmatter。');
 const m=parse(match[1],{maxAliasCount:10});
 if(!m||typeof m.name!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.name)||m.name.length>64||m.name!==folder||typeof m.description!=='string'||!m.description.trim()||m.description.length>1024)throw Error('name 須符合資料夾名稱，description 為必填（最多1024字）。');
 return {name:m.name as string,description:m.description as string};
}
export function knowledgeFiles(){
 const root=knowledgeRoot();mkdirSync(root,{recursive:true});safeKnowledgePath('check');
 const files:{path:string;bytes:number}[]=[];
 const walk=(dir:string,depth:number)=>{if(depth>6)throw Error('Knowledge 資料夾過深。');for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Knowledge 不支援符號連結。');
  const file=join(dir,entry.name);if(entry.isDirectory())walk(file,depth+1);else if(entry.isFile()){files.push({path:relative(root,file).split(sep).join('/'),bytes:lstatSync(file).size});if(files.length>limits.knowledge*limits.files)throw Error('Knowledge 檔案過多。');}
 }};walk(root,0);return files;
}
export function catalog(){
 const files=knowledgeFiles();return files.filter(f=>/^[^/]+\/KNOWLEDGE.md$/.test(f.path)).slice(0,limits.knowledge).map(f=>{
  try{if(f.bytes>limits.fileBytes)throw Error('KNOWLEDGE.md 超過64KB。');const m=metadata(readFileSync(safeKnowledgePath(f.path),'utf8'),f.path.split('/')[0]);return {...m,files:files.filter(x=>x.path.startsWith(m.name+'/')),enabled:!existsSync(safeKnowledgePath(m.name+'/.disabled'))};}
  catch(e){return {name:f.path.split('/')[0],description:'',files:files.filter(x=>x.path.startsWith(f.path.split('/')[0]+'/')),enabled:false,error:String(e)};}
 });
}
export function saveKnowledgeFiles(files:{path:string;text:string}[]){
 if(!Array.isArray(files)||!files.length||files.length>limits.files)throw Error('一次最多100個文字檔。');
 const existing=knowledgeFiles();const updates=new Map<string,string>();
 for(const f of files){safeKnowledgePath(f.path);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*\//.test(f.path)||typeof f.text!=='string'||Buffer.byteLength(f.text)>limits.fileBytes)throw Error('單檔最多64KB，且必須位於 knowledge 資料夾。');updates.set(f.path,f.text);}
 const folders=new Set([...existing.map(f=>f.path.split('/')[0]),...files.map(f=>f.path.split('/')[0])]);if(folders.size>limits.knowledge)throw Error('最多40個知識條目。');
 for(const name of new Set(files.map(f=>f.path.split('/')[0]))){const p=name+'/KNOWLEDGE.md';const doc=updates.get(p)??(existsSync(safeKnowledgePath(p))?readFileSync(safeKnowledgePath(p),'utf8'):'');metadata(doc,name);}
 const total=existing.filter(f=>!updates.has(f.path)).reduce((n,f)=>n+f.bytes,0)+[...updates.values()].reduce((n,t)=>n+Buffer.byteLength(t),0);if(total>limits.totalBytes)throw Error('Knowledge 總容量最多1MB。');
 for(const [path,text] of updates){const file=safeKnowledgePath(path);mkdirSync(resolve(file,'..'),{recursive:true});writeFileSync(file,text,'utf8');}
}
/** Single-round forced tool selection; all references auto-bundled into context. */
export async function knowledgeContext(endpoint:string,settings:{key:string;model:string},query:string,signal?:AbortSignal){
 let knowledge:ReturnType<typeof catalog>;try{knowledge=catalog().filter(s=>s.enabled);}catch{return '';}
 if(!knowledge.length)return '';
 const index=knowledge.map(s=>({name:s.name,description:s.description.slice(0,180)}));
 const messages:any[]=[{role:'system',content:prompt('knowledge.selector',{index:JSON.stringify(index)})},{role:'user',content:query.slice(0,2000)}];
 const tool={type:'function',function:{name:'read_knowledge',description:prompt('knowledge.tool'),parameters:{type:'object',properties:{path:{type:'string',description:prompt('knowledge.path')}},required:['path'],additionalProperties:false}}};
 let chars=0;const seen=new Set<string>(),chunks:string[]=[];
 const loadEntry=(entryName:string)=>{
  if(seen.has(entryName))return;
  const k=knowledge.find(s=>s.name===entryName);
  if(!k)return;
  seen.add(entryName);
  const entryFiles=k.files.filter(f=>f.bytes<=limits.fileBytes&&/\.(md|txt|json|csv|yaml|yml)$/i.test(f.path)).sort((a,b)=>a.path===entryName+'/KNOWLEDGE.md'?-1:b.path===entryName+'/KNOWLEDGE.md'?1:a.path.localeCompare(b.path));
  for(const file of entryFiles){
   if(chars>=limits.contextChars)break;
   try{
    const text=knowledgeText(file.path,readFileSync(safeKnowledgePath(file.path),'utf8'));
    if(!text)continue;
    const rem=Math.max(0,Math.min(4000,limits.contextChars-chars-16));
    if(!rem)break;
    const chunk=text.slice(0,rem)+(text.length>rem?'\n[truncated]':'');
    chars+=chunk.length+2;chunks.push(chunk);
   }catch{}
  }
 };
 const registry=new ToolRegistry();
 registry.register({schema:tool,parse:raw=>{const value=JSON.parse(raw);if(typeof value.path!=='string'||value.path.length>300)throw Error('知識工具參數無效。');return value.path.split('/')[0] as string;},execute:async name=>{loadEntry(name);return true;},validateResult:value=>{if(value!==true)throw Error('知識工具結果無效。');}});
 try{
  const response=await modelFetch(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.key},signal:signal,body:JSON.stringify({model:settings.model,messages,tools:registry.schemas(),tool_choice:'auto',parallel_tool_calls:true,max_tokens:300,temperature:0,stream:false})});
  if(!response.ok)return '';
  const raw=await response.text();if(raw.length>16000)return '';
  const data=JSON.parse(raw);const message=data.choices?.[0]?.message;const calls=message?.tool_calls;
  if(!Array.isArray(calls)||!calls.length)return '';
  for(const call of calls){
   try{
    await registry.execute(call.function?.name,call.function?.arguments);
   }catch{}
  }
 }catch{ /* Optional references must not block the underlying game reply. */ }
 return chunks.length
  ? '\n'+prompt('knowledge.context',{content:chunks.join('\n\n')})
  : '';
}
