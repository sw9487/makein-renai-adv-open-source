import {parse} from 'yaml';

// Imported knowledge may be structured data. Render values as readable text,
// Formatting only: content relevance is decided by the model, not field names.
function structuredText(value:unknown,depth=0):string {
 if(depth>12||value===null||value===undefined)return '';
 if(typeof value==='string')return value;
 if(typeof value==='number'||typeof value==='boolean')return String(value);
 if(Array.isArray(value))return value.map(v=>structuredText(v,depth+1)).filter(Boolean).join('\n');
 if(typeof value!=='object')return '';
 const record=value as Record<string,unknown>;
 return Object.entries(record).map(([key,v])=>{
  const text=structuredText(v,depth+1);return text?`${key}：${text}`:'';
 }).filter(Boolean).join('\n');
}

export function knowledgeText(path:string,input:string):string {
 let text=input.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
 if(/\.(json|ya?ml)$/i.test(path)||/^[\[{]/.test(text)){
  try{text=structuredText(/\.ya?ml$/i.test(path)?parse(text,{maxAliasCount:10}):JSON.parse(text));}
  catch{if(/\.(json|ya?ml)$/i.test(path))return '';}
 }
 text=text.replace(/^---\n[\s\S]*?\n---(?:\n|$)/,'');
 return text.replace(/```(?:json|ya?ml)\s*\n([\s\S]*?)```/gi,(_block,body:string)=>{
  try{return structuredText(parse(body,{maxAliasCount:10}));}catch{return '';}
 }).replace(/^#{1,6}\s+/gm,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
  .replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\n{3,}/g,'\n\n').trim();
}
