import type {Content} from './types';
import {defaultContent} from './content';
import authoredSnapshot from '../content/character-defaults.json';
import ja from '../web/locales/ja.json';
import zhTw from '../web/locales/zh-TW.json';
import en from '../web/locales/en.json';

export type CharacterDefaultLanguage='ja'|'zh-Hant'|'en';
const catalogs={ja,'zh-Hant':zhTw,en} as const;
type CharacterDefaultKey=keyof typeof zhTw.characterDefaults;
type AuthoredCharacter={name:string;role:string;bio:string;prompt:string;imageNote?:string;timelineNote?:string;roles:{year:number;month:number;day?:number;role:string;note:string}[]};
const authoredCharacters=authoredSnapshot as Record<string,AuthoredCharacter>;

function translatedDefault(value:string|undefined,authored:string|undefined,language:CharacterDefaultLanguage,alias?:string){
 if(value===undefined||authored===undefined)return value;
 const key=authored as CharacterDefaultKey;
 const target=catalogs[language].characterDefaults[key];
 if(target===undefined)return value;
 const untouched=value===authored||value===alias||Object.values(catalogs).some(catalog=>catalog.characterDefaults[key]===value);
 return untouched?target:value;
}

function matchesDefault(value:string,authored:string|undefined,alias?:string){
 if(authored===undefined)return false;
 const key=authored as CharacterDefaultKey;
 return value===authored||value===alias||Object.values(catalogs).some(catalog=>catalog.characterDefaults[key]===value);
}

function originalPrompt(value:string,authored:AuthoredCharacter){
 if(value===authored.prompt)return true;
 const key=authored.prompt.slice('i18n:'.length) as keyof typeof zhTw.prompts;
 return Object.values(catalogs).some(catalog=>{
  const specific=catalog.prompts[key];
  const bio=catalog.characterDefaults[authored.bio as CharacterDefaultKey]??authored.bio;
  const generic=catalog.prompts['character.default'].replace('{name}',authored.name).replace('{bio}',bio);
  const oldGeneric=catalog.prompts['character.default'].replace('{name}',authored.name).replace('{bio}',authored.bio);
  return value===specific||value===generic||value===oldGeneric;
 });
}

export function isUnmodifiedCharacterField(character:Content['characters'][number],field:string,value:string){
 const authored=authoredCharacters[character.id];
 if(!authored)return false;
 const generated=defaultContent.characters.find(candidate=>candidate.id===character.id);
 if(field==='name'||field==='reading'||field==='source')return value===defaultContent.characters.find(candidate=>candidate.id===character.id)?.[field];
 if(field==='prompt')return value.startsWith('i18n:')||originalPrompt(value,authored);
 if(field==='role'||field==='bio'||field==='imageNote')return matchesDefault(value,authored[field],generated?.[field]);
 if(field==='timeline.note')return matchesDefault(value,authored.timelineNote);
 if(field==='social.twitterBio')return Object.values(catalogs).some(catalog=>
  value===(catalog.characterTwitterBios as Record<string,string>)[character.id]||value===catalog.characterTwitterBioFallback);
 const match=/^roles\.(\d+)\.(role|note)$/.exec(field);
 if(match){
  const index=Number(match[1]),stage=character.roles?.[index],original=authored.roles?.[index];
  return !!stage&&!!original&&stage.year===original.year&&stage.month===original.month&&stage.day===original.day&&matchesDefault(value,original[match[2] as 'role'|'note']);
 }
 return false;
}

/** Localize only unmodified built-in fields. User-authored characters and edited fields stay unchanged. */
export function hydrateCharacterDefaults(content:Content,language:CharacterDefaultLanguage):Content{
 for(const character of content.characters){
  const authored=authoredCharacters[character.id];
  if(!authored)continue;
  const generated=defaultContent.characters.find(candidate=>candidate.id===character.id);
  const untouched=(field:string)=>!content.defaultOverrides?.includes(`characters.${character.id}.${field}`);
  if(untouched('role'))character.role=translatedDefault(character.role,authored.role,language,generated?.role)??character.role;
  if(untouched('bio'))character.bio=translatedDefault(character.bio,authored.bio,language,generated?.bio)??character.bio;
  if(untouched('imageNote'))character.imageNote=translatedDefault(character.imageNote,authored.imageNote,language,generated?.imageNote);
  if(character.timeline&&authored.timelineNote&&untouched('timeline.note'))character.timeline.note=translatedDefault(character.timeline.note,authored.timelineNote,language)??character.timeline.note;
  for(const [index,stage] of (character.roles??[]).entries()){
   const original=authored.roles?.[index];
   if(!original||stage.year!==original.year||stage.month!==original.month||stage.day!==original.day)continue;
   if(untouched(`roles.${index}.role`))stage.role=translatedDefault(stage.role,original.role,language)??stage.role;
   if(untouched(`roles.${index}.note`))stage.note=translatedDefault(stage.note,original.note,language)??stage.note;
  }
  if(untouched('prompt')&&originalPrompt(character.prompt,authored))character.prompt=authored.prompt;
 }
 return content;
}

export function displayedCharacterPrompt(value:string,language:CharacterDefaultLanguage,character?:Pick<Content['characters'][number],'name'|'bio'>){
 if(!value.startsWith('i18n:'))return value;
 const key=value.slice(5) as keyof typeof zhTw.prompts;
 const template=catalogs[language].prompts[key]??value;
 return character?template.replaceAll('{name}',character.name).replaceAll('{bio}',character.bio):template;
}
