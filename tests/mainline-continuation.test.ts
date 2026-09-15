import {test,expect} from 'bun:test';
import {defaultContent} from '../core/content';
import {continuationEvents,addContinuation,mainlinePack} from '../core/mainline-continuation';
import {act,createGame,eventEligible} from '../core/engine';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
test('every continuation has reachable prerequisites and resolves into memory and gallery',()=>{
 expect(continuationEvents).toHaveLength(19);
 for(const e of continuationEvents){
  const visited=new Set<string>();let p=e.prerequisite;
  while(p){expect(visited.has(p)).toBe(false);visited.add(p);const prev=defaultContent.events.find(x=>x.id===p);expect(prev).toBeDefined();p=prev!.prerequisite;}
  let s=act(createGame(defaultContent),defaultContent,{type:'choose',index:0});
  const year=2025+e.minYear+(e.month<4?1:0);s.date=`${year}-${String(e.month).padStart(2,'0')}-10`;
  while([0,6].includes(new Date(s.date+'T12:00:00Z').getUTCDay()))s.date=s.date.slice(0,8)+String(Number(s.date.slice(8))+1);
  s.phase=1;s.location=e.place;s.completed.push(...visited,...(e.requiredEvents??[]));
  expect(eventEligible(s,defaultContent,e)).toBe(true);
  // Resolve earlier eligible events at this location before reaching this chapter.
  for(let i=0;i<defaultContent.events.length;i++){
   s.flags=s.flags.filter(f=>!f.startsWith('visited:'));
   s=act(s,defaultContent,{type:'visit',place:e.place});
   const id=s.dialogue.eventId;s=act(s,defaultContent,{type:'choose',index:0});
   if(id===e.id)break;
  }
  expect(s.completed).toContain(e.id);expect(s.gallery).toContain(e.id);expect(s.flags).toContain(`mainline:${e.id}`);
  expect(existsSync(join(import.meta.dir,'../content/assets',e.cg.slice('/assets/authored/'.length)))).toBe(true);
 }
});
test('continuation migration preserves subsequent deletions',()=>{
 const c=structuredClone(defaultContent);c.events=c.events.filter(e=>e.id!==continuationEvents[0].id);
 expect(c.storyPacks).toContain(mainlinePack);expect(addContinuation(c).events.some(e=>e.id===continuationEvents[0].id)).toBe(false);
});
test('return from Hida cannot recall an unseen confession',()=>{
 const e=defaultContent.events.find(e=>e.id==='v9-return')!;
 const s=createGame(defaultContent);s.date='2027-08-10';s.phase=1;s.location=e.place;s.completed=['v9-answer'];
 expect(eventEligible(s,defaultContent,e)).toBe(false);
 s.completed.push('v8-confession');expect(eventEligible(s,defaultContent,e)).toBe(true);
});
