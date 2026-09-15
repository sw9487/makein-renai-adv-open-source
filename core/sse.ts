export async function* readSSE(body:ReadableStream<Uint8Array>) {
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
  let match:RegExpExecArray|null;
  while((match=/\r?\n\r?\n/.exec(buffer))){const frame=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
   const lines=frame.split(/\r?\n/),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
   if(data)yield {event:lines.find(l=>l.startsWith('event:'))?.slice(6).trim()??'message',data};
  }
  if(done)break;
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
