import {test,expect} from 'bun:test';
import {apiFetch,type ApiRequestInit} from '../server/api-fetch';
test('API requests disable socket deadlines while preserving explicit cancellation',async()=>{
 const original=globalThis.fetch,controller=new AbortController();
 try{
  globalThis.fetch=Object.assign(async(_url:unknown,init?:ApiRequestInit)=>{
   expect(init?.timeout).toBe(false);expect(init?.signal).toBe(controller.signal);
   expect(init?.signal?.aborted).toBe(false);return new Response('OK');
  },{preconnect:original.preconnect});
  expect(await (await apiFetch('https://example.com',{signal:controller.signal})).text()).toBe('OK');
 }finally{globalThis.fetch=original;}
});
