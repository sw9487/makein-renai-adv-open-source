import type {Content} from './types';
import jaCatalog from '../web/locales/ja.json';
import zhTwCatalog from '../web/locales/zh-TW.json';
import enCatalog from '../web/locales/en.json';
export const publicAccountModules=['promotion','civic','advisory','patrol','reporting','municipal'] as const;
export type PublicAccountModule=typeof publicAccountModules[number];
export type PublicPromptLanguage='ja'|'zh-Hant'|'en';
type PublicPromptCatalog={starter:Record<PublicAccountModule,string>;identity:Record<string,string>;modules:Record<string,Partial<Record<PublicAccountModule,string>>>;legacy?:{identity?:Record<string,string>;modules?:Record<string,Partial<Record<PublicAccountModule,string>>>}};
const promptCatalogs:Record<PublicPromptLanguage,PublicPromptCatalog>={ja:jaCatalog.publicAccountPrompts,'zh-Hant':zhTwCatalog.publicAccountPrompts,en:enCatalog.publicAccountPrompts};
const bioCatalogs:Record<PublicPromptLanguage,Record<string,string>>={ja:jaCatalog.publicAccountBios,'zh-Hant':zhTwCatalog.publicAccountBios,en:enCatalog.publicAccountBios};
export function publicModuleStarterPrompts(language:PublicPromptLanguage='ja'){return promptCatalogs[language].starter;}
export type TwitterPublicAccount={id:string;name:string;handle:string;bio:string;color:string;avatar:string;cover?:string;sourceUrl?:string;prompt:string;modules?:Partial<Record<PublicAccountModule,{enabled:boolean;prompt:string}>>;patrol?:'public-safety';editorial?:'regional-news'};

/** Stable facts only. Temporary hours, stock, prices and events must not be invented. */
export const twitterPublicAccounts:TwitterPublicAccount[]=[
 {id:'official-tsuwabuki',name:'石蕗高校',handle:'tsuwabuki_hs',color:'#315b9a',avatar:'',bio:'',prompt:''},
 {id:'official-toyohashi-city',name:'豊橋市役所',handle:'toyohashi_city',color:'#16836b',avatar:'',sourceUrl:'https://www.city.toyohashi.lg.jp/8775.htm',bio:'',prompt:''},
 {id:'official-toyohashi-police',name:'豊橋警察署',handle:'toyohashi_pol',color:'#102b57',avatar:'',sourceUrl:'https://www.pref.aichi.jp/police/syokai/sho/toyohashi/',bio:'',prompt:'',patrol:'public-safety'},
 {id:'official-higashiaichi-news',name:'東愛知新聞社',handle:'Higasiaichinews',color:'#d71920',avatar:'',sourceUrl:'https://x.com/Higasiaichinews',bio:'',prompt:'',editorial:'regional-news'},
 {id:'official-underground-resources',name:'豊橋市地下資源館',handle:'toyohaku_chika',color:'#84613d',avatar:'',sourceUrl:'https://www.toyohaku.gr.jp/chika/floor.html',bio:'',prompt:''},
 {id:'official-library',name:'豊橋市中央図書館',handle:'toyohashi_lib',color:'#6b4b93',avatar:'',sourceUrl:'https://www.library.toyohashi.aichi.jp/facility/chuou/',bio:'',prompt:''},
 {id:'official-public-hall',name:'豊橋市公会堂',handle:'toyohashi_hall',color:'#8a4f3d',avatar:'',sourceUrl:'https://www.bunzai.or.jp/publichall/index.php',bio:'',prompt:''},
 {id:'official-gusto-hashira',name:'ガスト 豊橋橋良店',handle:'gusto_hashira',color:'#d72b2f',avatar:'',sourceUrl:'https://store-info.skylark.co.jp/gusto/map/011654/',bio:'',prompt:''},
 {id:'official-seibunkan',name:'精文館書店 豊橋本店',handle:'seibunkan_h',color:'#2563a8',avatar:'',sourceUrl:'https://www.seibunkan.co.jp/shop/honten/',bio:'',prompt:''},
 {id:'official-uno-uno',name:'駅ビルカフェ UNO-UNO',handle:'cafe_unouno',color:'#8b5535',avatar:'',sourceUrl:'https://www.loisir-toyohashi.com/restaurant/unouno/',bio:'',prompt:''},
 {id:'official-bon-senga',name:'ボン.千賀',handle:'bon_senga',color:'#b74637',avatar:'',sourceUrl:'https://senga-seika.co.jp/bon-senga/',bio:'',prompt:''},
 {id:'official-murata-takoyaki',name:'むらたのたこやき',handle:'murata_takoyaki',color:'#d04835',avatar:'',sourceUrl:'https://www.toyohashi-kalmia.jp/shop/mutratamotakoyaki/',bio:'',prompt:''},
 {id:'official-housendo-kalmia',name:'豊川堂 カルミア店',handle:'housendo_kalmia',color:'#1f5e98',avatar:'',sourceUrl:'https://www.toyohashi-kalmia.jp/shop/housendou/',bio:'',prompt:''},
 {id:'official-yamasa-west',name:'ヤマサちくわ 西駅店',handle:'yamasa_nishieki',color:'#c6332e',avatar:'',sourceUrl:'https://location.yamasachikuwa.com/store/2026052516443961.html',bio:'',prompt:''},
 {id:'official-coffee-canele',name:'CAFE et CANELE（珈琲とカヌレ）',handle:'coffee_canele0',color:'#745044',avatar:'',sourceUrl:'https://x.com/coffee_canele0',bio:'',prompt:''},
 {id:'official-miyako-udon',name:'みやこうどん',handle:'miyako_udon',color:'#a86524',avatar:'',bio:'',prompt:''},
 {id:'official-waltz',name:'ワルツ 豊橋店',handle:'waltz_toyohashi',color:'#743d28',avatar:'',sourceUrl:'https://www.waltz.co.jp/',bio:'',prompt:''},
 {id:'official-bontoraya',name:'ボンとらや 本店',handle:'bontora_honten',color:'#e26f44',avatar:'',sourceUrl:'https://bontoraya.jp/',bio:'',prompt:''},
 {id:'official-yamasa',name:'ヤマサちくわ 本店',handle:'yamasa_honten',color:'#c6332e',avatar:'',sourceUrl:'https://x.com/yamasachikuwa',bio:'',prompt:''},
];

