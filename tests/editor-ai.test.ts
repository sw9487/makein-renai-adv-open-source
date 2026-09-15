import {afterEach,expect,test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeRuntime} from '../server/runtime';
import {POST} from '../server/editor-api';
import {read,write} from '../server/repository';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const request=(body:unknown)=>new Request('http://localhost:9487/api/editor',{method:'POST',headers:{origin:'http://localhost:9487','content-type':'application/json'},body:JSON.stringify(body)});

test('saving AI settings verifies VLM and tool calling in exactly one request before persisting',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'editor-ai-')),close=initializeRuntime({dataDir:dir,port:9487,env:{}});let calls=0;
 try{
  globalThis.fetch=Object.assign(async(url:unknown,init?:RequestInit)=>{calls++;expect(String(url)).toBe('https://model.example/v1/chat/completions');const body=JSON.parse(String(init?.body));expect(body.tools[0].function.name).toBe('report_gender');expect(body.messages[0].content.filter((part:any)=>part.type==='image_url')).toHaveLength(1);return Response.json({choices:[{message:{tool_calls:[{function:{name:'report_gender',arguments:'{"gender":"girl"}'}}]}}]});},{preconnect:originalFetch.preconnect});
  const response=await POST(request({type:'api',url:'https://model.example/v1',model:'vision-tool-model',key:'secret',contextTokens:32768}));
  expect(response.status).toBe(200);expect(calls).toBe(1);expect(await read('api-settings',null)).toMatchObject({model:'vision-tool-model',key:'secret'});
 }finally{close();rmSync(dir,{recursive:true,force:true});}
});

test('field translation uses one strict tool-call request and rejects unapproved paths',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'editor-translate-')),close=initializeRuntime({dataDir:dir,port:9487,env:{}});let calls=0;
 try{
  await write('api-settings',{url:'https://model.example/v1',model:'translator',key:'secret'});
  globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{calls++;const body=JSON.parse(String(init?.body)),path=body.tools[0].function.parameters.properties.path.enum[0];expect(['events.0.title','publicAccounts.0.modules.patrol.prompt']).toContain(path);return Response.json({choices:[{message:{tool_calls:[{function:{name:'translate_field',arguments:JSON.stringify({path,translation:path.startsWith('events')?'Return Conditions':'Patrol public discussions'})}}]}}]});},{preconnect:originalFetch.preconnect});
  const response=await POST(request({type:'translate-field',section:'events',path:'events.0.title',text:'歸還之前的條件',language:'en'}));
  expect(response.status).toBe(200);expect((await response.json()).translation).toBe('Return Conditions');expect(calls).toBe(1);
  const module=await POST(request({type:'translate-field',section:'publicAccounts',path:'publicAccounts.0.modules.patrol.prompt',text:'公開討論を巡回する',language:'en'}));expect(module.status).toBe(200);expect((await module.json()).translation).toBe('Patrol public discussions');expect(calls).toBe(2);
  expect((await POST(request({type:'translate-field',section:'events',path:'events.0.id',text:'secret-id',language:'en'}))).status).toBe(400);expect(calls).toBe(2);
 }finally{close();rmSync(dir,{recursive:true,force:true});}
});
