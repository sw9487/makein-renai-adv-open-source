import {AsyncLocalStorage} from 'node:async_hooks';
import {promptFor} from './prompt-catalog';

export type AppLanguage='ja'|'zh-Hant'|'en';
const localeStorage=new AsyncLocalStorage<AppLanguage>();
const languageRules:[RegExp,AppLanguage][]=[
 [/^(?:zh-hant|zh-tw|zh-hk|zh-mo)/,'zh-Hant'],
 [/^ja/,'ja'],
 [/^en/,'en'],
];

export function resolveLanguage(value:string|null|undefined):AppLanguage{
 const values=(value??'').split(',').map(item=>item.split(';')[0].trim().toLowerCase());
 return values.flatMap(value=>languageRules.filter(([pattern])=>pattern.test(value)).map(([,language])=>language))[0]??'ja';
}

export function withRequestLocale<T>(request:Request,task:()=>T):T{
 // EventSource cannot set custom headers; its same-origin URL carries the preference.
 const url=new URL(request.url);
 const eventLanguage=url.pathname==='/api/game'&&url.searchParams.has('events')?url.searchParams.get('language'):null;
 return localeStorage.run(resolveLanguage(request.headers.get('x-makeine-language')||eventLanguage||request.headers.get('accept-language')),task);
}

export function requestLanguage():AppLanguage{return localeStorage.getStore()??'ja';}

export function generationLanguageInstruction(language=requestLanguage()){
 return promptFor(language,'output.language');
}
