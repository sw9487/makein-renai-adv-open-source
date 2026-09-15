import {prompt} from './prompt';
import {defaultPublicAccounts,hasPublicModule,type TwitterPublicAccount,type PublicAccountModule} from '../core/twitter-public';
function accountFor(actor:string,account?:TwitterPublicAccount){return account??defaultPublicAccounts().find(item=>item.id===actor);}
function modulePrompt(account:TwitterPublicAccount|undefined,module:PublicAccountModule,key:string){return hasPublicModule(account,module)?[prompt(key),account?.modules?.[module]?.prompt].filter(Boolean).join('\n\n'):'';}

export function storePromotionStrategy(actor:string,trigger?:{kind:string},account?:TwitterPublicAccount){
 return {system:!trigger?modulePrompt(accountFor(actor,account),'promotion','twitter.storePromotionSystem'):'',actions:trigger?['reply','like','block']:['post','unblock','idle']};
}

export function policeAdvisoryStrategy(actor:string,trigger?:{kind:string},account?:TwitterPublicAccount){
 return {system:!trigger?modulePrompt(accountFor(actor,account),'advisory','twitter.policeAdvisorySystem'):'',actions:trigger?(trigger.kind==='patrol'?['reply','idle']:['reply']):['post','unblock','idle']};
}

export function municipalOutreachStrategy(actor:string,trigger?:{kind:string},account?:TwitterPublicAccount){
 return {system:!trigger?modulePrompt(accountFor(actor,account),'municipal','twitter.municipalOutreachSystem'):'',actions:trigger?['reply','like','block']:['post','quote','unblock','idle']};
}

export function regionalNewsCoverageStrategy(actor:string,trigger?:{kind:string},account?:TwitterPublicAccount){
 return trigger?.kind==='news-digest'?modulePrompt(accountFor(actor,account),'reporting','twitter.regionalNewsCoverageSystem'):'';
}

export function civicInformationStrategy(account:TwitterPublicAccount|undefined,trigger?:{kind:string}){
 return !trigger&&hasPublicModule(account,'civic')?account?.modules?.civic?.prompt??'':'';
}

export function civicInformationActions(trigger?:{kind:string}){
 return trigger?['reply','like','block']:['post','unblock','idle'];
}
