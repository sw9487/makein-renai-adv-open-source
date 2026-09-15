import en from '../web/locales/en.json';
import ja from '../web/locales/ja.json';
import zhTw from '../web/locales/zh-TW.json';

// Each translation lives in its existing language file; this is only a runtime lookup view.
// Compatibility with existing API literals; translations themselves contain only strings.
const sourceAliases:Record<string,string>={
 "api_route_or_method_not_found": "API route or method not found",
 "invalid_local_host": "Invalid local host",
 "cross_origin_request_rejected": "Cross-origin request rejected",
 "cross_site_request_rejected": "Cross-site request rejected",
 "method_not_allowed": "Method not allowed",
 "not_found": "Not found",
 "the_game_changed_while_this_request_was_running_refresh_the_page": "Game changed while this request was running.",
 "failed_to_save_twitter_npc_settings": "Twitter NPC setting failed",
 "proactive_line_request_failed": "Proactive LINE request failed",
 "missing_optimized_scene_image_parameter_0": "Missing optimized scene image: {0}",
 "invalid_default_override_key": "Invalid default override key."
};
const messageServiceKeys=['ai_check_image_missing','ai_capability_http','ai_capability_tool','ai_capability_args','ai_capability_vision','translation_field_invalid','llm_setup_required','translation_http','translation_incomplete','translation_result_invalid','translation_omitted','twitter_reply_image_forbidden','twitter_reply_image_forbidden_direct','twitter_pending_post_delete_forbidden','twitter_reply_image_http','twitter_reply_image_incomplete','twitter_reply_target_changed','ai_setup_required_game','ai_models_http','ai_model_missing','ai_models_unavailable'] as const;
export const serviceCatalog=[...Object.keys(en.service),...messageServiceKeys].map(key=>{
 const serviceId=key as keyof typeof en.service,messageId=key as (typeof messageServiceKeys)[number];
 const enText=en.service[serviceId]??en.messages[messageId],jaText=ja.service[serviceId]??ja.messages[messageId],zhText=zhTw.service[serviceId]??zhTw.messages[messageId];
 return [sourceAliases[key]??zhText,enText,jaText,zhText];
});
const catalog=serviceCatalog;

export type ServiceLanguage='ja'|'zh-Hant'|'en';
// Runtime lookup columns: canonical source, English, Japanese, Traditional Chinese.
const columns:Record<ServiceLanguage,number>={'zh-Hant':3,en:1,ja:2};
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const exactMessages=new Map<string,string[]>();
for(const row of catalog)for(const text of row)if(!/\{\d+\}/.test(text))exactMessages.set(text,row);
const entries=catalog.filter(row=>/\{\d+\}/.test(row[0])).map(row=>({row,patterns:row.map(template=>{
 const slots=[...template.matchAll(/\{(\d+)\}/g)].map(m=>Number(m[1]));
 return {slots,pattern:new RegExp('^'+template.split(/\{\d+\}/).map(escape).join('([\\s\\S]+?)')+'$')};
})}));

/** Full-message matching only. No substring translation of names, posts or user input. */
export function translatedServiceText(text:string,language:ServiceLanguage,depth=0):string|undefined{
 if(depth>4)return undefined;
 const value=text.replace(/^Error: /,'');
 // Exact matches take precedence over general parameterized wrappers.
 const exact=exactMessages.get(value);
 if(exact)return exact[columns[language]];
 for(const {row,patterns} of entries)for(const {slots,pattern} of patterns){
  if(!slots.length)continue;
  const match=pattern.exec(value);if(!match)continue;
  const params:Record<number,string>={};
  slots.forEach((slot,i)=>{params[slot]=translatedServiceText(match[i+1],language,depth+1)??match[i+1];});
  return row[columns[language]].replace(/\{(\d+)\}/g,(_,id)=>params[Number(id)]??'');
 }
 return undefined;
}

export function serviceError(text:string,language:ServiceLanguage):string{
 // Provider/native errors can contain credentials or local paths. Do not expose raw errors.
 return translatedServiceText(text,language)??translatedServiceText('操作失敗。',language)!;
}

/** Translate only explicitly designated service fields; never game content or dialogue. */
export function localizeServicePayload<T>(value:T,language:ServiceLanguage):T{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const out={...value} as Record<string,any>;
 const field=(object:Record<string,any>,key:string,strict=false)=>{
  if(typeof object[key]==='string'&&object[key])object[key]=strict?serviceError(object[key],language):translatedServiceText(object[key],language)??object[key];
 };
 field(out,'error',true);field(out,'notice');
 // AI status and release job messages are service metadata, not character messages.
 if(['ready','missing','unavailable'].includes(out.status))field(out,'message');
 if(out.job&&typeof out.job==='object'){out.job={...out.job};field(out.job,'message');}
 if(Array.isArray(out.jobs))out.jobs=out.jobs.map(job=>{const next={...job};field(next,'notice');return next;});
 if(Array.isArray(out.knowledge))out.knowledge=out.knowledge.map(item=>{const next={...item};field(next,'error',true);return next;});
 if(out.twitter&&typeof out.twitter==='object'){
  out.twitter={...out.twitter};
  if(out.twitter.notices)out.twitter.notices=Object.fromEntries(Object.entries(out.twitter.notices).map(([key,item])=>{const next={...(item as object)};field(next,'text');return [key,next];}));
  if(out.twitter.posts)out.twitter.posts=Object.fromEntries(Object.entries(out.twitter.posts).map(([key,item])=>{
   const next={...(item as Record<string,any>)};
   // Older saves use this string as a pending-state discriminator. Never translate protocol state.
   if(typeof next.imageStatus==='string')next.imageStatusLabel=translatedServiceText(next.imageStatus,language)??next.imageStatus;
   return [key,next];
  }));
 }
 return out as T;
}
