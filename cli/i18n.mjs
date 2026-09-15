import {readFileSync,existsSync} from 'node:fs';
const files={'zh-Hant':'zh-TW',en:'en',ja:'ja'};
const catalogs=new Map();
function readCatalog(language){
 const source=new URL('../web/locales/'+files[language]+'.json',import.meta.url);
 const path=existsSync(source)?source:new URL('../dist/locales/'+files[language]+'.json',import.meta.url);
 return JSON.parse(readFileSync(path,'utf8')).cli;
}
function catalogFor(language){
 if(catalogs.has(language))return catalogs.get(language);
 const catalog=readCatalog(language),sources=readCatalog('zh-Hant');
 const entries=Object.entries(catalog).map(([id,text])=>{const source=sources[id];return {text,pattern:new RegExp('^'+source.split(/\{\d+\}/).map(escape).join('(.+?)')+'$'),slots:[...source.matchAll(/\{(\d+)\}/g)].map(m=>m[1])};});
 catalogs.set(language,entries);return entries;
}
export function cliLanguage(env=process.env){
 const value=env.MAKEIN_LANGUAGE||env.LC_ALL||env.LC_MESSAGES||env.LANG||Intl.DateTimeFormat().resolvedOptions().locale;
 const normalized=value.toLowerCase().replaceAll('_','-');
 return /^(zh-hant|zh-tw|zh-hk|zh-mo)/.test(normalized)?'zh-Hant':/^en/.test(normalized)?'en':'ja';
}
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function cliText(text,language=cliLanguage()){
 return text.split('\n').map(line=>{
  const value=line.trim();
  for(const {text,pattern,slots} of catalogFor(language)){const match=pattern.exec(value);if(!match)continue;const params={};slots.forEach((slot,i)=>{params[slot]=match[i+1];});return line.replace(value,text.replace(/\{(\d+)\}/g,(_,id)=>params[id]??''));}
  return line;
 }).join('\n');
}
