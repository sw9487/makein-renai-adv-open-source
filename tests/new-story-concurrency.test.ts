import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGame} from '../core/engine';
import {defaultContent} from '../core/content';
import type {GameState} from '../core/types';
import {initializeRuntime} from '../server/runtime';
import {commit,commitNewStory,commitLoadedStory,saveGameSlot,insertInitialGame,read,write} from '../server/repository';
import {GET as getGame} from '../server/game-api';
import {commitConcurrent} from '../server/concurrent-state';

test('new story accepts background writes during scene preparation without carrying old social state',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'new-story-race-'));
 const close=initializeRuntime({dataDir:join(dir,'data'),projectDir:dir,port:9487,env:{}});
 try{
  const owner='reset-race',old=createGame(defaultContent);
  old.runId='old-run';old.sceneRevision=0;old.socialApps={line:true,twitter:true};
  await write('game:'+owner,old);
  const fresh=createGame(defaultContent);fresh.runId='new-run';
  const background=structuredClone(old);background.revision++;background.messages.kaju=[{from:'kaju',text:'old run',date:old.date}];background.socialApps={...background.socialApps!,twitter:false};
  await commit(owner,background,old);
  await commitNewStory(owner,fresh,old);
  const saved=await read<GameState|null>('game:'+owner,null);
  expect(saved?.runId).toBe('new-run');expect(saved?.revision).toBe(background.revision+1);
  expect(saved?.sceneRevision).toBe(1);expect(saved?.messages.kaju??[]).toEqual([]);
  expect(saved?.socialApps).toEqual({line:true,twitter:false});
 }finally{close();rmSync(dir,{recursive:true,force:true});}
});

test('new story refuses a changed scene or another reset while its scene is prepared',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'new-story-stale-'));
 const close=initializeRuntime({dataDir:join(dir,'data'),projectDir:dir,port:9487,env:{}});
 try{
  const owner='stale-race',old=createGame(defaultContent);old.runId='old-run';old.sceneRevision=0;
  await write('game:'+owner,old);
  const next=createGame(defaultContent);next.runId='new-run';
  const advanced=structuredClone(old);advanced.revision++;advanced.sceneRevision=1;
  await commit(owner,advanced,old);
  await expect(commitNewStory(owner,next,old)).rejects.toThrow('進度已更新');
  const another=structuredClone(advanced);another.runId='other-run';another.revision++;
  await commit(owner,another,advanced);
  await expect(commitNewStory(owner,next,old)).rejects.toThrow('進度已更新');
 }finally{close();rmSync(dir,{recursive:true,force:true});}
});
test('load and save use the latest background revision without losing scene safety',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'load-story-race-'));
 const close=initializeRuntime({dataDir:join(dir,'data'),projectDir:dir,port:9487,env:{}});
 try{
  const owner='load-race',old=createGame(defaultContent);old.runId='old-run';old.sceneRevision=0;
  await write('game:'+owner,old);
  const background=structuredClone(old);background.revision++;background.messages.kaju=[{id:'received',from:'kaju',text:'背景訊息',date:old.date}];background.socialApps={line:true,twitter:false};
  await commit(owner,background,old);
  const saved=await saveGameSlot(owner,1,old);
  expect(saved.revision).toBe(background.revision);
  expect((await read<GameState>(`save:${owner}:1`,old)).messages.kaju[0].id).toBe('received');
  const snapshot=createGame(defaultContent);snapshot.dialogue.text='讀檔內容';
  const loaded=await commitLoadedStory(owner,snapshot,old);
  expect(loaded.dialogue.text).toBe('讀檔內容');
  expect(loaded.socialApps?.twitter).toBe(false);
  expect(loaded.revision).toBe(background.revision+1);
  await expect(commitLoadedStory(owner,snapshot,old)).rejects.toThrow();
 }finally{close();rmSync(dir,{recursive:true,force:true});}
});
test('simultaneous initial writes and legacy GET repairs never replace an existing run',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'initial-story-race-'));
 const close=initializeRuntime({dataDir:join(dir,'data'),projectDir:dir,port:9487,env:{}});
 try{
  const owner='a'.repeat(64),first=createGame(defaultContent),second=createGame(defaultContent);
  first.seed=111;second.seed=222;
  expect(await insertInitialGame(owner,first)).toBe(true);
  expect(await insertInitialGame(owner,second)).toBe(false);
  const responses=await Promise.all(Array.from({length:6},()=>getGame(new Request('http://localhost:9487/api/game',{headers:{Cookie:`makeine_player=${owner}`}}))));
  expect(responses.every(response=>response.status===200)).toBe(true);
  const saved=await read<GameState|null>('game:'+owner,null);
  expect(saved?.seed).toBe(111);expect(saved?.runId).toBeTruthy();
 }finally{close();rmSync(dir,{recursive:true,force:true});}
});
test('a burst of background updates converges without losing messages',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'background-write-burst-'));
 const close=initializeRuntime({dataDir:join(dir,'data'),projectDir:dir,port:9487,env:{}});
 try{
  const owner='burst',baseline=createGame(defaultContent);baseline.runId='burst-run';baseline.sceneRevision=0;
  await write('game:'+owner,baseline);
  await Promise.all(Array.from({length:16},(_,index)=>{
   const next=structuredClone(baseline);
   next.messages.kaju=[{id:`message-${index}`,from:'kaju',text:`訊息 ${index}`,date:baseline.date}];
   return commitConcurrent(owner,next,baseline,true);
  }));
  const saved=await read<GameState>('game:'+owner,baseline);
  expect(new Set(saved.messages.kaju.map(message=>message.id)).size).toBe(16);
  expect(saved.sceneRevision).toBe(0);
 }finally{close();rmSync(dir,{recursive:true,force:true});}
});
