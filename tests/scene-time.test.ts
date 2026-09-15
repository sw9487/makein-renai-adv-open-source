import {test,expect} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeRuntime} from '../server/runtime';
import {createGame,act} from '../core/engine';
import {defaultContent as c} from '../core/content';
import {evenings,arriveHome} from '../core/home';
import {enlivenScene} from '../server/scene';
import {converse} from '../server/chat';
import {sceneContext,sceneTimePrompt} from '../server/scene-context';
import {novelPages} from '../core/vn-pages';
import {prompt} from '../server/prompt';

test('evening tea scene, choice continuation, talk and LINE receive explicit current time',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'scene-time-')),port:19515,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const original=globalThis.fetch;const requests:any[]=[];
 try{
  const previous=act(createGame(c),c,{type:'choose',index:0});
  previous.date='2026-07-14';previous.phase=0;
  const s=structuredClone(previous);s.phase=2;s.location='home';
  const index=evenings.findIndex(e=>e.title==='新茶包的試喝會');expect(index).toBeGreaterThanOrEqual(0);
  s.flags.push(`home-rolled:${s.date}`,`home-offer:${s.date}:${index}`);
  arriveHome(s,c,true);
  const speaker=c.characters.find(ch=>ch.id==='kaju')!.name;
  globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{
   const body=JSON.parse(String(init?.body));requests.push(body);
   const name=body.tools[0].function.name;
   const input=name==='present_scene'?JSON.parse(body.messages[1].content):null;
   const value=input?{lines:[{kind:'speech',speaker,text:'今晚試的茶，這杯比較順口。'}],choices:(input.current.choices??[]).map((choice:any)=>({text:choice.text,delta:1}))}:{speech:'今晚可以慢慢喝。',narration:'',thought:null};
   return Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:JSON.stringify(value)}}]}}]});
  },{preconnect:original.preconnect});
  await enlivenScene(s,c,previous);
  const sceneInput=JSON.parse(requests[0].messages[1].content);
  expect(sceneInput.timeOfDay).toBe('夜晚');expect(sceneInput.calendar.schoolOpen).toBe(true);expect(sceneInput.previous).toBeUndefined();
  const chosen=act(s,c,{type:'choose',index:0});await enlivenScene(chosen,c,s);
  await converse(chosen,c,'kaju','這杯比較好喝。','talk');
  await converse(chosen,c,'kaju','晚安。','line');
  expect(requests).toHaveLength(4);
  for(const request of requests){
    expect(request.messages[0].content).toContain(sceneTimePrompt(chosen,c));
  }
  expect(chosen.phase).toBe(2);expect(chosen.date).toBe(s.date);
  const actionOnly=await converse(chosen,c,'kaju','   ','talk','把茶杯推到佳樹面前。');
  expect(requests.at(-1).messages.at(-1).content).toBe(prompt('chat.playerAction',{action:'把茶杯推到佳樹面前。'}));
  expect(actionOnly.mode).toBe('ai');expect(actionOnly.reply).toBe('今晚可以慢慢喝。');
  expect(actionOnly.state.dialogue.script).toContainEqual({kind:'narration',text:'把茶杯推到佳樹面前。'});
  expect(actionOnly.state.dialogue.script!.some(line=>line.kind==='speech'&&!line.text.trim())).toBe(false);
  expect(actionOnly.state.log.some(line=>!line.text.trim())).toBe(false);
  expect(novelPages(actionOnly.state.dialogue,'溫水和彥').map(line=>line.text)).toEqual(['今晚可以慢慢喝。']);
  const secondAction=await converse(actionOnly.state,c,'kaju','','talk','拿起自己的茶杯。');
  expect(novelPages(secondAction.state.dialogue,'溫水和彥').map(line=>line.text)).toEqual(['今晚可以慢慢喝。']);
 }finally{globalThis.fetch=original;close();}
});

test('time labels follow weekday and weekend game phases',()=>{
 const s=createGame(c);
 for(const [date,labels] of [['2026-07-14',['白天','放學後','夜晚']],['2026-07-18',['上午','午後','夜晚']]] as const){
  for(let phase=0;phase<3;phase++)expect(sceneContext({...s,date,phase},c).timeOfDay).toBe(labels[phase]);
 }
});
