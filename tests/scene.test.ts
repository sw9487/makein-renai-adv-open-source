import {test,expect} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeRuntime} from '../server/runtime';
import {createGame,act} from '../core/engine';
import {defaultContent as c} from '../core/content';
import {applyScene,enlivenScene,listeningChoice,sceneSource} from '../server/scene';
import {prompt} from '../server/prompt';
import {novelPages} from '../core/vn-pages';

test('scene speech keeps its selected sprite expression through novel pages',()=>{
 const content=structuredClone(c);
 const state=createGame(content);
 const character=content.characters.find(ch=>ch.id===state.character)!;
 character.sprites={normal:character.sprites.normal,happy:'/assets/authored/00000000-0000-4000-8000-000000000021.png'};
 const choices=state.dialogue.choices!.map((choice,index)=>({text:`Option ${index}`,delta:choice.delta}));
 applyScene(state,{lines:[{kind:'speech',speaker:character.name,text:'I am genuinely glad to see you.',expression:'happy'}],choices},content);
 expect(state.dialogue.script?.[0].expression).toBe('happy');
 expect(novelPages(state.dialogue,content.characters[0].name)[0].expression).toBe('happy');
 expect(()=>applyScene(state,{lines:[{kind:'speech',speaker:character.name,text:'No.',expression:'angry'}],choices},content)).toThrow();
});

test('scene expression belongs to the tool field, not speech or memory text',()=>{
 const content=structuredClone(c),state=createGame(content);
 const character=content.characters.find(ch=>ch.id===state.character)!;
 character.sprites={normal:character.sprites.normal,shy:'/assets/shy.png'};
 const choices=state.dialogue.choices!.map((choice,index)=>({text:`Option ${index}`,delta:choice.delta}));
 applyScene(state,{lines:[{kind:'speech',speaker:character.name,text:'「（表情：shy）我就知道了。」',expression:'shy'}],choices},content);
 expect(state.dialogue.script?.[0]).toEqual({kind:'speech',speaker:character.name,text:'我就知道了。',expression:'shy'});
 expect(state.log.at(-1)?.text).toBe('我就知道了。');
 expect(state.dialogue.text).not.toContain('表情');
});

test('resting until tomorrow retries malformed school encounter choices without partial updates',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'scene-retry-')),port:19516,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'mock'}});
 const original=globalThis.fetch;
 try{
  const old=act(createGame(c),c,{type:'choose',index:0});old.date='2026-09-06';old.phase=2;old.seed=0;
  const next=act(old,c,{type:'advance'});const snapshot=JSON.stringify(next);
  expect(next.dialogue.choices).toHaveLength(3);
  let calls=0;let alwaysInvalid=false;
  globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{
   calls++;expect(JSON.stringify(next)).toBe(snapshot);
   const body=JSON.parse(String(init?.body));const schema=body.tools[0].function.parameters.properties.choices;
   expect(schema.minItems).toBe(3);expect(schema.maxItems).toBe(3);
   if(calls===2)expect(body.messages[0].content).toContain(prompt('scene.correction',{error:'MARK',count:3}).split('MARK')[0]);
   const context=JSON.parse(body.messages.at(-1).content);expect(context.current.choices.every((ch:any)=>ch.text===undefined&&ch.reply===undefined)).toBe(true);
   const choices=alwaysInvalid||calls===1?[]:next.dialogue.choices!.map((ch,i)=>({text:['你剛剛是不是有話想說？','發生什麼事了？','等等下課再告訴我好嗎？'][i],reply:'對方回應了你剛剛的提問。',delta:i-1}));
   return Response.json({choices:[{message:{tool_calls:[{function:{name:'present_scene',arguments:JSON.stringify({lines:[{kind:'narration',text:'隔天課間休息，你們在走廊遇見。'}],choices})}}]}}]});
  },{preconnect:original.preconnect});
  await enlivenScene(next,c,old);expect(calls).toBe(2);expect(next.date).toBe('2026-09-07');expect(next.phase).toBe(0);
  expect(next.dialogue.choices!.map(ch=>ch.delta).sort()).toEqual([-1,0,1]);
  Object.assign(next,JSON.parse(snapshot));calls=0;alwaysInvalid=true;
  await expect(enlivenScene(next,c,old)).rejects.toThrow('需要3個選項');
  expect(calls).toBe(2);expect(JSON.stringify(next)).toBe(snapshot);
 }finally{globalThis.fetch=original;close();}
});

test('scene variations preserve choice consequences and listen intent',()=>{
 const s=createGame(c);const before=structuredClone(s);const source=sceneSource(s.dialogue);
 s.dialogue.choices![0].intent='listen';
 const choices=s.dialogue.choices!.map((x,i)=>({text:`新的情境回應 ${i}`,delta:i-1}));
 applyScene(s,{lines:[{kind:'speech',speaker:c.characters.find(ch=>ch.id===s.character)!.name,text:'午餐的事情，我還有一點在意。'}],choices},c);
 expect(s.dialogue.choices!.map(x=>x.text)).not.toEqual(choices.map(x=>x.text));
 for(const choice of s.dialogue.choices!){const index=Number(choice.text.split(' ').at(-1));expect(choice.delta).toBe(index-1);expect(choice.flag).toBe(before.dialogue.choices![index].flag);expect(choice.reply).toBe(before.dialogue.choices![index].reply);}
 expect(listeningChoice(s,s.dialogue.choices!.findIndex(x=>x.text.endsWith(' 0')))).toBe(true);expect(s.dialogue.aiSource).toBeDefined();
 expect(s.dialogue.aiSource).not.toBe(sceneSource(s.dialogue));expect(source).not.toBe(sceneSource(s.dialogue));
 const chosen=act(s,c,{type:'choose',index:0});expect(chosen.completed).toContain(before.dialogue.eventId!);
 expect(chosen.affection[s.character]).toBe(Math.max(0,Math.min(100,(s.affection[s.character]??0)+s.dialogue.choices![0].delta)));
});

