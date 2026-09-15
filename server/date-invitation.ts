import type {Content,GameState} from '../core/types';
import {calendarPromptContext} from '../core/calendar';
import {compactMemory,emptyMemory,schoolTime,tick} from '../core/engine';
import {currentProfile} from '../core/timeline';
import {modelFetch} from './model-runtime';
import {configuredPrompt,prompt} from './prompt';
import {apiSettings,validateApiUrl} from './repository';
import {knowledgeContext} from './knowledge';
import {searchContext} from './web-search';

const invitationTool={type:'function',function:{name:'write_date_invitation',get description(){return prompt('date.tool.invitation');},strict:true,parameters:{type:'object',properties:{text:{type:'string',get description(){return prompt('date.tool.invitationText');}}},required:['text'],additionalProperties:false}}};
const responseTool={type:'function',function:{name:'answer_date_invitation',get description(){return prompt('date.tool.response');},strict:true,parameters:{type:'object',properties:{text:{type:'string',get description(){return prompt('date.tool.responseText');}},accepted:{type:'boolean',get description(){return prompt('date.tool.accepted');}}},required:['text','accepted'],additionalProperties:false}}};

function toolArguments(payload:any,name:string){
 const call=payload?.choices?.[0]?.message?.tool_calls?.find((item:any)=>item?.function?.name===name);
 if(!call)throw Error(prompt('date.error.tool'));
 try{return JSON.parse(call.function.arguments);}catch{throw Error(prompt('date.error.tool'));}
}

async function call(endpoint:string,settings:Awaited<ReturnType<typeof apiSettings>>,messages:{role:string;content:string}[],tool:any,name:string,signal?:AbortSignal){
 const response=await modelFetch(endpoint,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.key},body:JSON.stringify({model:settings.model,messages,max_tokens:700,temperature:.8,tools:[tool],tool_choice:{type:'function',function:{name}},parallel_tool_calls:false}),signal});
 if(!response.ok)throw Error(prompt('date.error.service',{status:response.status}));
 return toolArguments(await response.json(),name);
}

export async function createDateInvitation(state:GameState,content:Content,characterId:string,placeId:string,signal?:AbortSignal){
 const invited=await createDateInvitationMessage(state,content,characterId,placeId,signal);
 return answerDateInvitation(invited,content,signal);
}

function dateInvitationTarget(state:GameState,content:Content,characterId:string,placeId:string){
 const character=content.characters.find(item=>item.id===characterId),place=content.places.find(item=>item.id===placeId);
 if(!character||character.id==='kazuhiko'||!state.met.includes(character.id)||!state.contacts.includes(character.id))throw Error(prompt('date.error.contact'));
 if(!place||place.school)throw Error(prompt('date.error.place'));
 return {character,place};
}

function dateInvitationContext(state:GameState,content:Content,characterId:string,placeId:string){
 const {character,place}=dateInvitationTarget(state,content,characterId,placeId);
 return {character,place,context:JSON.stringify({date:state.date,phase:state.phase,calendar:calendarPromptContext(state.date),place:place.name,character:currentProfile(character,state,content),affection:state.affection[character.id]??0})};
}

