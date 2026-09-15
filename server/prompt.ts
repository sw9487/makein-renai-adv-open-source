import {promptFor} from './prompt-catalog';
import {requestLanguage} from './request-locale';

type PromptParams=Record<string,string|number|boolean|null|undefined>;
export const prompt=(key:string,params:PromptParams={})=>promptFor(requestLanguage(),key,params);

export function configuredPrompt(value:string,params:PromptParams={}){
 const match=/^i18n:(.+)$/.exec(value.trim());
 return match?.[1]?prompt(match[1],params):value;
}
