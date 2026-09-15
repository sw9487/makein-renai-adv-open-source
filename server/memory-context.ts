import type {GameState,Memory,MemoryEntry,SocialMemoryEvent} from '../core/types';
import {dayPhaseNames,memoryText} from '../core/engine';
import {prompt} from './prompt';

export function datedMemory(message:Memory['recent'][number],s:GameState,id:string){
 let {date,phase,channel}=message;
 if(!date){
  const matches=(s.messages[id]??[]).filter(m=>m.from===(message.role==='user'?'player':id)&&m.text===message.content);
  const dates=new Set(matches.map(m=>m.date));
  if(dates.size===1){date=matches[0].date;channel='line';}
 }
 const age=date?Math.round((Date.parse(s.date+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000):undefined;
 const time=date&&phase!==undefined?dayPhaseNames(date)[phase]:undefined;
 return prompt('memory.entry',{date:date??prompt('memory.unknownDate'),time:time?' '+time:'',channel:channel??prompt('memory.unknownChannel'),age:age!==undefined?prompt('memory.age',{days:age}):'',content:memoryText(message.content)});
}

function legacySocialEvent(message:MemoryEntry,id:string):SocialMemoryEvent{
 const own=message.role==='assistant';
 return {platform:'twitter',owner:id,ownerName:id,actorId:own?id:'legacy-unknown-account',actorName:own?id:prompt('memory.unknownActor'),eventType:'post'};
}

export function socialMemoryContext(memory:Memory,s:GameState,id:string){
 return memory.recent.filter(message=>message.channel==='twitter').map(message=>({
  date:message.date,phase:message.phase,content:memoryText(message.content),
  ...(message.social??legacySocialEvent(message,id)),
 }));
}

export function conversationMemoryMessages(memory:Memory,s:GameState,id:string){
 return memory.recent.filter(message=>message.channel!=='twitter').map(message=>({role:message.role,content:datedMemory(message,s,id)}));
}

/** Old Twitter summary lines discarded their speaker. Omitting them is safer than asking the model to guess. */
export function reliableMemorySummary(memory:Memory){
 return memory.summary.split('\n').filter(line=>!/(?:\stwitter\]|\[twitter\])Twitter(?::|（舊記憶)/i.test(line)).join('\n').trim();
}
