import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultContent } from '../core/content';
import { createGame } from '../core/engine';
import { generateProactiveLine, selectLineSenders, startContactGreeting, startProactiveLine } from '../server/proactive-line';
import {read,write} from '../server/repository';
import { initializeRuntime } from '../server/runtime';
import {saveKnowledgeFiles} from '../server/knowledge';

test('sampling supports zero or multiple known contacts and excludes strangers', () => {
  const s = createGame(defaultContent);
  s.met = ['kaju', 'anna']; s.contacts = ['kaju', 'anna', 'lemon'];
  expect(selectLineSenders(s, defaultContent, () => 1)).toEqual([]);
  expect(selectLineSenders(s, defaultContent, () => 0).map(ch => ch.id).sort()).toEqual(['anna', 'kaju']);
});

test('proactive LINE overlaps scene work, preserves scene state and skips repeated time slots', async () => {
  const close = initializeRuntime({ dataDir: mkdtempSync(join(tmpdir(), 'proactive-line-')), port: 19518,
    env: { AI_API_URL: 'https://example.com/v1', AI_API_KEY: 'test', AI_MODEL: 'test' } });
  const original = globalThis.fetch, random = Math.random;
  let sceneStarted = false, calls = 0;
  try {
    Math.random = () => 0;
    globalThis.fetch = Object.assign(async (_url: unknown, init?: RequestInit) => {
      calls++;
      expect(sceneStarted).toBe(true);
      expect((init as any).timeout).toBe(false);
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toContain('2026-07-13');
      return Response.json({ choices: [{ message: { tool_calls: [{ function: {
        name: 'send_proactive_line', arguments: JSON.stringify({ send: true, text: 'Hello', image:false }),
      } }] } }] });
    }, { preconnect: original.preconnect });
    const s = createGame(defaultContent);
    s.date = '2026-07-13'; s.met = ['kaju']; s.contacts = ['kaju'];
    const done=startProactiveLine('test',s,defaultContent);
    sceneStarted=true; s.dialogue.text='New scene';
    await write('game:test',s); done(true);
    for(let n=0;n<100;n++){const current=await read<any>('game:test',null);if(current.messages.kaju?.length){Object.assign(s,current);break;}await Bun.sleep(1);}
    expect(calls).toBe(1);
    expect(s.dialogue.text).toBe('New scene');
    expect(s.messages.kaju).toHaveLength(1);expect(s.messages.kaju[0]).toMatchObject({from:'kaju',text:'Hello',date:s.date});
    expect(s.memories.kaju.recent.at(-1)?.phase).toBe(s.phase);
    startProactiveLine('test',s,defaultContent)(true);
    expect(calls).toBe(1);
    globalThis.fetch = Object.assign(async () => { throw Error('offline'); }, { preconnect: original.preconnect });
    const old = structuredClone(s); s.phase = 2;
    const finish=startProactiveLine('test',s,defaultContent,old); s.dialogue.text='Night';
    await write('game:test',s);finish(true);await Bun.sleep(10);
    expect(s.dialogue.text).toBe('Night');
    expect(s.messages.kaju).toHaveLength(1);
  } finally { globalThis.fetch = original; Math.random = random; close(); }
});

test('a slow LINE reply does not hold the scene commit and cannot enter a replaced game', async () => {
  const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'line-slow-')),port:19518,
    env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'test'}});
  const original=globalThis.fetch,random=Math.random;
  let release!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;});
  try{
    Math.random=()=>0;
    globalThis.fetch=Object.assign(async()=>{
      await waiting;
      return Response.json({choices:[{message:{tool_calls:[{function:{name:'send_proactive_line',arguments:JSON.stringify({send:true,text:'Late reply',image:false})}}]}}]});
    },{preconnect:original.preconnect});
    const s=createGame(defaultContent);s.met=['kaju'];s.contacts=['kaju'];
    const finish=startProactiveLine('slow',s,defaultContent);
    s.dialogue.text='Scene is already available';
    await write('game:slow',s);finish(true);
    expect((await read<any>('game:slow',null)).dialogue.text).toBe('Scene is already available');
    const replacement=createGame(defaultContent);
    await write('game:slow',replacement);
    release();await Bun.sleep(20);
    expect(await read<typeof replacement|null>('game:slow',null)).toEqual(replacement);
  }finally{release();globalThis.fetch=original;Math.random=random;close();}
});

test('exchanging LINE starts one in-character greeting after the new state commits',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'line-greeting-')),port:19519,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'test'}});
 const original=globalThis.fetch;
 try{
  let calls=0;globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{calls++;const body=JSON.parse(String(init?.body));expect(body.tools[0].function.name).toBe('send_contact_greeting');expect(body.messages[0].content).toContain('LINE');return Response.json({choices:[{message:{tool_calls:[{function:{name:'send_contact_greeting',arguments:JSON.stringify({text:'これからよろしくね。'})}}]}}]});},{preconnect:original.preconnect});
  const s=createGame(defaultContent);s.met.push('anna');s.contacts.push('anna');
  const finish=startContactGreeting('greeting',s,defaultContent,'anna');await write('game:greeting',s);finish(true);
  let saved=s;for(let i=0;i<100;i++){saved=await read<any>('game:greeting',s);if(saved.messages.anna?.some((message:any)=>message.from==='anna'))break;await Bun.sleep(2);}
  expect(saved.messages.anna.at(-1)).toMatchObject({from:'anna',text:'これからよろしくね。'});expect(calls).toBe(1);
  startContactGreeting('greeting',saved,defaultContent,'anna')(true);await Bun.sleep(5);expect(calls).toBe(1);
 }finally{globalThis.fetch=original;close();}
});
test('proactive LINE can retrieve supplemental knowledge before writing',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'line-knowledge-')),port:19520,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'test'}}),original=globalThis.fetch,random=Math.random;
 try{
  Math.random=()=>0;saveKnowledgeFiles([{path:'school-fact/KNOWLEDGE.md',text:'---\nname: school-fact\ndescription: 校園知識\n---\n圖書室今天適合安靜閱讀。'}]);const s=createGame(defaultContent);s.met=['kaju'];s.contacts=['kaju'];let calls=0;
  globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{calls++;const body=JSON.parse(String(init?.body)),name=body.tools[0].function.name;if(name==='read_knowledge')return Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:'{"path":"school-fact"}'}}]}}]});expect(body.messages[0].content).toContain('圖書室今天適合安靜閱讀。');return Response.json({choices:[{message:{tool_calls:[{function:{name:'send_proactive_line',arguments:JSON.stringify({send:true,text:'要不要去圖書室？',image:false,expectsReply:true,twitterPost:null})}}]}}]});},{preconnect:original.preconnect});
  const result=await generateProactiveLine(s,defaultContent);expect(result[0]).toMatchObject({id:'kaju',text:'要不要去圖書室？'});expect(calls).toBe(2);
 }finally{globalThis.fetch=original;Math.random=random;close();}
});
