import {test,expect} from 'bun:test';
import {mergeConcurrentState} from '../server/concurrent-state';
import {createGame} from '../core/engine';
import {defaultContent} from '../core/content';
test('LINE completion and story image preserve each other in both completion orders',()=>{
 const old=createGame(defaultContent),line=structuredClone(old),image=structuredClone(old);
 line.messages.kaju=[...(old.messages.kaju??[]),{from:'kaju',text:'訊息',date:old.date}];
 line.affection.kaju=(old.affection.kaju??0)+1;
 image.dialogue.cg='/api/media/test.png';
 const first=mergeConcurrentState(old,line,old);
 const result=mergeConcurrentState(old,image,first);
 expect(result.messages.kaju).toEqual(line.messages.kaju);expect(result.dialogue.cg).toBe(image.dialogue.cg);expect(result.affection.kaju).toBe(line.affection.kaju);
 const reverse=mergeConcurrentState(old,line,mergeConcurrentState(old,image,old));
 expect(reverse).toEqual(result);
});
test('parallel conversation memories and affection deltas merge without lost replies',()=>{
 const old=createGame(defaultContent);old.memories.kaju={summary:'',facts:[],recent:[],turns:0};old.affection.kaju=10;
 const line=structuredClone(old),talk=structuredClone(old);
 line.memories.kaju.recent=[{role:'assistant',content:'LINE',channel:'line'}];line.memories.kaju.turns=1;line.affection.kaju=12;
 talk.memories.kaju.recent=[{role:'assistant',content:'現場',channel:'talk'}];talk.memories.kaju.turns=1;talk.affection.kaju=13;
 talk.dialogue.text='現場';
 const result=mergeConcurrentState(old,talk,mergeConcurrentState(old,line,old));
 expect(result.memories.kaju.recent.map(m=>m.content)).toEqual(['LINE','現場']);expect(result.memories.kaju.turns).toBe(2);expect(result.affection.kaju).toBe(15);expect(result.dialogue.text).toBe('現場');
});
test('read receipts merge with concurrent LINE replies without duplicating old messages',()=>{
 const old=createGame(defaultContent);old.messages.kaju=[{id:'first',from:'kaju',text:'先前的訊息',date:old.date}];
 const read=structuredClone(old),reply=structuredClone(old);
 read.messages.kaju[0].readByPlayerAt=200;
 reply.messages.kaju.push({id:'second',from:'player',text:'新的回覆',date:old.date});
 const merged=mergeConcurrentState(old,read,reply);
 expect(merged.messages.kaju.map(message=>message.id)).toEqual(['first','second']);
 expect(merged.messages.kaju[0].readByPlayerAt).toBe(200);
 const otherRead=structuredClone(old);otherRead.messages.kaju[0].readByPlayerAt=100;
 expect(mergeConcurrentState(old,read,otherRead).messages.kaju[0].readByPlayerAt).toBe(100);
});
test('parallel memory facts and summaries retain both updates',()=>{
 const old=createGame(defaultContent);old.memories.kaju={summary:'原有記憶',facts:[],recent:[],turns:0};
 const line=structuredClone(old),scene=structuredClone(old);
 line.memories.kaju.summary='原有記憶 LINE 新資訊';line.memories.kaju.facts=['LINE 事實'];
 scene.memories.kaju.summary='原有記憶 現場新資訊';scene.memories.kaju.facts=['現場事實'];
 const merged=mergeConcurrentState(old,scene,line);
 expect(merged.memories.kaju.facts).toEqual(['LINE 事實','現場事實']);
 expect(merged.memories.kaju.summary).toContain('LINE 新資訊');
 expect(merged.memories.kaju.summary).toContain('現場新資訊');
});
test('identical concurrent slot markers do not conflict, while counters still add deltas',()=>{
 const old=createGame(defaultContent),first=structuredClone(old),second=structuredClone(old);
 first.twitter!.slots['2026-07-13:1']=true;second.twitter!.slots['2026-07-13:1']=true;
 first.twitter!.npcInteractions={'thread':1};second.twitter!.npcInteractions={'thread':1};
 const merged=mergeConcurrentState(old,first,second);
 expect(merged.twitter!.slots['2026-07-13:1']).toBe(true);
 expect(merged.twitter!.npcInteractions?.thread).toBe(2);
});
test('parallel Twitter typing updates do not resurrect a removed indicator',()=>{
 const old=createGame(defaultContent);old.twitter!.typing=[{actor:'anna',postId:'old'}];
 const next=structuredClone(old),current=structuredClone(old);
 next.twitter!.typing=[{actor:'kaju',postId:'new'}];
 current.twitter!.typing=[{actor:'anna',postId:'old'},{actor:'komari',postId:'other'}];
 const merged=mergeConcurrentState(old,next,current);
 expect(merged.twitter!.typing).toEqual([{actor:'komari',postId:'other'},{actor:'kaju',postId:'new'}]);
});
