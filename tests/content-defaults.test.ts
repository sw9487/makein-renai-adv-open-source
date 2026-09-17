import {test,expect} from 'bun:test';
import {defaultContent} from '../core/content';
import authoredContent from '../content/game.json';
import ja from '../web/locales/ja.json';
import zhTw from '../web/locales/zh-TW.json';
import en from '../web/locales/en.json';
import {authoredContentDefaults,hydrateContentDefaults,isUnmodifiedContentDefault} from '../core/content-defaults';
import {hasDefaultOverride,recordChangedDefaultFields,recordTranslatedField} from '../core/default-overrides';
import {validateContent} from '../server/validation';
import {defaultPublicAccounts} from '../core/twitter-public';
import {translationFields} from '../web/components/editor';

// Some content-default keys are proper nouns or identifiers that legitimately
// stay identical across locales: character speaker names, asset source URLs,
// and real place/shop brand names. Punctuation-only values likewise have no
// meaningful translation. The "must differ from source" check below is skipped
// for these so a faithful translation isn't treated as untranslated text.
function isNonTranslatable(key:string,value:string){
 if(key.endsWith('.speaker')) return true;               // character name line
 if(key.endsWith('.source')) return true;                // asset/source URL
 if(key.startsWith('places.') && key.endsWith('.name')) return true; // shop/place proper noun
 return /^[\p{P}\s]+$/u.test(value);                     // punctuation-only token (e.g. "。")
}

test('the default registry includes every place, event line, choice and library description',()=>{
 const source=authoredContentDefaults();
 expect(Object.keys(source).length).toBeGreaterThan(1100);
 expect(zhTw.contentDefaults as Record<string,string>).toEqual(source);
 for(const catalog of [ja.contentDefaults,en.contentDefaults] as Record<string,string>[])
  for(const [key,value] of Object.entries(catalog)){
   expect(key in source).toBe(true);
   expect(value.trim()).not.toBe('');
   if(!isNonTranslatable(key,value)) expect(value).not.toBe(source[key]);
  }
 for(const place of defaultContent.places)for(const field of ['name','subtitle'])
  expect(source[`places.${place.id}.${field}`]).toBeTruthy();
 for(const event of defaultContent.events){
  expect(source[`events.${event.id}.text`]).toBeTruthy();
  event.script?.forEach((_,index)=>expect(source[`events.${event.id}.script.${index}.text`]).toBeTruthy());
  event.choices.forEach((_,index)=>expect(source[`events.${event.id}.choices.${index}.reply`]).toBeTruthy());
 }
 for(const asset of defaultContent.assets)expect(source[`assets.${asset.id}.title`]).toBeTruthy();
});

test('untouched defaults switch languages while an explicitly edited field never switches',()=>{
 const place=defaultContent.places[0],key=`places.${place.id}.name`;
 const jaCatalog=ja.contentDefaults as Record<string,string>,enCatalog=en.contentDefaults as Record<string,string>;
 const oldJa=jaCatalog[key],oldEn=enCatalog[key];
 try{
  jaCatalog[key]='テスト用の教室';enCatalog[key]='Test classroom';
  const content=structuredClone(defaultContent);
  hydrateContentDefaults(content,'ja');
  expect(content.places[0].name).toBe('テスト用の教室');
  hydrateContentDefaults(content,'en');
  expect(content.places[0].name).toBe('Test classroom');
  const before=structuredClone(content);
  content.places[0].name='My classroom';
  recordChangedDefaultFields(before,content);
  expect(hasDefaultOverride(content,'places',place.id,'name')).toBe(true);
  hydrateContentDefaults(content,'ja');
  expect(content.places[0].name).toBe('My classroom');
  expect(validateContent(content).defaultOverrides).toContain(key);
  recordTranslatedField(content,'places.0.subtitle');
  expect(hasDefaultOverride(content,'places',place.id,'subtitle')).toBe(true);
 }finally{
  if(oldJa===undefined)delete jaCatalog[key];else jaCatalog[key]=oldJa;
  if(oldEn===undefined)delete enCatalog[key];else enCatalog[key]=oldEn;
 }
});

test('older authored event text is recognized as an untouched built-in value',()=>{
 const old=authoredContent.events.find(event=>event.id==='kaju-trust')!;
 expect(isUnmodifiedContentDefault('events',old.id,'text',old.text)).toBe(true);
});

test('AI translation enumerates only hand-overridden fields in all four authoring areas',()=>{
 const content=structuredClone(defaultContent);
 content.publicAccounts=defaultPublicAccounts('zh-Hant');
 for(const section of ['characters','publicAccounts','places','events','assets'] as const)
  expect(translationFields(content,section).map(field=>field.path)).toEqual([]);
 const before=structuredClone(content);
 content.characters[0].bio='自訂人物簡介';
 content.publicAccounts[0].bio='自訂公眾帳號簡介';
 content.places[0].subtitle='自訂場景副標';
 content.events[0].choices[0].reply='自訂選項結果';
 content.assets[0].note='自訂素材說明';
 recordChangedDefaultFields(before,content);
 for(const section of ['characters','publicAccounts','places','events','assets'] as const)
  expect(translationFields(content,section).length).toBe(1);
});
