import {test,expect} from 'bun:test';
import authoredContent from '../content/game.json';
import authoredSnapshot from '../content/character-defaults.json';
import ja from '../web/locales/ja.json';
import zhTw from '../web/locales/zh-TW.json';
import en from '../web/locales/en.json';
import type {Content} from '../core/types';
import {displayedCharacterPrompt,hydrateCharacterDefaults} from '../core/character-defaults';
import {defaultPublicAccounts,hydratePublicAccounts} from '../core/twitter-public';

const catalogs={ja,'zh-Hant':zhTw,en} as const;
const source=authoredContent as unknown as Content;
const defaults=(language:keyof typeof catalogs)=>catalogs[language].characterDefaults as Record<string,string>;

test('every authored character default has Japanese, Chinese and English text',()=>{
 for(const character of source.characters){
  const snapshot=(authoredSnapshot as Record<string,any>)[character.id];
  expect(snapshot).toMatchObject({name:character.name,role:character.role,bio:character.bio,prompt:character.prompt,timelineNote:character.timeline?.note,roles:character.roles});
  expect(snapshot.imageNote).toBe(character.imageNote);
 }
 const text=new Set<string>();
 for(const ch of source.characters)for(const value of [ch.role,ch.bio,ch.timeline?.note,ch.imageNote,...(ch.roles??[]).flatMap(stage=>[stage.role,stage.note])])if(value)text.add(value);
 for(const value of text)for(const language of Object.keys(catalogs) as (keyof typeof catalogs)[])expect(defaults(language)[value]).toBeTruthy();
});

test('untouched saved character defaults follow locale changes, including old expanded prompts',()=>{
 const content=structuredClone(source);
 for(const character of content.characters){
  const key=character.prompt.slice(5) as keyof typeof zhTw.prompts;
  character.prompt=zhTw.prompts[key];
 }
 const anna=content.characters.find(ch=>ch.id==='anna')!;
 anna.prompt=zhTw.prompts['character.default'].replace('{name}',anna.name).replace('{bio}',anna.bio);
 const originalRole=anna.role,originalBio=anna.bio;
 hydrateCharacterDefaults(content,'ja');
 expect(anna.role).toBe(defaults('ja')[originalRole]);
 expect(anna.bio).toBe(defaults('ja')[originalBio]);
 expect(anna.prompt).toBe('i18n:character.anna');
 expect(displayedCharacterPrompt(anna.prompt,'ja')).toBe(ja.prompts['character.anna']);
 for(const language of ['en','zh-Hant','ja'] as const){
  hydrateCharacterDefaults(content,language);
  expect(anna.role).toBe(defaults(language)[originalRole]);
  expect(anna.bio).toBe(defaults(language)[originalBio]);
 }
});

test('character and public-account field overrides survive every locale switch',()=>{
 const content=structuredClone(source);
 const anna=content.characters.find(ch=>ch.id==='anna')!;
 anna.role='My role';anna.bio='My biography';anna.prompt='My prompt';anna.timeline!.note='My timeline';anna.roles![0].note='My stage note';
 content.publicAccounts=defaultPublicAccounts('zh-Hant');
 const account=content.publicAccounts[0];account.bio='My public bio';account.prompt='My public prompt';
 const active=Object.values(account.modules??{}).find(module=>module?.enabled);
 if(active)active.prompt='My module prompt';
 for(const language of ['ja','en','zh-Hant'] as const){
  hydrateCharacterDefaults(content,language);hydratePublicAccounts(content,language);
  expect([anna.role,anna.bio,anna.prompt,anna.timeline!.note,anna.roles![0].note]).toEqual(['My role','My biography','My prompt','My timeline','My stage note']);
  expect(account.bio).toBe('My public bio');expect(account.prompt).toBe('My public prompt');
  if(active)expect(active.prompt).toBe('My module prompt');
 }
});
