import {importantMemoryView} from './memory-view';
import {ToolRegistry} from './tool-registry';
import {modelFetch,ModelError} from './model-runtime';
import type { Content, GameState } from '../core/types';
import { compactMemory, emptyMemory } from '../core/engine';
import { characterAvailable, currentProfile } from '../core/timeline';
import { apiSettings, validateApiUrl, read } from './repository';
import { apiFetch } from './api-fetch';
import { sceneTimePrompt } from './scene-context';
import { commitConcurrent } from './concurrent-state';
import { conversationMemoryMessages, reliableMemorySummary, socialMemoryContext } from './memory-context';
import {publishCharacterTwitterPost,startTwitterSlot} from './twitter';
import {configuredPrompt,prompt} from './prompt';
import {requestImage} from './stable-diffusion';
import {lineReceiptContext} from '../core/line-inbox';
import {socialAppEnabled} from '../core/social-apps';
import {knowledgeContext} from './knowledge';
import {searchContext} from './web-search';

function hasUnresolvedLine(s:GameState,id:string){
  const latest=(s.messages[id]??[]).filter(message=>message.from!=='system').at(-1);
  if(!latest||latest.conversationClosed)return false;
  if(latest.from===id)return !latest.readByPlayerAt||latest.expectsReply===true;
  return latest.from==='player'&&!!latest.readByCharacterAt;
}

export function selectLineSenders(s: GameState, c: Content, draw = Math.random) {
  const eligible = c.characters.filter(ch => ch.id !== 'kazuhiko' && s.met.includes(ch.id)
    && s.contacts.includes(ch.id) && characterAvailable(ch, s, c));
  // Independently sample contacts: any count, including nobody, is possible.
  return eligible.filter(character => draw() < (hasUnresolvedLine(s,character.id)?0.75:0.3));
}

const tool = { type: 'function', function: {
  name: 'send_proactive_line', get description(){return prompt('proactive.tool');},
  parameters: { type: 'object', properties: {
    send: { type: 'boolean' }, text: { type: 'string', get description(){return prompt('proactive.text');} }, image:{type:'boolean',get description(){return prompt('proactive.image');}},expectsReply:{type:'boolean',get description(){return prompt('proactive.expectsReply');}},twitterPost:{type:['string','null'],maxLength:280,get description(){return prompt('proactive.twitterPost');}},twitterImage:{type:'boolean'},
  }, required: ['send', 'text', 'image', 'expectsReply', 'twitterPost', 'twitterImage'], additionalProperties: false },
} };