export async function createDateInvitationMessage(state:GameState,content:Content,characterId:string,placeId:string,signal?:AbortSignal){
 if(state.ended||state.phase===2||schoolTime(state)||state.dialogue.choices?.length||state.pendingDate||state.pendingDateInvitation)throw Error(prompt('date.error.unavailable'));
 if(state.flags.includes(`visited:${state.date}:${state.phase}`))throw Error(prompt('date.error.used'));
 const {character,place,context}=dateInvitationContext(state,content,characterId,placeId);
 const settings=await apiSettings();if(!settings.key||!settings.url||!settings.model)throw Error(prompt('date.error.api'));
 const base=validateApiUrl(settings.url),endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
 const [knowledge,webKnowledge]=await Promise.all([knowledgeContext(endpoint,settings,context,signal),searchContext(context,signal)]);
 const invite=await call(endpoint,settings,[{role:'system',content:[configuredPrompt(content.settings.systemPrompt),knowledge,webKnowledge,prompt('date.invitationSystem'),prompt('date.context',{context})].join('\n\n')},{role:'user',content:prompt('date.invitationRequest',{name:character.name,place:place.name})}],invitationTool,'write_date_invitation',signal);
 if(typeof invite.text!=='string'||!invite.text.trim()||invite.text.length>500)throw Error(prompt('date.error.tool'));
 const text=invite.text.trim(),next=structuredClone(state),stamp={date:next.date,phase:next.phase,channel:'line' as const},memory=next.memories[character.id]??=emptyMemory(),now=Date.now();
 memory.recent.push({role:'user',content:text,...stamp});compactMemory(memory,content.settings.memoryChars,content.settings.recentTurns);
 next.messages[character.id]=[...(next.messages[character.id]??[]),{id:crypto.randomUUID(),phase:next.phase,from:'player',text,date:next.date,readByCharacterAt:now}].slice(-100);
 next.pendingDateInvitation={character:character.id,place:place.id,text};next.revision++;
 return next;
}

export async function answerDateInvitation(state:GameState,content:Content,signal?:AbortSignal){
 const pending=state.pendingDateInvitation;if(!pending||state.pendingDate)throw Error(prompt('date.error.unavailable'));
 const {character,place,context}=dateInvitationContext(state,content,pending.character,pending.place);
 const settings=await apiSettings();if(!settings.key||!settings.url||!settings.model)throw Error(prompt('date.error.api'));
 const base=validateApiUrl(settings.url),endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
 const [knowledge,webKnowledge]=await Promise.all([knowledgeContext(endpoint,settings,context,signal),searchContext(context,signal)]);
 const inviteText=pending.text.trim();
 const answer=await call(endpoint,settings,[{role:'system',content:[configuredPrompt(content.settings.systemPrompt),configuredPrompt(character.prompt,{name:character.name,bio:character.bio}),knowledge,webKnowledge,prompt('date.responseSystem'),prompt('date.context',{context})].join('\n\n')},{role:'user',content:inviteText}],responseTool,'answer_date_invitation',signal);
 if(typeof answer.text!=='string'||!answer.text.trim()||answer.text.length>1000||typeof answer.accepted!=='boolean')throw Error(prompt('date.error.tool'));
 const next=structuredClone(state),stamp={date:next.date,phase:next.phase,channel:'line' as const},memory=next.memories[character.id]??=emptyMemory();
 memory.recent.push({role:'assistant',content:answer.text.trim(),...stamp});memory.turns++;compactMemory(memory,content.settings.memoryChars,content.settings.recentTurns);
 next.messages[character.id]=[...(next.messages[character.id]??[]),{id:crypto.randomUUID(),phase:next.phase,from:character.id,text:answer.text.trim(),date:next.date,conversationClosed:true,expectsReply:false}].slice(-100);
 delete next.pendingDateInvitation;
 next.pendingDate={character:character.id,place:place.id,accepted:answer.accepted};next.revision++;
 return next;
}

export function confirmDateInvitation(state:GameState,content:Content){
 if(!state.pendingDate)throw Error(prompt('date.error.missing'));
 const pending=state.pendingDate,next=structuredClone(state);delete next.pendingDate;
 if(pending.accepted){
  const character=content.characters.find(item=>item.id===pending.character),place=content.places.find(item=>item.id===pending.place);if(!character||!place)throw Error(prompt('date.error.missing'));
  next.location=place.id;next.character=character.id;next.flags=next.flags.filter(flag=>!flag.startsWith('visited:')).concat(`visited:${next.date}:${next.phase}`);next.dialogue={speaker:'旁白',text:prompt('date.arrival',{name:character.name,place:place.name}),kind:'date'};
 }else tick(next,content);
 next.revision++;return next;
}
