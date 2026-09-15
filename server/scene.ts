import {importantMemoryView} from './memory-view';
import {sharedPrevious} from './character-context';
import {compactMemory} from '../core/engine';
import {shuffleChoices} from '../core/choices';
import {modelFetch,ModelError} from './model-runtime';
import {timed} from './timings';
import {apiFetch} from './api-fetch';
import type {Content,GameState,Dialogue,StoryLine} from '../core/types';
import {apiSettings,validateApiUrl} from './repository';
import {currentProfile} from '../core/timeline';
import {knowledgeContext} from './knowledge';
import {searchContext} from './web-search';
import {sceneContext,sceneTimePrompt} from './scene-context';
import {conversationMemoryMessages,reliableMemorySummary,socialMemoryContext} from './memory-context';
import {configuredPrompt,prompt} from './prompt';
import {characterExpressions} from './character-tool';
import {cleanToolText} from '../core/tool-text';

export const sceneSource=(d:Pick<Dialogue,'text'|'script'|'choices'|'cg'>)=>JSON.stringify([d.text,d.script,d.choices,d.cg]);
export function listeningChoice(s:GameState,index:number){
 const choice=s.dialogue.choices?.[index];
 return !!choice && (choice.intent==='listen'||/留下.*聽|先聽|聽對方|問她想說什麼/.test(choice.text));
}
export function applyScene(s:GameState,raw:unknown,c:Content,listen=false){
 const r=raw as {lines:StoryLine[];choices?:{text:string;reply?:string;delta:number}[]};
 const valid=(x:unknown,max:number)=>typeof x==='string'&&!!x.trim()&&x.length<=max;
 const expected=s.dialogue.choices?.length??0;
 // A scene with no player choices (e.g. a narration-only transition like a LINE exchange) must stay
 // choice-free; in listening continuations too a stray `choices` array is normalised away, for ordinary
 // narration-only transitions a stray choice array is normalised out instead of blocking progress.
 if(!r||!Array.isArray(r.lines)||r.lines.length<1||r.lines.length>12)throw Error('AI 場景需要1至12段 lines，進度未更新。');
 if(expected>0&&(!Array.isArray(r.choices)||r.choices.length!==expected))throw Error(`AI 場景需要${expected}個選項，進度未更新。`);
 const choices=expected>0?(Array.isArray(r.choices)?r.choices:[]):[];
 const names=new Set(c.characters.filter(ch=>s.met.includes(ch.id)||ch.id==='kazuhiko').map(ch=>ch.name));
 const character=c.characters.find(ch=>ch.id===s.character);
 const availableExpressions=characterExpressions.filter(key=>!!character?.sprites[key]);
 const lines=r.lines.map(l=>{
  if(!l||!['speech','narration'].includes(l.kind)||!valid(l.text,1200)||(l.kind==='speech'&&(!names.has(l.speaker??'')||l.speaker===c.characters.find(ch=>ch.id==='kazuhiko')?.name)))throw Error('AI 場景台詞格式不正確，進度未更新。');
  if(l.expression!==undefined&&!availableExpressions.includes(l.expression as typeof availableExpressions[number]))throw Error(prompt('error.characterExpression'));
  const text=l.kind==='speech'?cleanToolText(l.text.trim()).trim():l.text.trim();
  if(!text)throw Error('AI 場景台詞格式不正確，進度未更新。');
  return {kind:l.kind,text,...(l.kind==='speech'?{speaker:l.speaker}:{}),...(l.kind==='speech'&&l.speaker===character?.name?{expression:l.expression??'normal'}:{})} as StoryLine;
 });
 if(listen&&(lines[0].kind!=='speech'||lines[0].speaker!==character?.name))throw Error('AI 未讓對方先開口，請重試。');
 if(choices.some(x=>!x||!valid(x.text,250))||new Set(choices.map(x=>x.text.trim())).size!==choices.length)throw Error('AI 選項格式不正確，進度未更新。');
 if(choices.some(x=>!Number.isInteger(x.delta)||x.delta< -3||x.delta>3))throw Error('AI 選項必須包含 -3 至 3 的整數好感變化。');
 if(s.dialogue.choiceMode==='contextual'&&choices.some((x,i)=>!valid(x.reply,1200)||x.text.trim()===s.dialogue.choices?.[i].text.trim()))throw Error('AI 必須依本次台詞重寫選項及對應回應，不能沿用預設選項。');
 const source=sceneSource(s.dialogue);
 s.dialogue={...s.dialogue,script:lines,text:lines.map(l=>l.kind==='speech'?`${l.speaker}：「${l.text}」`:l.text).join('\n\n'),aiSource:source,
  ...(s.dialogue.choices?{choices:shuffleChoices(s.dialogue.choices.map((choice,i)=>({...choice,text:choices[i].text.trim(),delta:choices[i].delta,...(s.dialogue.choiceMode==='contextual'?{reply:choices[i].reply!.trim()}:{}),...(choice.intent||/留下.*聽|先聽|聽對方/.test(choice.text)?{intent:choice.intent??'listen' as const}:{})})))}:{})};
 // Replace the engine's provisional presentation in history with the actual scene.
 s.log.pop();
 for(const line of lines)s.log.push({date:s.date,speaker:line.speaker??'旁白',text:line.text});
 s.log=s.log.slice(-180);
 if(character){
  const memory=s.memories[character.id];
  if(memory){memory.recent.push({role:'assistant',date:s.date,phase:s.phase,channel:'scene',content:lines.map(l=>l.kind==='speech'?`${l.speaker}：「${l.text}」`:l.text).join('\n\n')});compactMemory(memory,c.settings.memoryChars,c.settings.recentTurns*2);}
 }
}

