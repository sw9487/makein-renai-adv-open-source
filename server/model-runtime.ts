import {apiFetch,type ApiRequestInit} from './api-fetch';
import {read} from './repository';
import {timed} from './timings';
import {generationLanguageInstruction} from './request-locale';
export type ModelErrorKind='authentication'|'rate-limit'|'context-overflow'|'invalid-request'|'provider'|'transport'|'cancelled';
export class ModelError extends Error{constructor(public kind:ModelErrorKind,message:string,public status?:number){super(message);}}
export function estimateTokens(value:unknown){
  // Data URLs are billed by the provider as vision inputs, not as base64 text.
  // Replacing their payload here prevents the local text budget from rejecting
  // otherwise valid multimodal requests before they reach the model.
  const text=JSON.stringify(value,(key,current)=>key==='url'&&typeof current==='string'&&current.startsWith('data:image/')?`[vision image: ${current.length} encoded bytes]`:current);let count=0;
  for(const char of text)count+=char.charCodeAt(0)>127?1:0.34;
  return Math.ceil(count);
}
/** Work on a request view, preserving the durable source and complete tool exchanges. */
export function budgetRequest(body:any,limit:number){
  const result=structuredClone(body);
  if(!Array.isArray(result.messages))throw new ModelError('invalid-request','LLM messages 格式不正確。');
  const groups:any[][]=[];
  for(const message of result.messages){
    if(message.role==='tool'&&groups.length)groups.at(-1)!.push(message);
    else groups.push([message]);
  }
  const output=Number(result.max_tokens??1600);
  const cost=()=>estimateTokens({...result,messages:groups.flat()})+output;
  while(cost()>limit){
    const index=groups.findIndex((group,i)=>i>0&&i<groups.length-1&&group[0].role!=='system');
    if(index<0)throw new ModelError('context-overflow','角色設定與本次輸入超過上下文預算，請增加預算或縮短補充內容。');
    groups.splice(index,1);
  }
  result.messages=groups.flat();return result;
}
export async function modelFetch(endpoint:string,init:ApiRequestInit){
  const settings=await read<{contextTokens?:number}>('api-settings',{});
  const source=JSON.parse(String(init.body));
  const instruction=generationLanguageInstruction();
  if(Array.isArray(source.messages)){
    let found=false;
    source.messages=source.messages.map((message:any)=>{
      if(message?.role!=='system'||typeof message.content!=='string')return message;
      found=true;return {...message,content:message.content+'\n\n'+instruction};
    });
    if(!found)source.messages.unshift({role:'system',content:instruction});
  }
  const body=budgetRequest(source,settings.contextTokens??65536);
  return timed('llm.request',async()=>{
    let response:Response;
    try{response=await apiFetch(endpoint,{...init,body:JSON.stringify(body)});}
    catch{if(init.signal?.aborted)throw new ModelError('cancelled','LLM 請求已取消。');throw new ModelError('transport','LLM 連線中斷；沒有自動重送，請確認原工作結果。');}
    if(!response.ok){
      const detail=await response.clone().json().catch(()=>({}));
      const code=String(detail?.error?.code??'');
      const kind:ModelErrorKind=response.status===401||response.status===403?'authentication':response.status===429?'rate-limit':code==='context_length_exceeded'?'context-overflow':response.status>=500?'provider':'invalid-request';
      const labels={authentication:'請確認 API 金鑰與權限', 'rate-limit':'服務限流，請稍後重試','context-overflow':'模型上下文容量不足，請降低上下文預算',provider:'模型服務發生錯誤','invalid-request':'模型不接受此請求，請確認工具與模型設定',transport:'連線失敗',cancelled:'已取消'};
      throw new ModelError(kind,`LLM HTTP ${response.status}：${labels[kind]}。`,response.status);
    }
    return response;
  });
}
