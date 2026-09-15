import ja from '../web/locales/ja.json';
import zhTw from '../web/locales/zh-TW.json';
import en from '../web/locales/en.json';
import type {AppLanguage} from './request-locale';

type PromptParams=Record<string,string|number|boolean|null|undefined>;
type Catalog={prompts:Record<string,string>};
const catalogs:Record<AppLanguage,Catalog>={ja,'zh-Hant':zhTw,en};

export function promptFor(language:AppLanguage,key:string,params:PromptParams={}){
 const template=catalogs[language].prompts[key]??(()=>{throw Error(`Missing i18n prompt: ${language}.${key}`);})();
 return template.replace(/\{([\w.]+)\}/g,(token,name:string)=>Object.hasOwn(params,name)?String(params[name]??''):token);
}