test('contextual choices replace stale continuations and reject copied school templates',()=>{
 const s=createGame(c);s.affection.anna=10;s.dialogue={speaker:'八奈見杏菜',kind:'original',choiceMode:'contextual',text:'午餐想吃什麼？',choices:[{text:'聊聊今天的課程。',reply:'交換課程心得。',delta:2},{text:'問問對方最近過得如何。',reply:'聊近況。',delta:2},{text:'打聲招呼，先回教室。',reply:'道別。',delta:0}]};
 const lines=[{kind:'speech',speaker:'八奈見杏菜',text:'午餐想吃什麼？'}],before=JSON.stringify(s);
 expect(()=>applyScene(s,{lines,choices:s.dialogue.choices},c)).toThrow('不能沿用');expect(JSON.stringify(s)).toBe(before);
 applyScene(s,{lines,choices:[{text:'今天想吃鬆餅。',reply:'杏菜點了點頭，問你想要哪種口味。',delta:-2},{text:'妳有推薦的午餐嗎？',reply:'杏菜推薦了附近的餐廳。',delta:3},{text:'我現在還不餓，晚一點再吃。',reply:'杏菜答應晚些再討論午餐。',delta:0}]},c);
 const selected=act(s,c,{type:'choose',index:s.dialogue.choices!.findIndex(x=>x.text==='今天想吃鬆餅。')});expect(selected.dialogue.text).toContain('口味');expect(selected.dialogue.text).not.toContain('課程');expect(selected.affection.anna).toBe(8);
});
test('listening requires an actual character opening and swallows stray extra choices',()=>{
 const s=act(createGame(c),c,{type:'choose',index:0});const snapshot=JSON.stringify(s);
 // A narration opening (not the character speaking first) is still rejected.
 expect(()=>applyScene(s,{lines:[{kind:'narration',text:'你們聊了一會兒。'}],choices:[]},c,true)).toThrow();
 expect(JSON.stringify(s)).toBe(snapshot);
 const speaker=c.characters.find(ch=>ch.id===s.character)!.name;
 // The model emits extra choices in a listening scene: the speech plays, choices are dropped, no block.
 applyScene(s,{lines:[{kind:'speech',speaker,text:'今天的午餐，有件事想問你。'}],choices:[{text:'再選一次'}]},c,true);
 expect(s.dialogue.script![0].speaker).toBe(speaker);expect(s.dialogue.choices).toBeUndefined();
 applyScene(s,{lines:[{kind:'speech',speaker,text:'今天的午餐，有件事想問你。'}],choices:[]},c,true);
 expect(s.dialogue.script![0].speaker).toBe(speaker);expect(s.dialogue.choices).toBeUndefined();
});
test('a narration scene with no player choices swallows stray AI choices instead of blocking progress',()=>{
 const s=createGame(c);s.dialogue={speaker:'旁白',text:'你們交換了LINE。新的聊天室出現在手機裡。'};const snapshot=JSON.stringify(s);
 // Model wrongly emits a couple of choices although the scene has none.
 applyScene(s,{lines:[{kind:'narration',text:'你們交換了LINE。新的聊天室出現在手機裡。'}],choices:[{text:'繼續聊天'},{text:'先去別的地方'}],},c);
 expect(s.dialogue.choices).toBeUndefined();
 expect(s.dialogue.script!.map(l=>l.kind)).toEqual(['narration']);
 expect(s.dialogue.text).toBe('你們交換了LINE。新的聊天室出現在手機裡。');
});
test('LLM scene request uses current context and never runs on navigation',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'makein-scene-')),port:19489,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'mock'}});
 const original=globalThis.fetch;const requests:any[]=[];
 const s=act(createGame(c),c,{type:'choose',index:0});const speaker=c.characters.find(ch=>ch.id===s.character)!.name;
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{requests.push(JSON.parse(String(init?.body)));return Response.json({choices:[{message:{tool_calls:[{function:{name:'present_scene',arguments:JSON.stringify({lines:[{kind:'speech',speaker,text:'溫水同學，今天我想說的是午餐。'}],choices:[]})}}]}}]});}) as typeof fetch;
 try{
  await enlivenScene(s,c,undefined,true);
  expect(requests).toHaveLength(1);expect(requests[0].tool_choice.function.name).toBe('present_scene');
  expect(requests[0].messages[0].content).toContain(prompt('scene.listen'));
  expect(s.dialogue.script![0].speaker).toBe(speaker);
  s.dialogue.navigation='map';await enlivenScene(s,c);expect(requests).toHaveLength(1);
 }finally{globalThis.fetch=original;close();}
});