export async function generateProactiveLine(s: GameState, c: Content, signal?: AbortSignal, deliver?: (message: {id:string;text:string;expectsReply:boolean;twitterPost?:string;twitterImage?:{url?:string;caption?:string};image?:string;imageCaption?:string}) => Promise<void>) {
  if (s.ended||!socialAppEnabled(s,'line')) return [];
  const selected = selectLineSenders(s, c);
  if (!selected.length) return [];
  const settings = await apiSettings();
  if (!settings.url || !settings.key || !settings.model) return [];
  const base = validateApiUrl(settings.url);
  const endpoint = base.endsWith('/chat/completions') ? base
    : base + (new URL(base).pathname === '/' ? '/v1' : '') + '/chat/completions';
  const results = await Promise.allSettled(selected.map(async character => {
    const memory = s.memories[character.id] ?? emptyMemory();
    const referenceQuery=JSON.stringify({channel:'line',mode:'proactive',character:{id:character.id,name:character.name,profile:currentProfile(character,s,c)},date:s.date,phase:s.phase,memory:{summary:memory.summary,facts:memory.facts,important:importantMemoryView(memory,character.name+' '+s.date)},recentMessages:(s.messages[character.id]??[]).slice(-8).map(message=>({from:message.from,text:message.text,date:message.date}))});
    const [knowledge,webKnowledge]=await Promise.all([knowledgeContext(endpoint,settings,referenceQuery,signal),searchContext(referenceQuery,signal)]);
    const registry=new ToolRegistry();
    const lineTool=socialAppEnabled(s,'twitter')?tool:{...tool,function:{...tool.function,parameters:{...tool.function.parameters,properties:Object.fromEntries(Object.entries(tool.function.parameters.properties).filter(([key])=>!['twitterPost','twitterImage'].includes(key))),required:tool.function.parameters.required.filter(key=>!['twitterPost','twitterImage'].includes(key))}}};
    registry.register({schema:lineTool,parse:raw=>{const value=JSON.parse(raw),twitterPost=socialAppEnabled(s,'twitter')&&typeof value.twitterPost==='string'&&value.twitterPost.trim()?value.twitterPost.trim():undefined;if(typeof value.send!=='boolean'||typeof value.text!=='string'||typeof value.image!=='boolean'||value.text.length>1500||(twitterPost?.length??0)>280||value.twitterImage!==undefined&&typeof value.twitterImage!=='boolean')throw Error('主動 LINE 工具參數無效。');return {...value,twitterPost,twitterImage:!!twitterPost&&value.twitterImage===true,expectsReply:value.expectsReply===true} as {send:boolean;text:string;image:boolean;expectsReply:boolean;twitterPost?:string;twitterImage:boolean};},execute:async value=>value.send&&value.text.trim()||value.twitterPost?{id:character.id,text:value.send?value.text.trim():'',image:value.send&&value.image,expectsReply:value.send&&value.expectsReply,twitterPost:value.twitterPost,twitterImage:value.twitterImage}:null,validateResult:value=>{if(value&&!value.text&&!value.twitterPost)throw Error('主動 LINE 工具結果無效。');}});
    const response = await modelFetch(endpoint, {
      method: 'POST', redirect: 'manual', signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.key },
      body: JSON.stringify({ model: settings.model, temperature: 0.8, max_tokens: 1200,
        tools: registry.schemas(), tool_choice: { type: 'function', function: { name: 'send_proactive_line' } },
        messages: [{ role: 'system', content: [configuredPrompt(c.settings.systemPrompt),configuredPrompt(character.prompt,{name:character.name,bio:character.bio}),knowledge,webKnowledge,
          sceneTimePrompt(s, c, s.character===character.id),
          prompt('proactive.system',{name:character.name}),
          prompt('proactive.context',{profile:JSON.stringify({...currentProfile(character,s,c),twitterAudience:socialAppEnabled(s,'twitter')?Object.entries(s.twitter?.accounts??{}).filter(([accountId])=>accountId!==character.id).map(([accountId,account])=>({id:accountId,handle:account.handle,following:!!s.twitter?.following[character.id]?.[accountId],followsActor:!!s.twitter?.following[accountId]?.[character.id],mutual:!!s.twitter?.following[character.id]?.[accountId]&&!!s.twitter?.following[accountId]?.[character.id],mentionable:!s.twitter?.blocks?.[character.id]?.[accountId]&&!s.twitter?.blocks?.[accountId]?.[character.id]})):[]}),affection:s.affection[character.id]??0,route:s.route===character.id}),
          prompt('proactive.memory',{memory:JSON.stringify({summary:reliableMemorySummary(memory),facts:memory.facts,important:importantMemoryView(memory,character.name+' '+s.date),socialRecent:socialMemoryContext(memory,s,character.id)})}),
          prompt('proactive.receipts',{receipts:JSON.stringify(lineReceiptContext(s,character.id))}),
        ].join('\n\n') },
        ...conversationMemoryMessages(memory,s,character.id),
        { role: 'user', content: prompt('proactive.slotDecision') }],
      }),
    });
    if (!response.ok) throw Error('Proactive LINE request failed');
    const data = await response.json() as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
    const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    const message=await registry.execute(call?.name??'',call?.arguments??'{}') as {id:string;text:string;image:boolean;expectsReply:boolean;twitterPost?:string;twitterImage?:boolean}|null;
    if(!message)return null;
    const generated=message.text&&message.image?await requestImage(s,c,'line',message.text,character.id,signal,undefined,{allowCharacterlessLine:true,proactiveLine:true}):{};
    const twitterImage=message.twitterPost&&message.twitterImage?await requestImage(s,c,'line',message.twitterPost,character.id,signal,undefined,{allowCharacterlessLine:true,proactiveLine:true}):undefined;
    const delivered={id:message.id,text:message.text,expectsReply:message.expectsReply,twitterPost:message.twitterPost,twitterImage,...(generated.url?{image:generated.url,imageCaption:generated.caption}:{})};
    await deliver?.(delivered);
    return delivered;
  }));
  return results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
}

async function generateContactGreeting(s:GameState,c:Content,id:string,signal?:AbortSignal){
 const character=c.characters.find(ch=>ch.id===id);if(!character||!s.contacts.includes(id)||s.ended)return;
 const settings=await apiSettings();if(!settings.url||!settings.key||!settings.model)return;
 const base=validateApiUrl(settings.url),endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
 const schema={type:'function',function:{name:'send_contact_greeting',description:prompt('proactive.contactTool'),parameters:{type:'object',properties:{text:{type:'string',description:prompt('proactive.text')},image:{type:'boolean',description:prompt('proactive.image')}},required:['text','image'],additionalProperties:false}}};
 const memory=s.memories[id]??emptyMemory();
 const referenceQuery=JSON.stringify({channel:'line',mode:'contact-greeting',character:{id:character.id,name:character.name,profile:currentProfile(character,s,c)},date:s.date,phase:s.phase,memory:{summary:memory.summary,facts:memory.facts}});
 const [knowledge,webKnowledge]=await Promise.all([knowledgeContext(endpoint,settings,referenceQuery,signal),searchContext(referenceQuery,signal)]);
 const response=await modelFetch(endpoint,{method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+settings.key},body:JSON.stringify({model:settings.model,max_tokens:700,temperature:.8,tools:[schema],tool_choice:{type:'function',function:{name:'send_contact_greeting'}},parallel_tool_calls:false,messages:[{role:'system',content:[configuredPrompt(c.settings.systemPrompt),configuredPrompt(character.prompt,{name:character.name,bio:character.bio}),knowledge,webKnowledge,sceneTimePrompt(s,c,s.character===id),prompt('proactive.contactSystem',{name:character.name})].join('\n\n')},{role:'user',content:JSON.stringify({date:s.date,phase:s.phase,profile:currentProfile(character,s,c),affection:s.affection[id]??0,memory:{summary:memory.summary,facts:memory.facts}})}]})});
 if(!response.ok)return;
 const call=(await response.json() as any).choices?.[0]?.message?.tool_calls?.[0];if(call?.function?.name!=='send_contact_greeting')return;
 const value=JSON.parse(call.function.arguments);if(typeof value.text!=='string'||!value.text.trim()||value.text.length>1500||value.image!==undefined&&typeof value.image!=='boolean')return;
 const text=value.text.trim(),image=value.image===true?await requestImage(s,c,'line',value.text.trim(),id,signal,undefined,{allowCharacterlessLine:true,proactiveLine:true}):{};
 return {text,image};
}

