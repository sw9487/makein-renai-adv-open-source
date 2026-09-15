import {test,expect} from 'bun:test';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeRuntime} from '../server/runtime';
import {generateKnowledge,prepareKnowledgeFiles} from '../server/knowledge-generate';
import {knowledgeRoot,knowledgeContext} from '../server/knowledge';
import {saveSearchSettings} from '../server/web-search';
import {prompt} from '../server/prompt';

const main={path:'sample/KNOWLEDGE.md',text:'---\nname: sample\ndescription: 測試知識\n---\n[不存在的來源](references/missing.md)'};
test('generated knowledge requires real articles and builds only valid content links',()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-layout-')),port:19511,env:{}});
 try{
  for(const files of [[main],[main,{path:'sample/notes.md',text:'內容'}],[main,{path:'sample/references/empty.md',text:'# 空標題'}],[main,{path:'sample/references/../escape.md',text:'內容'}]])expect(()=>prepareKnowledgeFiles(files)).toThrow();
  const result=prepareKnowledgeFiles([main,{path:'sample/references/facts.md',text:'# 主題\n完整內容，細節未查證。\n\n## 參考來源\n外部網站 https://example.org\n\n## 補充\n更多內容。'}, {path:'sample/references/sources.md',text:'https://example.org'}]);
  expect(result.files).toHaveLength(3);
  expect(result.files[0].text).toContain('(references/facts.md)');expect(result.files[0].text).not.toContain('missing');
  expect(result.files[1].text).toContain('細節未查證');expect(result.files[1].text).toContain('更多內容');
  // The model decides what to keep; the storage layer must not censor by heading or filename.
  expect(result.files[1].text).toContain('## 參考來源\n外部網站 https://example.org');
  expect(result.files[2]).toEqual({path:'sample/references/sources.md',text:'https://example.org'});
 }finally{close();}
});

test('web-assisted creation stores articles without source URLs and injects their content',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-create-')),port:19512,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const original=globalThis.fetch;let truncated=false;
 try{
  await saveSearchSettings({enabled:false,knowledgeEnabled:true,provider:'brave',key:'test-only'});
  globalThis.fetch=Object.assign(async(url:unknown,init?:RequestInit)=>{
   if(String(url).includes('api.search.brave.com'))return Response.json({web:{results:[{title:'背景',url:'https://outside.example/source',description:'可整理的背景資訊。'}]}});
   const body=JSON.parse(String(init?.body));const name=body.tools[0].function.name;
   if(name==='read_knowledge')return Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:'{"path":"sample"}'}}]}}]});
   expect(body.messages[0].content).toContain(prompt('knowledge.generator'));
   expect(body.messages[1].content).toContain('可整理的背景資訊');expect(body.messages[1].content).not.toContain('outside.example');
   return Response.json({choices:[{finish_reason:truncated?'length':'tool_calls',message:{tool_calls:[{function:{name,arguments:JSON.stringify({files:[main,{path:'sample/references/facts.md',text:'# 完整說明\n正文與具體細節。'}]})}}]}}]});
  },{preconnect:original.preconnect});
  const args={topic:'範例',direction:'完整說明',search:true};
  truncated=true;await expect(generateKnowledge(args,new AbortController().signal)).rejects.toThrow('截斷');expect(existsSync(join(knowledgeRoot(),'sample'))).toBe(false);
  truncated=false;const result=await generateKnowledge(args,new AbortController().signal);
  expect(result.files).toEqual(['sample/KNOWLEDGE.md','sample/references/facts.md']);expect(result).not.toHaveProperty('sources');
  for(const file of result.files)expect(readFileSync(join(knowledgeRoot(),file),'utf8')).not.toMatch(/https?:\/\/|搜尋摘要不應存入/);
  const context=await knowledgeContext('https://example.com/v1/chat/completions',{key:'test-only',model:'mock'},'範例');
  expect(context).toContain('正文與具體細節');expect(context).not.toContain('outside.example');
 }finally{globalThis.fetch=original;close();}
});
