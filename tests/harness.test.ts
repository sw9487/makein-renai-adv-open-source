import {test,expect} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeRuntime,db} from '../server/runtime';
import {admittedRequest} from '../server/harness-request';
import {appendEvent,eventStream} from '../server/harness-events';
import {write,commit,read} from '../server/repository';
import {createGame} from '../core/engine';
import {defaultContent} from '../core/content';
import {budgetRequest,modelFetch,ModelError} from '../server/model-runtime';
import {ToolRegistry} from '../server/tool-registry';
import {POST} from '../server/game-api';
const runtime=()=>initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'harness-')),port:19518,env:{}});

test('duplicate request joins one execution; changed input and unknown restart are rejected',async()=>{
 const close=runtime();try{
  let count=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const input={requestId:crypto.randomUUID(),type:'test'};
  const work=async()=>{count++;await gate;return Response.json({ok:true});};
  const first=admittedRequest('owner',input,work),second=admittedRequest('owner',input,work);
  for(let i=0;i<20&&count===0;i++)await new Promise(resolve=>setTimeout(resolve,1));
  expect(count).toBe(1);release();await first;expect(await (await second).json()).toEqual({ok:true});
  expect((await admittedRequest('owner',{...input,type:'changed'},work)).status).toBe(409);
  const fresh={requestId:crypto.randomUUID(),type:'other'};
  // Complete one request, then simulate a process-loss record with no confirmed result.
  await (await admittedRequest('owner',fresh,async()=>Response.json({ok:true}))).json();
  await admittedRequest('owner',fresh,work);
  await db().query("UPDATE harness_requests SET status='running',result=NULL WHERE request_id=?",[fresh.requestId]);
  expect((await admittedRequest('owner',fresh,work)).status).toBe(409);expect(count).toBe(1);
 }finally{close();}
});

test('state commit and request settlement are atomic even if response processing fails',async()=>{
 const close=runtime();try{
  const old=createGame(defaultContent);old.runId='run';await write('game:owner',old);
  const input={requestId:crypto.randomUUID(),runId:'run',type:'advance'};
  const next=structuredClone(old);next.revision++;
  const work=async()=>{await commit('owner',next,old);return Response.json({error:'trailing failure'},{status:500});};
  await admittedRequest('owner',input,work);
  const replay=await admittedRequest('owner',input,work);
  expect(replay.status).toBe(200);expect((await replay.json()).state.revision).toBe(next.revision);
  expect((await db().query<any>('SELECT count(*) AS n FROM harness_events')).rows[0].n).toBe(1);
 }finally{close();}
});

test('real game API repeats one LINE reply and rejects old-run replay',async()=>{
 const close=runtime();try{
  const owner='a'.repeat(64),s=createGame(defaultContent);s.runId='original';await write('game:'+owner,s);
  const input={type:'chat',channel:'line',character:'kaju',text:'Hello',requestId:crypto.randomUUID(),runId:s.runId,revision:s.revision};
  const req=()=>new Request('http://localhost:19518/api/game',{method:'POST',headers:{Origin:'http://localhost:19518',Cookie:'makeine_player='+owner,'Content-Type':'application/json'},body:JSON.stringify(input)});
  expect((await POST(req())).status).toBe(200);expect((await POST(req())).status).toBe(200);
  expect((await read<any>('game:'+owner,null)).messages.kaju).toHaveLength(2);
  await write('game:'+owner,{...s,runId:'replacement'});
  expect((await POST(req())).status).toBe(409);
  input.requestId=crypto.randomUUID();
  expect((await POST(req())).status).toBe(409);
  expect((await read<any>('game:'+owner,null)).messages).toEqual(s.messages);
 }finally{close();}
});

test('SSE replay follows durable seq and never exposes another owner',async()=>{
 const close=runtime();const abort=new AbortController();try{
  appendEvent('one','r','line.received',{revision:1});
  appendEvent('two','r','line.received',{private:'not-for-one'});
  appendEvent('one','r','line.received',{revision:2});
  const stream=eventStream(new Request('http://localhost/api/game?events=1',{headers:{'Last-Event-ID':'1'},signal:abort.signal}),'one');
  const reader=stream.body!.getReader();const data=new TextDecoder().decode((await reader.read()).value);
  expect(data).toContain('id: 3');expect(data).toContain('"revision":2');expect(data).not.toContain('not-for-one');
  await reader.cancel();
 }finally{abort.abort();close();}
});