export async function enlivenScene(s:GameState,c:Content,previous?:GameState,listen=false,signal?:AbortSignal){
 if(s.ended||s.dialogue.navigation||!s.character||s.dialogue.kind==='chat')return;
 const settings=await apiSettings();
 if(!settings.key||!settings.url||!settings.model)return;
 const base=validateApiUrl(settings.url);
 const endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
 const ch=c.characters.find(ch=>ch.id===s.character)!;
 const availableExpressions=characterExpressions.filter(key=>!!ch.sprites[key]);
 const [knowledge,webKnowledge]=await Promise.all([timed('scene.knowledge',()=>knowledgeContext(endpoint,settings,JSON.stringify({character:ch.name,...sceneContext(s,c),scene:s.dialogue.text.slice(0,1200)}),signal)),timed('scene.search',()=>searchContext(s.dialogue.text.slice(0,1200),signal))]);
 const choiceCount=s.dialogue.choices?.length??0;
 const contextual=s.dialogue.choiceMode==='contextual';
 const current={...s.dialogue,choices:s.dialogue.choices?.map(({delta,...choice},index)=>contextual?{index,intent:index===2?'politely_decline_or_defer':index===1?'ask_about_the_current_topic':'answer_the_latest_question'}:{...choice,index})};
 const memory=s.memories[ch.id];
 const sceneMemory=memory?{summary:reliableMemorySummary(memory),facts:memory.facts,important:importantMemoryView(memory,s.dialogue.text),conversationRecent:conversationMemoryMessages(memory,s,ch.id),socialRecent:socialMemoryContext(memory,s,ch.id)}:undefined;
 const tool={type:'function',function:{name:'present_scene',description:prompt('scene.tool'),parameters:{type:'object',properties:{
  lines:{type:'array',minItems:1,maxItems:12,items:{type:'object',properties:{kind:{type:'string',enum:['speech','narration']},speaker:{type:'string'},text:{type:'string'},expression:{type:'string',enum:availableExpressions,description:prompt('scene.expression.field')}},required:['kind','speaker','text'],additionalProperties:false}},
  choices:{type:'array',minItems:choiceCount,maxItems:choiceCount,items:{type:'object',properties:{text:{type:'string',minLength:1,maxLength:250},delta:{type:'integer',minimum:-3,maximum:3},...(contextual?{reply:{type:'string',minLength:1,maxLength:1200}}:{})},required:contextual?['text','reply','delta']:['text','delta'],additionalProperties:false}},
 },required:['lines','choices'],additionalProperties:false}}};
 let correction='';
 for(let attempt=0;attempt<2;attempt++){
 const response=await modelFetch(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.key},signal:signal,body:JSON.stringify({model:settings.model,temperature:0.95,max_tokens:2400,tools:[tool],tool_choice:{type:'function',function:{name:'present_scene'}},parallel_tool_calls:false,messages:[
  {role:'system',content:[configuredPrompt(c.settings.systemPrompt),knowledge,webKnowledge,
   prompt('scene.writer'),prompt('scene.adult'),prompt('scene.choices'),prompt('scene.expression',{available:availableExpressions.join(', ')}),contextual?prompt('scene.contextualChoices'):'',prompt(listen?'scene.listen':'scene.continue'),
   configuredPrompt(ch.prompt,{name:ch.name,bio:ch.bio}),JSON.stringify(currentProfile(ch,s,c)),sceneTimePrompt(s,c),
   correction,
  ].join('\n')},
  {role:'user',content:JSON.stringify({...sceneContext(s,c),affection:s.affection[ch.id],character:ch.name,memory:sceneMemory,previous:sharedPrevious(previous,c,ch.id),current})},
 ]})});
 if(!response.ok)throw Error(`AI 場景生成失敗（${response.status}），進度未更新，請重試。`);
 if(signal?.aborted)throw Error('場景生成已取消，進度未更新。');
 try{
 const data=await response.json();const calls=data.choices?.[0]?.message?.tool_calls;
 if(data.choices?.[0]?.finish_reason==='length')throw Error('AI 場景輸出被截斷，請縮短台詞與旁白。');
 if(calls?.length!==1||calls[0].function?.name!=='present_scene')throw Error('AI 未回傳場景工具，進度未更新。');
 applyScene(s,JSON.parse(calls[0].function.arguments),c,listen);
 return;
 }catch(error){
  if(signal?.aborted)throw Error('場景生成已取消，進度未更新。');
  if(attempt===1)throw error;
  correction=prompt('scene.correction',{error:error instanceof SyntaxError?prompt('scene.error.json'):error instanceof Error?error.message:prompt('scene.error.format'),count:choiceCount});
 }
 }
}
