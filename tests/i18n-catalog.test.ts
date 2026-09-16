import {describe,expect,test} from 'bun:test';
import ja from '../web/locales/ja.json';
import zhTw from '../web/locales/zh-TW.json';
import en from '../web/locales/en.json';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import game from '../content/game.json';

describe('i18n catalogs',()=>{
 const localeCatalogs={ja,'zh-TW':zhTw,en};
 const englishKey=/^[a-z][a-zA-Z0-9]*(?:[._-][a-zA-Z0-9]+)*$/;
 test('all locale files expose the exact same UI translation structure',()=>{
  const shape=(value:unknown,path=''):string[]=>value&&typeof value==='object'
   ? Object.entries(value).filter(([key])=>path!==''||key!=='contentDefaults').flatMap(([key,child])=>[path?path+'.'+key:key,...shape(child,path?path+'.'+key:key)])
   : [];
  const expected=shape(ja).sort();
  expect(shape(zhTw).sort()).toEqual(expected);
  expect(shape(en).sort()).toEqual(expected);
  for(const catalog of Object.values(localeCatalogs)){
    for(const section of ['messages','prompts','service','cli'] as const)for(const key of Object.keys(catalog[section]))expect(key).toMatch(englishKey);
  }
 });
 test('service and CLI messages share source identifiers and parameters across the three language files',()=>{
  const placeholders=(text:string)=>[...text.matchAll(/\{(\d+)\}/g)].map(m=>m[1]).sort();
  for(const section of ['service','cli'] as const){
   for(const [id,entry] of Object.entries(zhTw[section]))for(const catalog of Object.values(localeCatalogs)){
    const translated=(catalog[section] as Record<string,string>)[id];
    expect(translated.trim()).not.toBe('');
    expect(placeholders(translated)).toEqual(placeholders(entry));
   }
  }
 });
 test('all message entries are strings with semantic keys and no metadata wrappers',()=>{
  for(const catalog of [en,ja,zhTw])for(const section of ['messages','prompts','service','cli'] as const){
   for(const [key,entry] of Object.entries(catalog[section])){
    expect(typeof entry).toBe('string');
    expect(key).not.toMatch(/^(?:service|cli|legacy)_\d+$/);
   }
  }
  // Language selector labels show each language's native endonym, so they are exempt from the English-only check.
  const endonymKeys=new Set<string>(['language.ja','language.zh-Hant','language.en']);
  for(const [key,entry] of Object.entries(en.messages))if(!endonymKeys.has(key))expect(entry).not.toMatch(/[\u3400-\u9fff]/);
  for(const section of ['service','cli'] as const)for(const entry of Object.values(en[section]))expect(entry).not.toMatch(/[\u3400-\u9fff]/);
  expect(zhTw.service.invalid_requestId_format).toBe('requestId 格式不正確。');
 });
 test('general narration and image-decision instructions use the requested language',()=>{
  for(const key of ['chat.perspective','image.skillSelector','image.mode.manual','image.mode.automatic','image.decision','image.workflow'] as const){
   expect(en.prompts[key]).not.toMatch(/[\u3400-\u9fff]/);
   expect(ja.prompts[key]).not.toBe(zhTw.prompts[key]);
   expect(ja.prompts[key]).toMatch(/[\u3040-\u30ff]/);
  }
 });
 test('all locale files expose the same prompt keys and placeholders',()=>{
  const keys=Object.keys(ja.prompts).sort();
  expect(Object.keys(zhTw.prompts).sort()).toEqual(keys);
  expect(Object.keys(en.prompts).sort()).toEqual(keys);
  const placeholders=(value:string)=>[...value.matchAll(/\{([\w.]+)\}/g)].map(match=>match[1]).sort();
  for(const key of keys){
   expect(ja.prompts[key as keyof typeof ja.prompts].trim().length).toBeGreaterThan(0);
   expect(placeholders(zhTw.prompts[key as keyof typeof zhTw.prompts])).toEqual(placeholders(ja.prompts[key as keyof typeof ja.prompts]));
   expect(placeholders(en.prompts[key as keyof typeof en.prompts])).toEqual(placeholders(ja.prompts[key as keyof typeof ja.prompts]));
  }
 });
 test('model prompt sources use catalog lookups instead of language branches or string literals',()=>{
  const files=['chat.ts','scene.ts','scene-context.ts','proactive-line.ts','twitter.ts','knowledge.ts','knowledge-generate.ts','web-search.ts','stable-diffusion.ts','image-art-direction.ts','line-image-policy.ts','character-tool.ts','chat-detail.ts','character-tags.ts','image-tag-skills.ts'];
  for(const file of files){
   const source=readFileSync(new URL('../server/'+file,import.meta.url),'utf8');
   expect(source).not.toMatch(/(?:language|locale)\s*={2,3}\s*['"]/i);
   expect(source).not.toMatch(/role\s*:\s*['"]system['"][^\n]*content\s*:\s*['"`]/);
   expect(source).not.toMatch(/description\s*:\s*['"`][^'"`\r\n]+/);
  }
  for(const file of ['request-locale.ts','prompt-catalog.ts']){
   const source=readFileSync(new URL('../server/'+file,import.meta.url),'utf8');
   expect(source).not.toMatch(/(?:language|locale)\s*={2,3}\s*['"]/i);
  }
  for(const file of ['i18n.tsx']){
   const source=readFileSync(new URL('../web/lib/'+file,import.meta.url),'utf8');
   expect(source).not.toMatch(/(?:language|locale)\s*={2,3}\s*['"]/i);
  }
 });
 test('Japanese and English cover every key-based UI message',()=>{
  expect(Object.keys(ja.messages).sort()).toEqual(Object.keys(en.messages).sort());
  expect(Object.keys(zhTw.messages).sort()).toEqual(Object.keys(en.messages).sort());
  for(const id of Object.keys(en.messages) as (keyof typeof en.messages)[]){
   expect(en.messages[id].trim()).not.toBe('');
   expect(ja.messages[id].trim()).not.toBe('');
   expect(zhTw.messages[id].trim()).not.toBe('');
  }
  expect(Object.keys(en.messages).length).toBeGreaterThan(900);
 });
 test('built-in game and roster prompts are catalog references',()=>{
  expect(game.settings.systemPrompt).toBe('i18n:game.system');
  for(const character of game.characters){
   expect(character.prompt).toBe('i18n:character.'+character.id);
   expect(character.prompt.slice(5) in zhTw.prompts).toBe(true);
  }
  for(const file of ['content.ts','roster.ts']){
   const source=readFileSync(new URL('../core/'+file,import.meta.url),'utf8');
   expect(source).not.toMatch(/(?:systemPrompt|prompt)\s*:\s*['"`]((?!i18n:)[^'"`])/);
  }
 });
 test('every built-in i18n reference resolves in every locale JSON file',()=>{
  const refs=new Set<string>();
  const collect=(value:unknown)=>{
   if(typeof value==='string'&&value.startsWith('i18n:'))refs.add(value.slice(5));
   else if(Array.isArray(value))value.forEach(collect);
   else if(value&&typeof value==='object')Object.values(value).forEach(collect);
  };
  collect(game);
  for(const file of ['content.ts','roster.ts']){
   const source=readFileSync(new URL('../core/'+file,import.meta.url),'utf8');
   for(const match of source.matchAll(/i18n:([a-zA-Z0-9._-]+)/g))refs.add(match[1]);
  }
  for(const key of refs)for(const catalog of Object.values(localeCatalogs))expect(key in catalog.prompts).toBe(true);
 });
 describe('prompt content snapshots',()=>{
  const hashes:Record<string,string>={
   // a3f50b1 removed the relationship-pacing/canon sentence; retain that committed edit.
   'game.system':'9f54bd6afb303f578e002c6eb9627443c6d50c7d577f40183b331240c39bd3ca',
   'game.system.default':'be0a72abce00dce7feb76f90dfec5659cc664ff90a760cb580d7d60482e2ccc3',
   'scene.adult':'6c548ceacb981106661dfe960f428a64fad015ed88e4697245247403f427e534',
   'image.unlock':'2a6b05da95eb82acd39cb723ba8f05de3629d6e36b3d4694a6c0d9bc8fd52255',
   'image.linePolicy':'fe8f480ac6c309ac1ceb698467dd059e3f0cb6345283e1eb55ff8a70c6251bdf',
   'image.artDirection':'c5eccb72c4cc0685413683b09482691da72555958fd253a437ec76dbf8b1c8fa',
   'image.skillFooter':'57ee2bfb24bd5e2a9618cba99d6311b4e8753a8b24974c426284f0a606d908ca',
   'image.skillContent.erotic':'e3f2bfb85abdd71e9b74310b11f7c441fac6f562eb71b76d0483f7f48b04affb',
   'image.skillContent.violent':'89807eecb5a46fd8822aab7721c7315be9c4b48f164faf0e22844cdcad0c1206',
   'image.skillContent.bloody':'9fc38f90152de750c8bb03ba1742a7598884bb1b73514bc31c20042785291828',
   'image.skillContent.grotesque':'e4cf3b7e08da55a4f921219ce30813830e9a6ec3c685cf3124cb9af7185d18be',
  };
  for(const [key,hash] of Object.entries(hashes)){
   test(key+' matches its recorded SHA-256',()=>{
    expect(createHash('sha256').update(zhTw.prompts[key as keyof typeof zhTw.prompts]).digest('hex')).toBe(hash);
   });
  }
 });
});
