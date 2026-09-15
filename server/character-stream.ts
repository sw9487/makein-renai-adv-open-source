import {readSSE} from '../core/sse';
import {parseCharacterReply,type CharacterReply} from './character-tool';
import {cleanToolText} from '../core/tool-text';
/** Only decode string values of the three tool fields; never expose raw JSON. */
export function partialReply(raw:string,line=false):CharacterReply {
 const result:CharacterReply={speech:'',narration:'',thought:null};
 for(const key of ['speech','narration','thought'] as const){
  if(line&&key!=='speech')continue;
  const match=new RegExp('"'+key+'"\\s*:\\s*"').exec(raw);if(!match)continue;
  let encoded='';
  for(let i=match.index+match[0].length;i<raw.length;i++){
   const ch=raw[i];if(ch==='"')break;
   if(ch==='\\'){const next=raw[i+1];if(!next)break;const length=next==='u'?6:2;if(i+length>raw.length)break;encoded+=raw.slice(i,i+length);i+=length-1;}else encoded+=ch;
  }
  try{result[key]=JSON.parse('"'+encoded+'"');}catch{}
 }
 result.speech=cleanToolText(result.speech);
 // Withhold a potential embedded envelope while its keys are still arriving.
 const boundary=result.speech.search(/"\s*,\s*"/);
 if(boundary>=0)result.speech=result.speech.slice(0,boundary);
 return result;
}
export async function streamCharacter(response:Response,line:boolean,onPartial:(reply:CharacterReply)=>void,allowChoices=false){
 if(!response.body)throw Error('AI 串流沒有內容。');
 let name='',args='',content='',finished=false;
 for await(const frame of readSSE(response.body)){
  if(frame.data==='[DONE]'){finished=true;break;}
  const chunk=JSON.parse(frame.data);if(chunk.error)throw Error('AI 串流回傳錯誤。');
  const choice=chunk.choices?.[0];
  for(const call of choice?.delta?.tool_calls??[]){if(call.index!==0)throw Error('角色串流回傳多個工具。');name+=call.function?.name??'';args+=call.function?.arguments??'';}
  if(choice?.delta?.content)content+=choice.delta.content;
  if(args.length>24000)throw Error('角色串流過長。');
  // A LINE tool call may decide respond=false after streaming speech. Do not show a
  // provisional message that will disappear when the final decision is parsed.
  if(!line&&(name==='present_character_reply'||(allowChoices&&name==='present_character_choices')))onPartial(partialReply(args,line));
  if(choice?.finish_reason==='tool_calls'||choice?.finish_reason==='stop')finished=true;
  if(choice?.finish_reason==='length')throw Error('角色回覆被截斷，請重試。');
 }
 if(!finished)throw Error('AI 串流中斷，未儲存這次回覆。');
 // Intermittent: some providers stream plain content instead of a tool call even under a forced
 // tool_choice. Accept that text as the character's speech rather than blocking the player.
 if(name===''&&content.trim()){name='present_character_reply';args=JSON.stringify({needs_narration:false,needs_thought:false,speech:content,narration:'',thought:null});}
 if(name==='')throw Error('模型未呼叫角色回應工具，未儲存混合文字。請使用支援 tool calling 的模型。');
 return parseCharacterReply({choices:[{message:{tool_calls:[{function:{name,arguments:args}}]}}]},line,allowChoices);
}
