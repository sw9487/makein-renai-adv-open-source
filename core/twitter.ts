import type {Character,Content,GameState} from './types';
import {publicAccounts} from './twitter-public';
import jaCatalog from '../web/locales/ja.json';
import zhTwCatalog from '../web/locales/zh-TW.json';
import enCatalog from '../web/locales/en.json';
export const playerTwitter='kazuhiko';
export const twitterActivityLevels=['low','medium','high'] as const;
export type TwitterBioLanguage='ja'|'zh-Hant'|'en';
const twitterBioCatalogs:Record<TwitterBioLanguage,{bios:Record<string,string>;fallback:string}>={
 ja:{bios:jaCatalog.characterTwitterBios,fallback:jaCatalog.characterTwitterBioFallback},
 'zh-Hant':{bios:zhTwCatalog.characterTwitterBios,fallback:zhTwCatalog.characterTwitterBioFallback},
 en:{bios:enCatalog.characterTwitterBios,fallback:enCatalog.characterTwitterBioFallback},
};
export type TwitterPost={id:string;author:string;text:string;date:string;phase:number;created:number;advisoryTopic?:string;image?:string;imageStatus?:string;imageStatusLabel?:string;imagePending?:boolean;imageSession?:string;replyTo?:string;quoteTo?:string;likes:Record<string,boolean>;reposts:Record<string,boolean>};
export type TwitterJob={actor:string;date:string;phase:number;due:number;posts:string[];status:'scheduled'|'running'|'done'|'failed'|'interrupted';error?:string;replyTarget?:string;retryCount?:number;advisoryTopic?:string;trigger?:{requestVersion?:string;kind:string;source:string;postId?:string;text?:string}};
export type TwitterTyping={actor:string;postId:string};
export type TwitterUnfollowEvent={actor:string;target:string;date:string;phase:number;created:number;handled?:boolean};
export type TwitterFollowEvent={follower:string;target:string;date:string;phase:number;created:number;handled?:boolean};
export type TwitterState={requestVersions?:Record<string,Record<string,string>>;typing?:TwitterTyping[];accounts:Record<string,{private:boolean;handle:string;verified?:boolean;publicAccount?:boolean}>;following:Record<string,Record<string,boolean>>;requests:Record<string,Record<string,boolean>>;blocks?:Record<string,Record<string,boolean>>;posts:Record<string,TwitterPost>;slots:Record<string,boolean>;notices:Record<string,{text:string;created:number;postId?:string;accountId?:string}>;operations?:Record<string,string>;jobs?:Record<string,TwitterJob>;unfollows?:Record<string,TwitterUnfollowEvent>;follows?:Record<string,TwitterFollowEvent>;online?:string[];onlineCount?:number;onlineSlot?:string;networkVersion?:number;npcInteractionLimit?:number;npcInteractions?:Record<string,number>;threadSeen?:Record<string,Record<string,number>>;playerPrivate?:boolean};
const defaultFollowGroups=[['kazuhiko','kaju'],['kaju','asami'],['anna','sosuke'],['sosuke','karen'],['tamaki','koto','komari'],['mitsuki','chihaya'],['lemon','mitsuki'],['amanatsu','konuki'],['hibari','tiara']];
export function seedTwitterNetwork(t:TwitterState){
 if((t.networkVersion??0)>=1)return t;
 for(const group of defaultFollowGroups)for(const actor of group)for(const target of group)if(actor!==target&&t.following[actor]?.[target]===undefined)(t.following[actor]??={})[target]=true;
 t.networkVersion=1;return t;
}
export function twitterNpcInteractionLimit(t:TwitterState){return Number.isInteger(t.npcInteractionLimit)?Math.max(0,Math.min(20,t.npcInteractionLimit!)):3;}
export function socialSettings(ch:Character,language:TwitterBioLanguage='zh-Hant'){
 const levels:Record<string,number>={kazuhiko:0,kaju:0,anna:5,lemon:4,remon:4,chika:12,chihaya:8,karen:10,tiara:18,shikiya:15,komari:12,tamaki:8,koto:7,sosuke:6,mitsuki:6,amanatsu:20,konuki:22,asami:7,hibari:20,hiroto:14,riko:16,satoshi:12,koharu:10};
 const level=levels[ch.id]??10;
 const existingBio=ch.social?.twitterBio?.trim(),defaultBio=twitterBioCatalogs[language].bios[ch.id]??twitterBioCatalogs[language].fallback;
 const builtInBio=!!existingBio&&Object.values(twitterBioCatalogs).some(catalog=>catalog.bios[ch.id]===existingBio||catalog.fallback===existingBio);
 return {...(ch.social??{lineAffection:level,twitterHandle:ch.id.replace(/-/g,'_').slice(0,15),twitterPrivate:['chika','komari','kaju','tiara'].includes(ch.id),twitterAffection:ch.id==='kaju'?0:Math.min(100,level+5)}),twitterActivity:ch.social?.twitterActivity??'medium',twitterFollowBack:ch.social?.twitterFollowBack??false,twitterBio:!existingBio||builtInBio?defaultBio:existingBio,twitterCover:ch.social?.twitterCover??(twitterBioCatalogs[language].bios[ch.id]?`/assets/twitter-covers/${ch.id}.jpg`:'')};
}
export function twitterOnlineProbability(ch:Character){
 const base=0.25+(Array.from(ch.id).reduce((n,x)=>n+x.charCodeAt(0),0)%35)/100;
 return base*({low:0.4,medium:1,high:1.5}[socialSettings(ch).twitterActivity]);
}
export function twitterState(s:GameState,c:Content):TwitterState{
 const t=s.twitter??={accounts:{},following:{},requests:{},posts:{},slots:{},notices:{}};
 seedTwitterNetwork(t);t.npcInteractionLimit=twitterNpcInteractionLimit(t);
 // Stable fallback for old saves; new applications always receive a fresh UUID.
 for(const [target,requests] of Object.entries(t.requests))for(const [actor,pending] of Object.entries(requests))if(pending)((t.requestVersions??={})[target]??={})[actor]??=`legacy:${target}:${actor}`;
 t.accounts=Object.fromEntries([...c.characters.map(ch=>{const settings=socialSettings(ch);return [ch.id,{private:ch.id===playerTwitter?(t.playerPrivate??settings.twitterPrivate):settings.twitterPrivate,handle:settings.twitterHandle}];}),...publicAccounts(c).map(account=>[account.id,{private:false,handle:account.handle,verified:true,publicAccount:true}])]);
 return t;
}
export function twitterNotificationTokens(t:TwitterState,viewer=playerTwitter){
 const handle=t.accounts[viewer]?.handle??viewer,mention=new RegExp(`(^|[^A-Za-z0-9_])@${handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![A-Za-z0-9_])`,'i');
 const own=new Set(Object.values(t.posts).filter(post=>post.author===viewer).map(post=>post.id));
 const tokens=[...Object.entries(t.requests[viewer]??{}).filter(([,active])=>active).map(([id])=>`request:${id}`),...Object.keys(t.notices).filter(id=>id!=='scheduler').map(id=>`notice:${id}`)];
 for(const post of Object.values(t.posts)){
  if(twitterPostPending(post)||!canReadPost(t,viewer,post.id))continue;
  if(!post.replyTo&&post.author!==viewer&&t.following[viewer]?.[post.author])tokens.push(`friend:${post.id}`);
  if(post.author!==viewer&&mention.test(post.text))tokens.push(`mention:${post.id}`);
  if(post.replyTo&&own.has(post.replyTo))tokens.push(`reply:${post.id}`);
  if(post.quoteTo&&own.has(post.quoteTo))tokens.push(`quote:${post.id}`);
  if(post.author===viewer)for(const id of Object.keys(post.likes))if(post.likes[id])tokens.push(`like:${post.id}:${id}`);
  if(post.author===viewer)for(const id of Object.keys(post.reposts))if(post.reposts[id])tokens.push(`repost:${post.id}:${id}`);
 }
 return [...new Set(tokens)].sort();
}
export function twitterNotificationKey(t:TwitterState,viewer=playerTwitter){return twitterNotificationTokens(t,viewer).join('|');}
export function twitterAudibleNotificationTokens(t:TwitterState,viewer=playerTwitter){
 const handle=t.accounts[viewer]?.handle??viewer,mention=new RegExp(`(^|[^A-Za-z0-9_])@${handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![A-Za-z0-9_])`,'i');
 const own=new Set(Object.values(t.posts).filter(post=>post.author===viewer).map(post=>post.id));
 return Object.values(t.posts).filter(post=>post.author!==viewer&&!twitterPostPending(post)&&canReadPost(t,viewer,post.id)&&(mention.test(post.text)||!!post.replyTo&&own.has(post.replyTo)||!!post.quoteTo&&own.has(post.quoteTo))).map(post=>post.id).sort();
}
export function twitterHasUnread(t:TwitterState,readKey:string,viewer=playerTwitter){const seen=new Set(readKey.split('|'));return twitterNotificationTokens(t,viewer).some(token=>!seen.has(token));}
export function twitterBlocked(t:TwitterState,a:string,b:string){return !!t.blocks?.[a]?.[b]||!!t.blocks?.[b]?.[a];}
export function twitterMentions(t:TwitterState,text:string,accountId:string){const handle=t.accounts[accountId]?.handle;if(!handle)return false;return new RegExp(`(^|[^A-Za-z0-9_])@${handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![A-Za-z0-9_])`,'i').test(text);}
export function canReadTwitter(t:TwitterState,viewer:string,author:string){return viewer===author||!twitterBlocked(t,viewer,author)&&!!t.accounts[author]&&(!t.accounts[author].private||t.following[viewer]?.[author]===true);}
export function twitterPostPending(post:TwitterPost){return !post.image&&(post.imagePending===true||post.imageStatus==='準備配圖');}
export function canReadPost(t:TwitterState,viewer:string,id:string){
 const seen=new Set<string>(),chain:TwitterPost[]=[];let p:TwitterPost|undefined=t.posts[id];
 while(p){if(seen.has(p.id)||twitterBlocked(t,viewer,p.author)||!t.accounts[p.author]||twitterPostPending(p)&&viewer!==p.author)return false;seen.add(p.id);chain.push(p);if(!p.replyTo)break;const parent:TwitterPost|undefined=t.posts[p.replyTo];if(!parent)return false;p=parent;}
 const root=chain.at(-1);return !!root&&(canReadTwitter(t,viewer,root.author)||twitterMentions(t,chain[0].text,viewer));
}
export function twitterView(t:TwitterState,viewer=playerTwitter,date?:string,phase?:number,known?:ReadonlySet<string>):TwitterState{
 const visibleAuthor=(author:string)=>!!t.accounts[author]?.publicAccount||!known||author===viewer||known.has(author)&&!!t.following[viewer]?.[author];
 const visiblePost=(id:string)=>{if(!canReadPost(t,viewer,id))return false;const seen=new Set<string>();let post:TwitterPost|undefined=t.posts[id];while(post){if(seen.has(post.id))return false;seen.add(post.id);if(!post.replyTo)return visibleAuthor(post.author)||(!known||known.has(post.author)||!!t.accounts[post.author]?.publicAccount)&&Object.entries(post.reposts).some(([actor,active])=>active&&(actor===viewer||!!t.following[viewer]?.[actor]));if(known&&post.author!==viewer&&!known.has(post.author)&&!t.accounts[post.author]?.publicAccount)return false;post=t.posts[post.replyTo];}return false;};
 const stamp=date===undefined?'':`${date}:${phase}:`;
 const scheduledOnline=t.onlineSlot===stamp.slice(0,-1)?t.online??[]:Object.entries(t.jobs??{}).filter(([id,job])=>id===stamp+job.actor).map(([,job])=>job.actor);
 const online=stamp?[...new Set([...scheduledOnline,...Object.keys(t.accounts).filter(actor=>t.accounts[actor].publicAccount)])].filter(actor=>!known||known.has(actor)||actor===viewer||t.accounts[actor]?.publicAccount):undefined;
 const typing=Object.values(t.jobs??{}).filter(job=>job.status==='running'&&job.date===date&&job.phase===phase&&job.actor!==viewer&&(!known||known.has(job.actor)||t.accounts[job.actor]?.publicAccount)&&!!online?.includes(job.actor)&&!!job.replyTarget&&visiblePost(job.replyTarget)&&canReadPost(t,job.actor,job.replyTarget)).map(job=>({actor:job.actor,postId:job.replyTarget!}));
 return {...t,typing,requestVersions:undefined,operations:undefined,jobs:undefined,unfollows:undefined,follows:undefined,npcInteractions:undefined,threadSeen:undefined,onlineSlot:undefined,onlineCount:online?.length,online,requests:Object.fromEntries(Object.entries(t.requests).map(([id,requests])=>[id,id===viewer?requests:{[viewer]:!!requests[viewer]}])),posts:Object.fromEntries(Object.entries(t.posts).filter(([id])=>visiblePost(id)).map(([id,{imageSession,...post}])=>[id,post]))};
}
/** Social posts are delivered only through the access-checked Twitter endpoint. */
export function withoutTwitter<T>(value:T):T{
 if(value&&typeof value==='object'&&'state' in value){const v=value as T&{state?:GameState};if(v.state?.twitter){const {twitter,...state}=v.state;return {...v,state} as T;}}
 return value;
}
export function twitterPosts(t:TwitterState){return Object.values(t.posts).sort((a,b)=>b.created-a.created||b.id.localeCompare(a.id));}
export function twitterHashtags(text:string){return [...new Set([...text.matchAll(/(?:^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{1,50})/gu)].map(match=>match[1]))];}
export function twitterTrends(t:TwitterState,viewer=playerTwitter,limit=6){
 const totals=new Map<string,{tag:string;score:number;posts:number;authors:Set<string>;latest:number}>(),ordered=twitterPosts(t).filter(post=>!twitterPostPending(post)&&canReadPost(t,viewer,post.id));
 for(const [rank,post] of ordered.entries())for(const tag of twitterHashtags(post.text)){const key=tag.toLocaleLowerCase(),item=totals.get(key)??{tag,score:0,posts:0,authors:new Set<string>(),latest:0},engagement=Object.values(post.likes).filter(Boolean).length+Object.values(post.reposts).filter(Boolean).length*2;item.score+=(1+engagement)/(1+rank/20);item.posts++;item.authors.add(post.author);item.latest=Math.max(item.latest,post.created);totals.set(key,item);}
 return [...totals.values()].map(item=>({tag:item.tag,posts:item.posts,authors:item.authors.size,score:item.score+item.authors.size*.5,latest:item.latest})).sort((a,b)=>b.score-a.score||b.latest-a.latest||a.tag.localeCompare(b.tag)).slice(0,Math.max(0,limit));
}
