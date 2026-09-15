import type {Content} from './types';
import {visitContentText} from './content-defaults';

export function defaultOverrideKey(section:string,id:string,field:string){return `${section}.${id}.${field}`;}
export function hasDefaultOverride(content:Content,section:string,id:string,field:string){
 return content.defaultOverrides?.includes(defaultOverrideKey(section,id,field))??false;
}

export function visitEditorText(content:Content,visit:(key:string,value:string)=>void){
 for(const character of content.characters){
  for(const field of ['name','reading','role','bio','prompt','imageNote','source'] as const){
   const value=character[field];if(typeof value==='string')visit(defaultOverrideKey('characters',character.id,field),value);
  }
  if(character.social?.twitterBio!==undefined)visit(defaultOverrideKey('characters',character.id,'social.twitterBio'),character.social.twitterBio);
  if(character.timeline)visit(defaultOverrideKey('characters',character.id,'timeline.note'),character.timeline.note);
  character.roles?.forEach((stage,index)=>{
   visit(defaultOverrideKey('characters',character.id,`roles.${index}.role`),stage.role);
   visit(defaultOverrideKey('characters',character.id,`roles.${index}.note`),stage.note);
  });
 }
 for(const account of content.publicAccounts??[]){
  for(const field of ['name','bio','prompt'] as const)visit(defaultOverrideKey('publicAccounts',account.id,field),account[field]);
  for(const [module,setting] of Object.entries(account.modules??{}))
   if(setting)visit(defaultOverrideKey('publicAccounts',account.id,`modules.${module}.prompt`),setting.prompt);
 }
 visitContentText(content,(section,id,field,value)=>visit(defaultOverrideKey(section,id,field),value));
}

/** Called only for actual editor edits, never while hydrating another language. */
export function recordChangedDefaultFields(before:Content,after:Content){
 const previous=new Map<string,string>();
 visitEditorText(before,(key,value)=>previous.set(key,value));
 const overrides=new Set(after.defaultOverrides??before.defaultOverrides??[]);
 visitEditorText(after,(key,value)=>{if(previous.has(key)&&previous.get(key)!==value)overrides.add(key);});
 after.defaultOverrides=[...overrides];
 return after;
}

export function recordTranslatedField(content:Content,indexedPath:string){
 const [section,index,...field]=indexedPath.split('.');
 if(!/^(characters|publicAccounts|places|events|assets)$/.test(section))return;
 const item=content[section as keyof Pick<Content,'characters'|'publicAccounts'|'places'|'events'|'assets'>]?.[Number(index)];
 if(!item)return;
 content.defaultOverrides=[...new Set([...(content.defaultOverrides??[]),defaultOverrideKey(section,item.id,field.join('.'))])];
}
