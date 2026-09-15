import {test,expect} from 'bun:test';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeRuntime} from '../server/runtime';
import {saveSearchSettings,publicSearchSettings,webSearch,searchContext} from '../server/web-search';
import {generateKnowledge} from '../server/knowledge-generate';
import {knowledgeRoot} from '../server/knowledge';
test('provider keys are isolated, redacted, required only when enabled; generation saves a complete knowledge entry',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'search-')),port:19493,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'model-key',AI_MODEL:'mock'}});const original=globalThis.fetch;let calls=0;
 try{
  await expect(saveSearchSettings({enabled:true,provider:'brave',key:''})).rejects.toThrow();
  await saveSearchSettings({enabled:true,provider:'brave',key:'brave-secret'});
  expect(JSON.stringify(await publicSearchSettings())).not.toContain('brave-secret');
  await expect(saveSearchSettings({enabled:true,provider:'serpapi',key:''})).rejects.toThrow();
  globalThis.fetch=(async(url:unknown,init?:RequestInit)=>{calls++;expect(String(url)).toContain('api.search.brave.com');expect((init!.headers as any)['X-Subscription-Token']).toBe('brave-secret');return Response.json({web:{results:[{title:'Info',url:'https://example.org',description:'notes'}]}});}) as unknown as typeof fetch;
  expect((await webSearch('school'))[0].snippet).toBe('notes');
  await saveSearchSettings({enabled:false,knowledgeEnabled:true,provider:'brave',key:''});
  expect(await searchContext('hello')).toBe('');
  await expect(webSearch('school')).rejects.toThrow();
  expect((await webSearch('school',undefined,'knowledge'))[0].snippet).toBe('notes');
  await saveSearchSettings({enabled:true,knowledgeEnabled:false,provider:'brave',key:''});
  await expect(webSearch('school',undefined,'knowledge')).rejects.toThrow();
  expect((await webSearch('school'))[0].snippet).toBe('notes');
  await saveSearchSettings({enabled:true,provider:'serpapi',key:'serp-secret'});
  globalThis.fetch=(async(url:unknown)=>{expect(new URL(String(url)).searchParams.get('api_key')).toBe('serp-secret');return Response.json({organic_results:[{title:'Info',link:'https://example.org',snippet:'result'}]});}) as unknown as typeof fetch;
  expect((await webSearch('school'))[0].url).toBe('https://example.org');
  await saveSearchSettings({enabled:false,provider:'serpapi',key:''});expect(await searchContext('hello')).toBe('');
  await expect(generateKnowledge({topic:'School',direction:'notes',search:true},new AbortController().signal)).rejects.toThrow();
  globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'create_knowledge',arguments:JSON.stringify({files:[{path:'school/KNOWLEDGE.md',text:'---\nname: school\ndescription: School knowledge\n---\nRead references/notes.md'},{path:'school/references/notes.md',text:'Knowledge.'}]})}}]}}]})) as unknown as typeof fetch;
  const result=await generateKnowledge({topic:'School',direction:'notes',search:false},new AbortController().signal);expect(result.files).toHaveLength(2);expect(readFileSync(join(knowledgeRoot(),'school/references/notes.md'),'utf8')).toBe('Knowledge.');
  await expect(generateKnowledge({topic:'School',direction:'notes',search:false},new AbortController().signal)).rejects.toThrow('同名');
 }finally{globalThis.fetch=original;close();}
});

