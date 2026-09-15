import {test,expect} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeRuntime} from '../server/runtime';
import {write} from '../server/repository';
import {createAiStatusCheck} from '../server/ai-status';

test('startup API check detects missing settings, model failures and recovery without stale caching',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'ai-status-')),port:19518,env:{}});
 const original=globalThis.fetch;let calls=0;let ok=false;
 try{
  globalThis.fetch=Object.assign(async(url:unknown,init?:RequestInit)=>{
   calls++;expect(String(url)).toBe('https://example.com/v1/models');expect(init?.method).toBe('GET');
   return ok?Response.json({data:[{id:'test-model'}]}):new Response('',{status:401});
  },{preconnect:original.preconnect});
  const check=createAiStatusCheck();
  expect((await check()).status).toBe('missing');expect(calls).toBe(0);
  await write('api-settings',{url:'https://example.com/v1',key:'test-secret',model:'test-model'});
  const failed=await check();expect(failed.status).toBe('unavailable');expect(failed.message).toContain('HTTP 401');expect(JSON.stringify(failed)).not.toContain('test-secret');
  await check();expect(calls).toBe(2);
  ok=true;await write('api-settings',{url:'https://example.com/v1',key:'updated-secret',model:'test-model'});
  expect((await check()).status).toBe('ready');expect(calls).toBe(3);
 }finally{globalThis.fetch=original;close();}
});

test('startup check requires the configured model to appear in /v1/models',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'ai-reasoning-')),port:19518,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-secret',AI_MODEL:'reasoner'}});
 const original=globalThis.fetch;
 try{
  globalThis.fetch=Object.assign(async(url:unknown,init?:RequestInit)=>{
   expect(String(url)).toBe('https://example.com/v1/models');expect(init?.body).toBeUndefined();
   return Response.json({data:[{id:'reasoner'}]});
  },{preconnect:original.preconnect});
  expect((await createAiStatusCheck()()).status).toBe('ready');
  globalThis.fetch=Object.assign(async()=>Response.json({data:[{id:'another-model'}]}),{preconnect:original.preconnect});
  expect((await createAiStatusCheck()()).status).toBe('unavailable');
 }finally{globalThis.fetch=original;close();}
});
