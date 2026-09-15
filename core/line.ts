export function lineMessage(message:{from:string;text:string;date:string;image?:string;imageCaption?:string},id:string,name:string){
 const legacy=message.from===id&&message.text.replace(/&#x20;|&#32;/gi,' ').trim()==='加到了。以後也可以在這裡聯絡。';
 return message.from==='system'||legacy?{...message,from:'system',text:`您與 ${name} 成為了朋友`}:message;
}
