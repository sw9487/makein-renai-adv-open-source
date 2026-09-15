import {test,expect} from 'bun:test';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeRuntime} from '../server/runtime';
import {saveKnowledgeFiles,catalog,safeKnowledgePath,knowledgeContext,limits} from '../server/knowledge';
import {knowledgeText} from '../server/knowledge-text';
import {defaultContent} from '../core/content';
import {createGame,act} from '../core/engine';
import {converse} from '../server/chat';
import {enlivenScene} from '../server/scene';
import {prompt} from '../server/prompt';
test('knowledge entries validate structure, isolate paths and enforce bounded tool retrieval',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-')),port:19491,env:{}});const original=globalThis.fetch;
 try{
  expect(()=>safeKnowledgePath('../secret')).toThrow();expect(()=>safeKnowledgePath('x/C:secret')).toThrow();
  expect(()=>saveKnowledgeFiles([{path:'hello/KNOWLEDGE.md',text:'missing metadata'}])).toThrow();
  saveKnowledgeFiles([{path:'hello/KNOWLEDGE.md',text:'---\nname: hello\ndescription: |\n  Greeting guide\n---\nRead references/a.md'},{path:'hello/references/a.md',text:'a'.repeat(20000)}]);
  expect(catalog()[0].enabled).toBe(true);
  let calls=0;globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{calls++;const body=JSON.parse(String(init?.body));expect(body.max_tokens).toBe(300);expect(body.tool_choice).toBe('auto');expect(body.parallel_tool_calls).toBe(true);return Response.json({choices:[{message:{tool_calls:[{id:'read1',type:'function',function:{name:'read_knowledge',arguments:JSON.stringify({path:'hello'})}}]}}]});}, {preconnect: original.preconnect});
  const context=await knowledgeContext('https://example.com',{key:'test',model:'mock'},'hello');expect(calls).toBe(1);expect(context).toContain('truncated');expect(context).toContain('references/a.md');expect(context.length).toBeLessThan(limits.contextChars);
  const callsBefore=calls;writeFileSync(safeKnowledgePath('hello/.disabled'),'');expect(await knowledgeContext('https://example.com',{key:'test',model:'mock'},'hello')).toBe('');expect(calls).toBe(callsBefore);
 }finally{globalThis.fetch=original;close();}
});

test('knowledge formatting preserves content regardless of headings, filenames or field names',()=>{
 const doc='---\nname: dio\ndescription: retrieval metadata\n---\n# Dio\n\n## 使用步驟\n先呼叫工具。\n### 詳細步驟\n不要注入這段。\n## 能力\n**世界**能停止時間。\n## 未查證事項\n持續秒數未查證。';
 const text=knowledgeText('dio/KNOWLEDGE.md',doc);
 expect(text).toContain('世界能停止時間。');expect(text).toContain('持續秒數未查證');
 for(const noise of ['retrieval metadata','name:','**'])expect(text).not.toContain(noise);
 for(const content of ['使用步驟','先呼叫工具。','不要注入這段。'])expect(text).toContain(content);
 expect(knowledgeText('dio/ref.json',JSON.stringify({path:'internal',text:'Dio 是角色名稱。'}))).toBe('path：internal\ntext：Dio 是角色名稱。');
 expect(knowledgeText('dio/ref.json','{"能力":"停止時間","秒數":9}')).toBe('能力：停止時間\n秒數：9');
 expect(knowledgeText('dio/ref.yaml','能力: 停止時間')).toBe('能力：停止時間');
 expect(knowledgeText('dio/ref.json','{"request_body":{"messages":[]}}')).toBe('');
 expect(knowledgeText('dio/ref.json','{"messages":"訊息傳遞的概念","choices":"選擇的定義","text":"正文","description":"說明"}')).toBe('messages：訊息傳遞的概念\nchoices：選擇的定義\ntext：正文\ndescription：說明');
 expect(knowledgeText('dio/ref.json','{broken')).toBe('');
 expect(knowledgeText('dio/ref.md','[角色介紹](https://example.com)\nDio 的能力。')).toContain('角色介紹\nDio 的能力。');
 expect(knowledgeText('dio/ref.json','{"name":"Dio","description":"作品角色"}')).toBe('name：Dio\ndescription：作品角色');
 expect(knowledgeText('dio/references/web-search-sources.md','保留此檔案的正文')).toBe('保留此檔案的正文');
 for(const heading of ['使用流程','適用界線','資料不足時的處理','內容索引','參考來源','自訂章節']){
  expect(knowledgeText('entry/references/notes.md',`## ${heading}\n此章含有重要事實。\n搜尋來源：這也是待模型判斷的內容。`)).toContain('此章含有重要事實。\n搜尋來源：這也是待模型判斷的內容。');
 }
});

