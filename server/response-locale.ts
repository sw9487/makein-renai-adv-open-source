import {localizeServicePayload,translatedServiceText,type ServiceLanguage} from '../core/service-i18n';
import {requestLanguage} from './request-locale';

/** Applied after admission/replay caching, so durable results remain language neutral. */
export async function localizeResponse(response:Response,language:ServiceLanguage=requestLanguage()):Promise<Response>{
 const type=response.headers.get('content-type')??'';
 if(!response.body)return response;
 const headers=new Headers(response.headers);
 headers.set('Content-Language',language);
 headers.set('Vary',[headers.get('Vary'),'X-Makeine-Language','Accept-Language'].filter(Boolean).join(', '));
 headers.delete('Content-Length');
 if(type.includes('application/json'))return new Response(JSON.stringify(localizeServicePayload(await response.json(),language)),{status:response.status,statusText:response.statusText,headers});
 if(type.includes('text/event-stream')){
  const decoder=new TextDecoder(),encoder=new TextEncoder();let buffer='';
  const frame=(value:string)=>{
   const lines=value.split(/\r?\n/),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
   if(!data)return value;
   try{
    const parsed=JSON.parse(data),localized=localizeServicePayload(parsed,language);
    // Preserve event/id/retry/comment fields, including durable reconnect cursors.
    return [...lines.filter(l=>!l.startsWith('data:')),'data: '+JSON.stringify(localized)].join('\n');
   }catch{return value;}
  };
  const body=response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
   transform(chunk,controller){buffer+=decoder.decode(chunk,{stream:true});let match:RegExpExecArray|null;while((match=/\r?\n\r?\n/.exec(buffer))){controller.enqueue(encoder.encode(frame(buffer.slice(0,match.index))+'\n\n'));buffer=buffer.slice(match.index+match[0].length);}},
   flush(controller){buffer+=decoder.decode();if(buffer)controller.enqueue(encoder.encode(frame(buffer)));},
  }));
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
 }
 // Bun may defer the default text/plain header until the response is sent.
 if((!type||type.startsWith('text/plain'))&&response.status>=400){headers.set('Content-Type','text/plain; charset=utf-8');return new Response(translatedServiceText(await response.text(),language)??translatedServiceText('操作失敗。',language),{status:response.status,statusText:response.statusText,headers});}
 return response;
}
