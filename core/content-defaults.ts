import type {Content} from './types';
import {defaultContent} from './content';
import authoredContent from '../content/game.json';
import ja from '../web/locales/ja.json';
import zhTw from '../web/locales/zh-TW.json';
import en from '../web/locales/en.json';

export type ContentDefaultLanguage='ja'|'zh-Hant'|'en';
export type ContentDefaultSection='places'|'events'|'assets';
const catalogs:Record<ContentDefaultLanguage,Record<string,string>>={
 ja:ja.contentDefaults,'zh-Hant':zhTw.contentDefaults,en:en.contentDefaults,
};
type DefaultEntry={source:string;variants:Set<string>};
const defaults=new Map<string,DefaultEntry>();

export function visitContentText(content:Content,visit:(section:ContentDefaultSection,id:string,field:string,value:string,set:(value:string)=>void)=>void){
 for(const place of content.places)for(const field of ['name','subtitle'] as const)
  visit('places',place.id,field,place[field],value=>{place[field]=value;});
 for(const event of content.events){
  for(const field of ['title','reference','text'] as const)
   visit('events',event.id,field,event[field],value=>{event[field]=value;});
  event.script?.forEach((line,index)=>{
   if(line.speaker!==undefined)visit('events',event.id,`script.${index}.speaker`,line.speaker,value=>{line.speaker=value;});
   visit('events',event.id,`script.${index}.text`,line.text,value=>{line.text=value;});
  });
  event.choices.forEach((choice,index)=>{
   for(const field of ['text','reply'] as const)
    visit('events',event.id,`choices.${index}.${field}`,choice[field],value=>{choice[field]=value;});
  });
 }
 for(const asset of content.assets)for(const field of ['title','source','note'] as const)
  visit('assets',asset.id,field,asset[field],value=>{asset[field]=value;});
}

visitContentText(defaultContent,(section,id,field,value)=>{
 if(value?.trim())defaults.set(`${section}.${id}.${field}`,{source:value,variants:new Set([value])});
});
visitContentText(authoredContent as unknown as Content,(section,id,field,value)=>{
 const entry=defaults.get(`${section}.${id}.${field}`);
 if(entry&&value?.trim()){entry.source=value;entry.variants.add(value);}
});

export function authoredContentDefaults(){
 return Object.fromEntries([...defaults].map(([key,entry])=>[key,entry.source]));
}

export function isUnmodifiedContentDefault(section:ContentDefaultSection,id:string,field:string,value:string){
 const key=`${section}.${id}.${field}`,entry=defaults.get(key);
 return !!entry&&(entry.variants.has(value)||Object.values(catalogs).some(catalog=>catalog[key]===value));
}

/** Only untouched built-in fields follow the selected language. Custom values remain byte-for-byte unchanged. */
export function hydrateContentDefaults(content:Content,language:ContentDefaultLanguage):Content{
 visitContentText(content,(section,id,field,value,set)=>{
  const key=`${section}.${id}.${field}`,translation=catalogs[language][key];
  if(!content.defaultOverrides?.includes(key)&&translation!==undefined&&isUnmodifiedContentDefault(section,id,field,value))set(translation);
 });
 return content;
}