test('selected plain knowledge reaches both chat and scene response API requests',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-injection-')),port:19494,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const original=globalThis.fetch;
 const requests:any[]=[];
 try{
  saveKnowledgeFiles([
   {path:'dio/KNOWLEDGE.md',text:'---\nname: dio\ndescription: Dio JOJO\n---\n# Dio\nDio 是《JoJo的奇妙冒險》的角色。'},
   {path:'dio/references/abilities.json',text:JSON.stringify({能力:'替身「世界」能停止時間。'})},
   {path:'dio/references/web-search-sources.md',text:'搜尋雜訊'},
  ]);
  globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{
   const body=JSON.parse(String(init?.body));requests.push(body);
   const name=body.tools[0].function.name;
   const value=name==='read_knowledge'?{path:'dio'}:name==='present_scene'?{lines:[{kind:'speech',speaker:defaultContent.characters.find(ch=>ch.id==='anna')!.name,text:'你說的是 Dio 嗎？'}],choices:[]}:{speech:'你說的是 Dio 嗎？',narration:'',thought:null};
   return Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:JSON.stringify(value)}}]}}]});
  },{preconnect:original.preconnect});
  const s=act(createGame(defaultContent),defaultContent,{type:'choose',index:0});
  s.character='anna';s.phase=1;s.dialogue={speaker:'旁白',text:'下課時聊起 Dio。'};
  await converse(s,defaultContent,'anna','妳知道 Dio 嗎？','talk');
  await enlivenScene(s,defaultContent);
  expect(requests.map(r=>r.tools[0].function.name)).toEqual(['read_knowledge','present_character_reply','read_knowledge','present_scene']);
  for(const request of [requests[1],requests[3]]){
   const system=request.messages.find((m:any)=>m.role==='system').content;
   const [before,after]=prompt('knowledge.context',{content:'__CONTENT__'}).split('__CONTENT__');
   const injected=system.split(before)[1].split(after)[0];
   expect(injected).toContain('Dio 是《JoJo的奇妙冒險》的角色。');
   expect(injected).toContain('替身「世界」能停止時間。');
   for(const noise of ['"path"','"text"','name:','\\n'])expect(injected).not.toContain(noise);
   expect(injected).toContain('搜尋雜訊');
  }
 }finally{globalThis.fetch=original;close();}
});
test('bare knowledge name reads KNOWLEDGE.md and all references',async()=>{
  const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-bare-')),port:19492,env:{}});const original=globalThis.fetch;
  try{
   saveKnowledgeFiles([{path:'bare-test/KNOWLEDGE.md',text:'---\nname: bare-test\ndescription: Bare name test\n---\nCore content here'},{path:'bare-test/ref.txt',text:'reference content'}]);
   let calls=0;globalThis.fetch=Object.assign(async()=>{calls++;return Response.json({choices:[{message:{tool_calls:[{id:'r1',type:'function',function:{name:'read_knowledge',arguments:JSON.stringify({path:'bare-test'})}}]}}]});}, {preconnect: original.preconnect});
   const ctx=await knowledgeContext('https://example.com',{key:'test',model:'mock'},'bare-test');
   expect(calls).toBe(1);
   expect(ctx).toContain('Core content here');
   expect(ctx).toContain('reference content');
  }finally{globalThis.fetch=original;close();}
});
test('knowledge selection may skip unrelated entries',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-optional-')),port:19495,env:{}}),original=globalThis.fetch;
 try{
  saveKnowledgeFiles([{path:'tea/KNOWLEDGE.md',text:'---\nname: tea\ndescription: Tea reference\n---\nTea facts'}]);
  globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));expect(body.tool_choice).toBe('auto');return Response.json({choices:[{message:{content:'No reference needed.'}}]});},{preconnect:original.preconnect});
  expect(await knowledgeContext('https://example.com',{key:'test',model:'mock'},'unrelated weather greeting')).toBe('');
 }finally{globalThis.fetch=original;close();}
});
test('parallel tool calls select multiple knowledge entries',async()=>{
  const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-multi-')),port:19493,env:{}});const original=globalThis.fetch;
  try{
   saveKnowledgeFiles([
    {path:'entry-a/KNOWLEDGE.md',text:'---\nname: entry-a\ndescription: Entry A\n---\nContent A'},
    {path:'entry-a/references/detail.md',text:'Detail A'},
    {path:'entry-b/KNOWLEDGE.md',text:'---\nname: entry-b\ndescription: Entry B\n---\nContent B'},
    {path:'entry-b/references/detail.md',text:'Detail B'},
   ]);
   let calls=0;globalThis.fetch=Object.assign(async()=>{calls++;return Response.json({choices:[{message:{tool_calls:[
    {id:'t1',type:'function',function:{name:'read_knowledge',arguments:JSON.stringify({path:'entry-a'})}},
    {id:'t2',type:'function',function:{name:'read_knowledge',arguments:JSON.stringify({path:'entry-b'})}},
   ]}}]});}, {preconnect: original.preconnect});
   const ctx=await knowledgeContext('https://example.com',{key:'test',model:'mock'},'test');
   expect(calls).toBe(1);
   expect(ctx).toContain('Content A');
   expect(ctx).toContain('Detail A');
   expect(ctx).toContain('Content B');
   expect(ctx).toContain('Detail B');
  }finally{globalThis.fetch=original;close();}
});
