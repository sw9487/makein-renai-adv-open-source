import {test,expect} from 'bun:test';
import {defaultContent as c} from '../core/content';
import {act,createGame} from '../core/engine';
import {repairHomeArrival,arriveHome,homeChance,homeOffer,evenings} from '../core/home';
test('evening arrival places Kaju at home with optional daily choices and remembered affection',()=>{
 let s=act(createGame(c,1),c,{type:'choose',index:0});
 s.seed=1;
 s=act(s,c,{type:'advance'});
 expect(s.location).toBe('home');expect(s.character).toBe('kaju');
 expect(s.dialogue.script!.some(l=>l.kind==='speech')).toBe(true);
 expect(s.dialogue.choices).toBeUndefined();
 const before=s.affection.kaju??0;
 s=act(s,c,{type:'home-evening'});
 expect(s.dialogue.choices!.length).toBeGreaterThanOrEqual(2);
 s=act(s,c,{type:'choose',index:0});
 expect(s.affection.kaju).toBeGreaterThan(before);
 expect(s.memories.kaju.facts.length).toBeGreaterThan(0);
 expect(()=>act(s,c,{type:'home-evening'})).toThrow();
 s=act(s,c,{type:'advance'});expect(s.phase).toBe(0);expect(s.character).not.toBe('kaju');
});
test('at least 25 distinct episodes with choices; weekday/weekend probability boundaries and no reload reroll',()=>{
 expect(evenings.length).toBeGreaterThanOrEqual(25);
 expect(new Set(evenings.map(e=>e.title)).size).toBe(evenings.length);
  for(const e of evenings){expect(e.choices.length).toBeGreaterThanOrEqual(2);expect(e.scene.length).toBeGreaterThan(50);}
 expect(homeChance('2026-07-13')).toBe(0.4);
 expect(homeChance('2026-07-18')).toBe(0.6);
 expect(homeChance('2026-07-19')).toBe(0.6);
 // Seed 600 draws approximately 0.468: fails weekday, succeeds weekend.
 for(const [date,expected] of [['2026-07-13',false],['2026-07-18',true]] as const){
  const s=createGame(c,600);s.date=date;s.phase=2;s.location='home';s.flags=[];
  arriveHome(s,c);expect(!!homeOffer(s)).toBe(expected);expect(s.character).toBe('kaju');
  const flags=JSON.stringify(s.flags),seed=s.seed;arriveHome(s,c);
  expect(JSON.stringify(s.flags)).toBe(flags);expect(s.seed).toBe(seed);
  if(!expected)expect(()=>act(s,c,{type:'home-evening'})).toThrow();
 }
});
test('legacy home screen upgrades once without overwriting a conversation or ending',()=>{
 const s=createGame(c);s.phase=2;s.location='home';s.character='';s.dialogue={speaker:'旁白',text:'回到家，手機螢幕亮了起來。睡前，要傳訊息給誰呢？'};
 expect(repairHomeArrival(s,c)).toBe(true);expect(repairHomeArrival(s,c)).toBe(false);
 s.character='';s.dialogue={speaker:'旁白',text:'我的自訂劇情'};
 expect(repairHomeArrival(s,c)).toBe(false);
});
