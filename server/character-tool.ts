import {cleanToolText,hasToolFields} from '../core/tool-text';
import {prompt} from './prompt';
export const characterExpressions = ['normal','happy','angry','sad','surprised','shy','suspicious','crying','enduring','cold','awkward','flustered','flushed','smug','inviting','excited','disdainful','troubled','dazed','faint','breakdown'] as const;
export type CharacterExpression = typeof characterExpressions[number];
export const characterActionKinds=['twitter_follow','twitter_unfollow','twitter_post','line_message'] as const;
export type CharacterAction={kind:typeof characterActionKinds[number];target:string;text:string;image:boolean};
export type CharacterReply = {memoryFacts?:{kind:'promise'|'relationship'|'event'|'preference';text:string}[];speech:string;narration:string;thought:string|null;expression?:CharacterExpression;affectionDelta?:number;twitterPost?:string;actions?:CharacterAction[];respond?:boolean;conversationClosed?:boolean;choices?:{text:string;reply:string;delta:number}[]};
export const characterTool = {
  type:'function',
  function:{name:'present_character_reply',get description(){return prompt('tool.character.reply');},strict:true,
    parameters:{type:'object',properties:{
      memoryFacts:{type:'array',maxItems:2,get description(){return prompt('tool.character.memory');},items:{type:'object',properties:{kind:{type:'string',enum:['promise','relationship','event','preference']},text:{type:'string',maxLength:400}},required:['kind','text'],additionalProperties:false}},
      needs_narration:{type:'boolean',get description(){return prompt('tool.character.needsNarration');}},
      needs_thought:{type:'boolean',get description(){return prompt('tool.character.needsThought');}},
      affectionDelta:{type:'integer',minimum:-3,maximum:3,get description(){return prompt('tool.character.affection');}},
      twitterPost:{type:['string','null'],maxLength:280,get description(){return prompt('tool.character.twitterPost');}},
      respond:{type:'boolean',get description(){return prompt('tool.character.respond');}},
      conversationClosed:{type:'boolean',get description(){return prompt('tool.character.conversationClosed');}},
      speech:{type:'string',get description(){return prompt('tool.character.speech');}},
      narration:{type:['string'],get description(){return prompt('tool.character.narration');}},
      thought:{type:['string','null'],get description(){return prompt('tool.character.thought');}},
      expression:{type:'string',enum:characterExpressions,get description(){return prompt('tool.character.expression');}},
      actions:{type:'array',maxItems:3,get description(){return prompt('tool.character.actions');},items:{type:'object',properties:{kind:{type:'string',enum:characterActionKinds},target:{type:'string'},text:{type:'string'},image:{type:'boolean'}},required:['kind','target','text','image'],additionalProperties:false}},
    },required:['memoryFacts','needs_narration','needs_thought','speech','narration','thought','expression','affectionDelta','twitterPost','actions','respond','conversationClosed'],additionalProperties:false}},
};
export const choiceTool={type:'function',function:{name:'present_character_choices',get description(){return prompt('tool.character.choices');},strict:true,parameters:{...characterTool.function.parameters,properties:{...characterTool.function.parameters.properties,choices:{type:'array',minItems:2,maxItems:3,items:{type:'object',properties:{delta:{type:'integer',minimum:-3,maximum:3,get description(){return prompt('tool.choice.delta');}},text:{type:'string',get description(){return prompt('tool.choice.text');}},reply:{type:'string',get description(){return prompt('tool.choice.reply');}}},required:['text','reply','delta'],additionalProperties:false}}},required:['memoryFacts','needs_narration','needs_thought','speech','narration','thought','expression','affectionDelta','twitterPost','actions','respond','conversationClosed','choices']}}};
export function parseCharacterReply(data:unknown,line=false,allowChoices=false):CharacterReply {
  const d=data as {choices?:{message?:{tool_calls?:{type?:string;function?:{name?:string;arguments?:string}}[];content?:string}}[]};
  const calls=d?.choices?.[0]?.message?.tool_calls;
  const choiceCall=allowChoices&&!line&&calls?.[0]?.function?.name==='present_character_choices';
  if(!Array.isArray(calls)||calls.length!==1||(!choiceCall&&calls[0].function?.name!=='present_character_reply')){
    // Intermittent: some providers reply with plain content instead of a tool call even under a forced
    // tool_choice. Accept that text as the character's speech rather than blocking the player.
    const content=d?.choices?.[0]?.message?.content;
    if(typeof content==='string'&&content.trim())
      return parseCharacterReply({choices:[{message:{tool_calls:[{function:{name:'present_character_reply',arguments:JSON.stringify({needs_narration:false,needs_thought:false,speech:content,narration:'',thought:null})}}]}}]},line,allowChoices);
    throw Error('模型未呼叫角色回應工具，未儲存混合文字。請使用支援 tool calling 的模型。');
  }
  let r:CharacterReply&{needs_narration?:boolean;needs_thought?:boolean;twitterPost?:string|null};
  try {r=JSON.parse(calls[0].function?.arguments ?? '');}catch{throw Error('角色工具回傳無效 JSON，請重試。');}
  const expression=r?.expression;
  if(expression!==undefined&&!characterExpressions.includes(expression))throw Error(prompt('error.characterExpression'));
  if(r)delete r.expression;
  // Auto-infer decision fields from content when model didn't provide them (legacy/streaming fallback)
  let needs_narration: boolean;
  let needs_thought: boolean;
  if(r.needs_narration !== undefined) needs_narration = r.needs_narration === true;
  else needs_narration = (r.narration??'').trim().length > 0;
  if(r.needs_thought !== undefined) needs_thought = r.needs_thought === true;
  else needs_thought = r.thought !== null;
  // Preserve original affectionDelta only if the key actually exists in the response
  let affectionDelta: number | undefined = Object.prototype.hasOwnProperty.call(r, 'affectionDelta') ? r.affectionDelta : undefined;
  // Validate decision consistency
  if(needs_narration && !r.narration?.trim()) throw Error('宣告需要動作(narration)，但 narration 欄位留空。請填寫動作描寫或將 needs_narration 設為 false。');
  if(!needs_narration && r.narration?.trim()) throw Error('宣告不需要動作(needs_narration 為 false)，但 narration 欄位有內容。請刪除動作或將 needs_narration 設為 true。');
  if(needs_thought && r.thought === null) throw Error('宣告需要心聲(thought)，但 thought 欄位為 null。請填寫內心話或將 needs_thought 設為 false。');
  if(!needs_thought && r.thought !== null) throw Error('宣告不需要心聲(needs_thought 為 false)，但 thought 欄位有內容。請刪除心聲或將 needs_thought 設為 true。');
  if(affectionDelta!==undefined&&(!Number.isInteger(affectionDelta)||affectionDelta < -3||affectionDelta > 3))throw Error('聊天好感變化必須為 -3 至 3 的整數。');
  let choices:CharacterReply['choices'];
  if(choiceCall){
    const raw=r?.choices;
    if(!Array.isArray(raw)||raw.length<2||raw.length>3||raw.some(x=>!x||typeof x.text!=='string'||!x.text.trim()||x.text.length>80||typeof x.reply!=='string'||!x.reply.trim()||x.reply.length>400||Object.keys(x).some(k=>!['text','reply','delta'].includes(k)))||new Set(raw.map(x=>x.text.trim())).size!==raw.length)throw Error('選項工具欄位不正確。');
    if(raw.some(x=>!Number.isInteger(x.delta)||x.delta < -3||x.delta > 3)||new Set(raw.map(x=>x.delta)).size<2)throw Error('選項須包含不同的好感變化，範圍為 -3 至 3。');
    choices=raw.map(x=>({text:x.text.trim(),reply:x.reply.trim(),delta:x.delta}));
    delete r.choices;
  }
  const memoryFacts=Array.isArray(r?.memoryFacts)?r.memoryFacts.filter((f:any)=>f&&['promise','relationship','event','preference'].includes(f.kind)&&typeof f.text==='string'&&f.text.trim()&&f.text.length<=400).slice(0,2):[];
  if(r)delete r.memoryFacts;
  const twitterPost=typeof r?.twitterPost==='string'&&r.twitterPost.trim()?cleanToolText(r.twitterPost.trim()):undefined;
  if(twitterPost&&twitterPost.length>280)throw Error('角色主動推文字數不能超過 280 字。');
  if(r)delete r.twitterPost;
  const rawActions=r?.actions;
  if(rawActions!==undefined&&(!Array.isArray(rawActions)||rawActions.length>3))throw Error(prompt('error.characterActions'));
  const actions:CharacterAction[]=[];
  for(const raw of rawActions??[]){
    if(!raw||!characterActionKinds.includes(raw.kind)||typeof raw.target!=='string'||typeof raw.text!=='string'||raw.image!==undefined&&typeof raw.image!=='boolean'||Object.keys(raw).some(key=>!['kind','target','text','image'].includes(key)))throw Error(prompt('error.characterActions'));
    const target=raw.target.trim(),text=raw.text.trim();
    const image=raw.image===true;
    if(raw.kind==='twitter_post'?target||!text||text.length>280:raw.kind==='line_message'?target!=='kazuhiko'||!text||text.length>1500:!target||text||image)throw Error(prompt('error.characterActions'));
    if(actions.some(action=>action.kind===raw.kind&&action.target===target))throw Error(prompt('error.characterActions'));
    actions.push({kind:raw.kind,target,text,image});
  }
  if(r)delete r.actions;
  const hasRespond=!!r&&Object.prototype.hasOwnProperty.call(r,'respond');
  const hasConversationClosed=!!r&&Object.prototype.hasOwnProperty.call(r,'conversationClosed');
  const respond=r?.respond!==false,conversationClosed=r?.conversationClosed===true;
  if(r){delete r.respond;delete r.conversationClosed;}
  if(line&&!respond&&r.speech?.trim())throw Error('角色工具欄位不正確，未更新進度。');
  if(line&&!respond&&actions.some(action=>action.kind==='line_message'))throw Error(prompt('error.characterActions'));
  if(!r || typeof r.speech!=='string' || !(r.narration===''||typeof r.narration==='string') || !(r.thought===null||typeof r.thought==='string') || (!r.speech.trim()&&(!line||respond)) || r.speech.length>2400 || r.narration.length>2000 || (r.thought?.length??0)>1000 || Object.keys(r).some(k=>!['speech','narration','thought','needs_narration','needs_thought','affectionDelta'].includes(k)))
    throw Error('角色工具欄位不正確，未更新進度。');
  r.speech=cleanToolText(r.speech);
  if((respond&&!r.speech.trim())||[r.speech,r.narration,r.thought??'',...(choices??[]).flatMap(x=>[x.text,x.reply])].some(hasToolFields))throw Error('角色回覆混入工具格式，未儲存。請重試。');
  const narration=line?'':(needs_narration?r.narration.trim():'');
  if(narration && (/[我俺咱]|僕|私(?:は|が|の)|\b(?:I|my|we|our)\b/i.test(narration)||/^[「『"""]/.test(narration)))
    throw Error('旁白誤用了角色第一人稱或台詞引號，未儲存。請重試；旁白必須以角色姓名或她／他描述動作。');
  if(/[（(＊*][^）)＊*]*(?:拍|抱|摸|笑|看|走|點頭|点头|搖頭|摇头|伸手|抬頭|抬头)[^）)＊*]*[）)＊*]/.test(r.speech))
    throw Error('角色台詞混入動作描寫，未儲存。請重試；動作只能放在旁白欄位。');
  return {...(memoryFacts.length?{memoryFacts}:{}),speech:r.speech.trim(),narration,thought:line?null:(needs_thought&&r.thought!==null)?r.thought.trim():null,...(expression?{expression}:{}),...(affectionDelta!==undefined?{affectionDelta}:{}),...(twitterPost?{twitterPost}:{}),...(actions.length?{actions}:{}),...(line&&hasRespond?{respond}:{}),...(line&&hasConversationClosed?{conversationClosed}:{}),...(choices?{choices}:{})};
}
