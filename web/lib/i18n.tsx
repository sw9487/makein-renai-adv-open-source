import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import jaCatalog from '../locales/ja.json';
import zhTwCatalog from '../locales/zh-TW.json';
import enCatalog from '../locales/en.json';

export type LanguagePreference='system'|'ja'|'zh-Hant'|'en';
export type AppLanguage=Exclude<LanguagePreference,'system'>;

const LANGUAGE_KEY='makeine-language';
let activeLanguage:AppLanguage='ja';

function platformLanguage():AppLanguage{
  const rules:[RegExp,AppLanguage][]=[[/^ja/,'ja'],[/^(?:zh-tw|zh-hk|zh-mo|zh.*hant)/,'zh-Hant'],[/^en/,'en']];
  const languages=typeof navigator==='undefined'?[]:(navigator.languages?.length?navigator.languages:[navigator.language]);
  return languages.flatMap(value=>rules.filter(([pattern])=>pattern.test((value||'').toLowerCase())).map(([,language])=>language))[0]??'ja';
}

if(typeof window!=='undefined'){
 const state=window as typeof window&{__makeineLocalizedFetch?:boolean};
 if(!state.__makeineLocalizedFetch){
  const original=window.fetch.bind(window);
  window.fetch=((input:RequestInfo|URL,init:RequestInit={})=>{
   const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
   if(url.origin!==window.location.origin)return original(input,init);
   const headers=new Headers(init.headers??(input instanceof Request?input.headers:undefined));
   headers.set('X-Makeine-Language',activeLanguage);return original(input,{...init,headers});
  }) as typeof window.fetch;
  state.__makeineLocalizedFetch=true;
 }
}

const messages={ja:jaCatalog.messages,'zh-Hant':zhTwCatalog.messages,en:enCatalog.messages} as const;

type MessageKey=keyof typeof messages.ja;
type I18nValue={preference:LanguagePreference;language:AppLanguage;setPreference:(value:LanguagePreference)=>void;t:(key:MessageKey)=>string};
const I18nContext=createContext<I18nValue|null>(null);
export function uiText(key:MessageKey,...values:(string|number)[]){
 return values.reduce<string>((text,value,index)=>text.replaceAll(`{${index}}`,String(value)),messages[activeLanguage][key]);
}
export function I18nProvider({children}:{children:ReactNode}){
  const [preference,setPreferenceState]=useState<LanguagePreference>(()=>{
    try{const saved=localStorage.getItem(LANGUAGE_KEY);return ['system','ja','zh-Hant','en'].includes(saved||'')?saved as LanguagePreference:'system';}catch{return 'system';}
  });
  const [system,setSystem]=useState(platformLanguage);
  useEffect(()=>{
    const update=()=>setSystem(platformLanguage());
    window.addEventListener('languagechange',update);
    return()=>window.removeEventListener('languagechange',update);
  },[]);
  const language=preference==='system'?system:preference;
  activeLanguage=language;
  useEffect(()=>{
    document.documentElement.lang=language;
    document.documentElement.dataset.language=language;
  },[language]);
  const value=useMemo<I18nValue>(()=>({preference,language,setPreference(value){setPreferenceState(value);try{localStorage.setItem(LANGUAGE_KEY,value);}catch{}},t:key=>messages[language][key]}),[preference,language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){const value=useContext(I18nContext);if(!value)throw Error('I18nProvider is missing.');return value;}

export function LanguageSelect({className,disabled=false}:{className?:string;disabled?:boolean}){
  const {preference,setPreference,t}=useI18n();
  return <label className={className}>{t('language.label')}<select disabled={disabled} value={preference} onChange={event=>setPreference(event.target.value as LanguagePreference)}><option value="system">{t('language.system')}</option><option value="ja">{t('language.ja')}</option><option value="zh-Hant">{t('language.zh-Hant')}</option><option value="en">{t('language.en')}</option></select></label>;
}