/** Generate the character's first personal LINE message without delaying contact exchange. */
export function startContactGreeting(owner:string,s:GameState,c:Content,id:string){
 const stamp=`line-contact-greeting:${id}`;if(s.ended||!socialAppEnabled(s,'line')||!s.contacts.includes(id)||s.flags.includes(stamp))return (_ok:boolean)=>{};
 s.flags.push(stamp);const batch=`line-batch:${crypto.randomUUID()}`;s.flags.push(batch);const snapshot=structuredClone(s);
 let release!:(ok:boolean)=>void;const committed=new Promise<boolean>(resolve=>{release=resolve;});
 void generateContactGreeting(snapshot,c,id).then(async greeting=>{
  if(!greeting||!await committed)return;
  const current=await read<GameState|null>('game:'+owner,null);if(!current||current.runId!==snapshot.runId||current.ended||!socialAppEnabled(current,'line')||!current.contacts.includes(id)||!current.flags.includes(batch))return;
  const {text,image}=greeting,next=structuredClone(current);next.messages[id]=[...(next.messages[id]??[]),{id:crypto.randomUUID(),phase:snapshot.phase,from:id,text,date:snapshot.date,...(image.url?{image:image.url,imageCaption:image.caption}:{})}].slice(-100);
  const memory=next.memories[id]??=emptyMemory();memory.recent.push({role:'assistant',content:text,date:snapshot.date,phase:snapshot.phase,channel:'line'});compactMemory(memory,c.settings.memoryChars,c.settings.recentTurns);
  await commitConcurrent(owner,next,current,true);
 }).catch(()=>{/* The welcome message is optional and must not block gameplay. */});
 return release;
}

/** Start generation immediately; publish each reply after the scene commits. */
export function startProactiveLine(owner: string, s: GameState, c: Content, old?: GameState) {
  const releaseTwitter=startTwitterSlot(owner,s,c,old);
  if(!socialAppEnabled(s,'line'))return releaseTwitter;
  const stamp = `proactive-line:${s.date}:${s.phase}`;
  if (s.ended || (old && old.date === s.date && old.phase === s.phase) || s.flags.includes(stamp)) return releaseTwitter;
  s.flags.push(stamp);
  const batch = `line-batch:${crypto.randomUUID()}`;
  s.flags.push(batch);
  const snapshot = structuredClone(s);
  let release!: (ok: boolean) => void;
  const committed = new Promise<boolean>(resolve => { release = resolve; });
  void generateProactiveLine(snapshot, c, undefined, async ({id, text, image, imageCaption,expectsReply,twitterPost,twitterImage}) => {
    if (!await committed) return;
    const current = await read<GameState | null>('game:' + owner, null);
    if (!current || !socialAppEnabled(current,'line') || !current.flags.includes(batch)||current.runId!==snapshot.runId || !current.contacts.includes(id)) return;
    const next = structuredClone(current);
    if(text){next.messages[id] = [...(next.messages[id] ?? []), { id:crypto.randomUUID(),phase:snapshot.phase,from: id, text, date: snapshot.date,expectsReply,...(image?{image,imageCaption}:{}) }].slice(-100);const memory = next.memories[id] ??= emptyMemory();memory.recent.push({ role: 'assistant', content: text, date: snapshot.date, phase: snapshot.phase, channel: 'line' });compactMemory(memory, c.settings.memoryChars, c.settings.recentTurns);}
    if(twitterPost&&socialAppEnabled(current,'twitter'))publishCharacterTwitterPost(next,c,id,twitterPost,twitterImage);
    await commitConcurrent(owner, next, current,true);
  }).catch(() => { /* Optional LINE failures do not block gameplay. */ });
  return (ok:boolean)=>{release(ok);releaseTwitter(ok);};
}