export const twitterPublicAccountMap=new Map(twitterPublicAccounts.map(account=>[account.id,account]));
export function twitterPublicAccount(id:string){return twitterPublicAccountMap.get(id);}
export function isTwitterPublicAccount(id:string){return twitterPublicAccountMap.has(id);}
const publicCovers:Record<string,string>={};
export function twitterPublicCover(id:string){return publicCovers[id]??'';}
const defaultStoreIds=new Set(['official-gusto-hashira','official-seibunkan','official-uno-uno','official-bon-senga','official-murata-takoyaki','official-housendo-kalmia','official-yamasa-west','official-coffee-canele','official-miyako-udon','official-waltz','official-bontoraya','official-yamasa']);
export function defaultPublicAccounts(language:PublicPromptLanguage='ja'):TwitterPublicAccount[]{
 const catalog=promptCatalogs[language];
 return twitterPublicAccounts.map(account=>{
  const active:PublicAccountModule[]=defaultStoreIds.has(account.id)?['promotion']:account.id==='official-toyohashi-city'?['civic','municipal']:account.id==='official-toyohashi-police'?['advisory','patrol']:account.id==='official-higashiaichi-news'?['reporting']:['civic'];
  return {...structuredClone(account),bio:bioCatalogs[language][account.id]??'',prompt:catalog.identity[account.id]??'',cover:twitterPublicCover(account.id),modules:Object.fromEntries(active.map(module=>[module,{enabled:true,prompt:catalog.modules[account.id]?.[module]??''}]))};
 });
}
/** Upgrade only untouched built-in defaults; preserve editor-authored instructions and disabled modules. */
export function hydratePublicAccounts(content:Content,language:PublicPromptLanguage='ja'):Content{
 content.publicAccounts??=defaultPublicAccounts(language);
 const catalog=promptCatalogs[language];
 const locales=Object.values(promptCatalogs);
 for(const account of content.publicAccounts){
  const untouched=(field:string)=>!content.defaultOverrides?.includes(`publicAccounts.${account.id}.${field}`);
  const identity=catalog.identity[account.id];
  if(untouched('prompt')&&identity&&(!account.prompt?.trim()||locales.some(item=>item.identity[account.id]===account.prompt||item.legacy?.identity?.[account.id]===account.prompt)))account.prompt=identity;
  const bio=bioCatalogs[language][account.id];
  if(untouched('bio')&&bio&&(!account.bio?.trim()||Object.values(bioCatalogs).some(item=>item[account.id]===account.bio)))account.bio=bio;
  for(const [module,setting] of Object.entries(account.modules??{})){
   const key=module as PublicAccountModule;
   const preset=catalog.modules[account.id]?.[key];
   if(setting&&untouched(`modules.${key}.prompt`)&&preset&&(!setting.prompt?.trim()||locales.some(item=>item.modules[account.id]?.[key]===setting.prompt||item.legacy?.modules?.[account.id]?.[key]===setting.prompt)))setting.prompt=preset;
  }
 }
 return content;
}
export function publicAccounts(content?:Pick<Content,'publicAccounts'>):TwitterPublicAccount[]{return content?.publicAccounts??defaultPublicAccounts();}
export function publicAccount(content:Pick<Content,'publicAccounts'>|undefined,id:string){return publicAccounts(content).find(account=>account.id===id);}
export function hasPublicModule(account:TwitterPublicAccount|undefined,module:PublicAccountModule){return account?.modules?.[module]?.enabled===true;}
