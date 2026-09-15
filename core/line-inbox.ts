import type {GameState} from './types';
type Message=GameState['messages'][string][number];
export function messageKey(message:Message,index:number){
  if(message.id)return message.id;
  // Compatibility for older saves; do not copy conversation text into browser storage.
  let hash=2166136261;
  for(const char of JSON.stringify(message))hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return `legacy-${index}-${hash>>>0}`;
}
export function inboxStatus(messages:Message[],character:string,lastRead?:string){
  const incoming=messages.map((m,i)=>({message:m,key:messageKey(m,i)})).filter(item=>item.message.from===character);
  const readIndex=incoming.findIndex(item=>item.key===lastRead);
  return {latest:incoming.at(-1)?.key??'',unread:incoming.filter((item,index)=>!item.message.readByPlayerAt&&index>readIndex).length};
}

/** Compact, neutral receipt state for the LLM. It must judge conversational meaning itself. */
export function lineReceiptContext(s:GameState,character:string){
  const messages=(s.messages[character]??[]).filter(message=>message.from!=='system').slice(-12);
  return messages.map(message=>({
    from:message.from==='player'?'player':'character',text:message.text,date:message.date,phase:message.phase,
    read:message.from==='player'?!!message.readByCharacterAt:!!message.readByPlayerAt,
    conversationClosed:message.conversationClosed,expectsReply:message.expectsReply,
  }));
}

export function lineReadBaseline(messages:GameState['messages']):Record<string,string>{
  return Object.fromEntries(Object.entries(messages).flatMap(([character,list])=>{
    const latest=inboxStatus(list,character).latest;
    return latest?[[character,latest]]:[];
  }));
}
