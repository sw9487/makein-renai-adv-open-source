import {apiFetch} from './api-fetch';
import {apiSettings,validateApiUrl,type ApiSettings} from './repository';

export type AiStatus={status:'ready'|'missing'|'unavailable';message:string};

export function modelsEndpoint(value:string){
 const base=validateApiUrl(value);
 if(base.endsWith('/models'))return base;
 if(base.endsWith('/chat/completions'))return base.slice(0,-'/chat/completions'.length)+'/models';
 return base+(new URL(base).pathname==='/'?'/v1':'')+'/models';
}

function modelIds(data:any):string[]{
 return (Array.isArray(data?.data)?data.data:data?.models??[])
  .map((model:any)=>typeof model==='string'?model:String(model?.id??model?.name??''))
  .filter(Boolean);
}

export async function checkConfiguredModel(settings:ApiSettings):Promise<AiStatus>{
 if(!settings.url.trim()||!settings.key.trim()||!settings.model.trim())return {status:'missing',message:'LLM API 尚未設定完成。遊戲需要 AI 才能生成劇情、選項、對話、LINE 與 Twitter 內容。請前往 Editor 設定 API 網址、Key 與模型。'};
 try{
  const response=await apiFetch(modelsEndpoint(settings.url),{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+settings.key,Accept:'application/json'}});
  if(!response.ok)return {status:'unavailable',message:`LLM 模型清單檢查收到 HTTP ${response.status}。請確認 API URL、Key 與服務狀態。`};
  const ids=modelIds(await response.json());
  if(!ids.includes(settings.model))return {status:'unavailable',message:`模型清單中找不到目前設定的模型「${settings.model}」。請在 Editor 重新選擇模型。`};
  return {status:'ready',message:''};
 }catch{return {status:'unavailable',message:'無法取得 LLM 模型清單。請確認 API URL、Key、網路與服務狀態。'};}
}

export function createAiStatusCheck(){
 return async():Promise<AiStatus>=>checkConfiguredModel(await apiSettings());
}
