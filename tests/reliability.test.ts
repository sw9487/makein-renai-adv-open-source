import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {queuedImage,imageByteLimit} from '../server/image-queue';
import {initializeRuntime} from '../server/runtime';
import {read,write} from '../server/repository';
import {imageJobResult} from '../server/image-jobs';
import {compactMemory,emptyMemory,createGame} from '../core/engine';
import {defaultContent} from '../core/content';
import {commitConcurrent} from '../server/concurrent-state';
import {inboxStatus} from '../core/line-inbox';
import {GET as editorGet} from '../server/editor-api';

test('SD queue waits for the first job, continues after failure and separates endpoints',async()=>{
 let release!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;});
 const order:string[]=[];
 const first=queuedImage('test',async()=>{order.push('first');await hold;throw Error('SD failed');}).catch(()=>{});
 const second=queuedImage('test',async()=>{order.push('second');return 'image';});
 await queuedImage('other',async()=>{order.push('other');});
 expect(order).toEqual(['first','other']);release();await first;
 expect(await second).toBe('image');expect(order).toEqual(['first','other','second']);
 const cancelled=new AbortController();cancelled.abort();
 await expect(queuedImage('test',async()=>{throw Error('must not run');},cancelled.signal)).rejects.toThrow();
 expect(await queuedImage('test',async()=>42)).toBe(42);
 expect(imageByteLimit(3840,2160)).toBeGreaterThan(32*1024*1024);
});

test('persisted unfinished images are marked interrupted without submitting to SD',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'image-recovery-')),port:19518,env:{}});
 try{
  await write('image-job:test',{pending:true,status:'running',url:'/api/media/saved.png',created:1});
  const result=await imageJobResult('test');
  expect(result.imagePending).toBe(false);expect(result.imageStatus).toBe('interrupted');
  expect(result.imageUrl).toBe('/api/media/saved.png');
  expect((await read<any>('image-job:test',null)).status).toBe('interrupted');
 }finally{close();}
});

test('important dated facts and full archived messages survive chat compaction',()=>{
 const m=emptyMemory();
 m.important=[{kind:'promise',text:'Meet next Saturday',date:'2026-07-13',phase:2,channel:'line',evidence:'Accepted invitation'}];
 const long='a'.repeat(300)+' meaningful ending';
 m.recent=[{role:'user',content:long,date:'2026-07-13',phase:2,channel:'line'},{role:'assistant',content:'Okay'}];
 compactMemory(m,100,1);
 expect(m.archive?.[0].content).toBe(long);
 expect(m.important[0].evidence).toBe('Accepted invitation');
 expect(m.summary.length).toBeLessThanOrEqual(100);
});

test('background LINE increments transport revision without invalidating scene actions',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'line-revision-')),port:19518,env:{}});
 try{
  const old=createGame(defaultContent);await write('game:test',old);
  const next=structuredClone(old);next.messages.kaju=[{from:'kaju',text:'Hello',date:old.date}];
  const saved=await commitConcurrent('test',next,old,true);
  expect(saved.sceneRevision).toBe(old.sceneRevision??old.revision);
  expect(saved.revision).toBeGreaterThan(old.revision);
 }finally{close();}
});

test('read receipts distinguish repeated messages and remain per character',()=>{
 const messages=[{id:'a',from:'kaju',text:'Hello',date:'2026-07-13'},{id:'b',from:'kaju',text:'Hello',date:'2026-07-13'}];
 expect(inboxStatus(messages,'kaju','a').unread).toBe(1);
 expect(inboxStatus(messages,'kaju','b').unread).toBe(0);
 expect(inboxStatus(messages,'anna').unread).toBe(0);
});

test('editor settings return the configured API key',async()=>{
 const root=mkdtempSync(join(tmpdir(),'settings-secrets-'));
 mkdirSync(join(root,'content'));writeFileSync(join(root,'content/game.json'),JSON.stringify(defaultContent));
 const close=initializeRuntime({dataDir:root,projectDir:root,port:19518,env:{AI_API_KEY:'secret-llm-sentinel'}});
 try{
  const settings=await (await editorGet(new Request('http://localhost:19518/api/editor'))).json();
  expect(settings.api.hasKey).toBe(true);expect(settings.api.key).toBe('secret-llm-sentinel');
 }finally{close();}
});
