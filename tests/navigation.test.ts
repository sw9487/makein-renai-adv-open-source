import {test,expect} from 'bun:test';
import {createGame,tick} from '../core/engine';
import {defaultContent} from '../core/content';
import {blocksDialoguePaging,freshRetryAction,shouldFadeBeforeAction,shouldOpenMap} from '../core/navigation';

test('destination prompts open the map on weekend mornings and all afternoons',()=>{
 for(const [date,phase] of [['2026-04-10',2],['2026-04-11',0],['2026-04-13',0]] as const){
  const s=createGame(defaultContent);s.date=date;s.phase=phase;tick(s,defaultContent);
  expect(shouldOpenMap(s)).toBe(true);
  tick(s,defaultContent);if(s.phase===2)expect(shouldOpenMap(s)).toBe(false);
 }
});
test('legacy destination prompts work without opening the map during character choices',()=>{
 const s=createGame(defaultContent);s.character='';s.dialogue={speaker:'旁白',text:'週末沒有課。今天想去哪裡？ &#x20;'};
 expect(shouldOpenMap(s)).toBe(true);
 s.dialogue.choices=[{text:'留下',delta:0,reply:'好'}];expect(shouldOpenMap(s)).toBe(false);
 s.dialogue={speaker:'八奈見杏菜',text:'今天想去哪裡？'};expect(shouldOpenMap(s)).toBe(false);
});

test('manual CG generation keeps existing dialogue readable while other requests block it',()=>{
 expect(blocksDialoguePaging(true,true,false)).toBe(false);
 expect(blocksDialoguePaging(true,false,false)).toBe(true);
 expect(blocksDialoguePaging(true,true,true)).toBe(true);
});

test('new stories and every destination selection start fading before their API response',()=>{
 expect(shouldFadeBeforeAction({type:'new'},'home')).toBe(true);
 expect(shouldFadeBeforeAction({type:'load'},'home')).toBe(false);
 expect(shouldFadeBeforeAction({type:'visit',place:'home'},'home')).toBe(true);
 expect(shouldFadeBeforeAction({type:'visit',place:'station'},'home')).toBe(true);
});

test('manual retries discard the failed request identity and preserve the intended action',()=>{
 expect(freshRetryAction({type:'chat',channel:'line',character:'kaju',text:'再試一次',requestId:'failed-request',runId:'run'})).toEqual({type:'chat',channel:'line',character:'kaju',text:'再試一次',runId:'run'});
});