test('SSE retention keeps only fresh events and the newest 2000 per owner',async()=>{
 const close=runtime();try{const database=db(),now=Date.now();
 await database.query("DELETE FROM harness_events WHERE owner IN ('retained','other')");
 for(let i=0;i<2001;i++)await database.query('INSERT INTO harness_events(owner,run_id,type,payload,created) VALUES(?,?,?,?,?)',['retained','r','game.changed','{}',now]);
 await database.query('INSERT INTO harness_events(owner,run_id,type,payload,created) VALUES(?,?,?,?,?)',['retained','r','game.changed','{}',now-25*60*60*1000]);
 await database.query('INSERT INTO harness_events(owner,run_id,type,payload,created) VALUES(?,?,?,?,?)',['other','r','game.changed','{}',now-25*60*60*1000]);
 await appendEvent('retained','r','game.changed',{revision:1});
 const retained=(await database.query<{n:number;oldest:number}>('SELECT COUNT(*) n,MIN(created) oldest FROM harness_events WHERE owner=?',['retained'])).rows[0];
 expect(Number(retained.n)).toBeLessThanOrEqual(2000);expect(Number(retained.n)).toBeGreaterThan(0);expect(Number(retained.oldest)).toBeGreaterThan(now-24*60*60*1000);
 expect(Number((await database.query<{n:number}>('SELECT COUNT(*) n FROM harness_events WHERE owner=?',['other'])).rows[0].n)).toBe(1);
 }finally{close();}
});

test('context budget removes complete exchanges without modifying source messages',()=>{
 const body={max_tokens:100,messages:[{role:'system',content:'Character and current date'},{role:'assistant',content:'x'.repeat(6000),tool_calls:[{id:'call'}]},{role:'tool',tool_call_id:'call',content:'old result'},{role:'user',content:'Current question'}]};
 const result=budgetRequest(body,1000);
 expect(result.messages.map((m:any)=>m.role)).toEqual(['system','user']);expect(body.messages).toHaveLength(4);
 expect(()=>budgetRequest({...body,messages:[{role:'system',content:'x'.repeat(10000)}]},100)).toThrow();
});

test('tool registry omits disabled tools and validates before executing',async()=>{
 const registry=new ToolRegistry();let count=0;
 const definition={schema:{type:'function',function:{name:'image'}},parse:(raw:string)=>{const x=JSON.parse(raw);if(typeof x.prompt!=='string')throw Error('invalid');return x;},execute:async()=>{count++;return 'url';},validateResult:(r:string)=>{if(r!=='url')throw Error('invalid');}};
 registry.register(definition,false);expect(registry.schemas()).toEqual([]);
 await expect(registry.execute('image','{}')).rejects.toThrow();
 registry.register(definition);await expect(registry.execute('image','{}')).rejects.toThrow();expect(count).toBe(0);
 expect(await registry.execute('image','{"prompt":"hello"}')).toBe('url');expect(count).toBe(1);
 expect(JSON.stringify(registry.schemas())).not.toContain('execute');
});

test('disconnecting a streamed caller does not resubmit or cancel the owned job',async()=>{
 const close=runtime();try{
  const input={requestId:crypto.randomUUID(),type:'stream'};let calls=0;
  const work=async()=>{
    calls++;return new Response(new ReadableStream<Uint8Array>({start(controller){
      setTimeout(()=>{controller.enqueue(new TextEncoder().encode('event: done\ndata: {"reply":"finished"}\n\n'));controller.close();},10);
    }}),{headers:{'Content-Type':'text/event-stream'}});
  };
  const first=await admittedRequest('owner',input,work);void first.body!.cancel();
  const second=await admittedRequest('owner',input,work);
  expect(await second.json()).toEqual({reply:'finished'});expect(calls).toBe(1);
 }finally{close();}
});

test('model adapter distinguishes rate limits, disables deadlines and never auto-retries',async()=>{
 const close=runtime(),original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{
    calls++;expect((init as any).timeout).toBe(false);return Response.json({error:{code:'rate_limit'}},{status:429});
  },{preconnect:original.preconnect});
  try{await modelFetch('https://example.com/v1/chat/completions',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:'Hi'}]})});throw Error('expected error');}
  catch(error){expect(error).toBeInstanceOf(ModelError);expect((error as ModelError).kind).toBe('rate-limit');}
  expect(calls).toBe(1);
 }finally{globalThis.fetch=original;close();}
});
