import type {Content,GameState,SocialMemoryEvent} from '../core/types';
import {canReadPost,socialSettings,twitterBlocked,twitterMentions,twitterState,twitterView,twitterPosts,twitterTrends,twitterOnlineProbability,twitterNpcInteractionLimit,twitterPostPending,type TwitterJob,type TwitterPost} from '../core/twitter';
import {characterAvailable,currentProfile} from '../core/timeline';
import {apiSettings,read,commit,json,owner,sameOrigin,content} from './repository';
import {modelFetch} from './model-runtime';
import {imageSettings,generateImage,parseImagePlan,parseObjectImagePlan,parseSceneImagePlan,objectImageTool,sceneImageTool,filterModelLoras,imageEndpoint,requestImage} from './stable-diffusion';
import {getCharacterOutfits} from './character-tags';
import {apiFetch} from './api-fetch';
import {assets,runtimeConfig} from './runtime';
import {configuredPrompt,prompt} from './prompt';
import {importantMemoryView} from './memory-view';
import {compactMemory,emptyMemory} from '../core/engine';
import {calendarPromptContext} from '../core/calendar';
import {publicAccount,publicAccounts,hasPublicModule} from '../core/twitter-public';
import {socialAppEnabled} from '../core/social-apps';
import {cityAccountId,newsAccountId,selectStorePromotionAccounts,selectCivicInformationAccounts,shouldPublishPoliceAdvisory,shouldPublishMunicipalOutreach} from '../core/public-twitter-activity';
import {choosePoliceAdvisoryTopic,inferPoliceAdvisoryTopic,policeAdvisoryUsedTopics} from '../core/police-advisory';
import {storePromotionStrategy,policeAdvisoryStrategy,municipalOutreachStrategy,regionalNewsCoverageStrategy,civicInformationStrategy,civicInformationActions} from './twitter-public-strategies';
import {knowledgeContext} from './knowledge';
import {searchContext} from './web-search';
import {conversationMemoryMessages,reliableMemorySummary,socialMemoryContext} from './memory-context';
import {requestLanguage} from './request-locale';

type Decision={action:'idle'|'post'|'reply'|'like'|'repost'|'quote'|'follow'|'accept'|'decline'|'unfollow'|'block'|'unblock'|'delete';target:string;text:string;image:boolean;affectionDelta?:number};
type PrivateLineDecision={action:'private_line';target:'kazuhiko';text:string;image:boolean;affectionDelta?:number};
type SocialDecision=Decision|PrivateLineDecision;
const kinds=['idle','post','reply','like','repost','quote','follow','accept','decline','unfollow','block','unblock','delete'];
const imageSession=crypto.randomUUID();
const twitterActionProperties={action:{type:'string',enum:kinds},target:{type:'string',get description(){return prompt('twitter.target');}},text:{type:'string',get description(){return prompt('twitter.text');}},affectionDelta:{type:'integer',minimum:-3,maximum:3,get description(){return prompt('twitter.affectionTool');}}};
const twitterThenItem={type:'object',properties:twitterActionProperties,required:['action','target','text'],additionalProperties:false};
export const twitterTool={type:'function',function:{name:'twitter_action',get description(){return prompt('twitter.tool');},parameters:{type:'object',properties:{...twitterActionProperties,then:{type:'array',minItems:1,maxItems:2,items:twitterThenItem,get description(){return prompt('twitter.thenTool');}}},required:['action','target','text'],additionalProperties:false}}};
export const twitterImagePostTool={type:'function',function:{name:'twitter_image_post',get description(){return prompt('twitter.imagePostTool');},parameters:{type:'object',properties:{text:{type:'string',get description(){return prompt('twitter.text');}}},required:['text'],additionalProperties:false}}};
export const twitterPrivateLineTool={type:'function',function:{name:'send_twitter_private_line',get description(){return prompt('twitter.privateLineTool');},parameters:{type:'object',properties:{text:{type:'string',get description(){return prompt('proactive.text');}},image:{type:'boolean',get description(){return prompt('proactive.image');}},affectionDelta:{type:'integer',minimum:-3,maximum:3,get description(){return prompt('twitter.privateLineAffectionTool');}}},required:['text','image'],additionalProperties:false}}};
export const twitterNewsBatchTool={type:'function',function:{name:'twitter_news_batch',get description(){return prompt('twitter.newsBatchTool');},parameters:{type:'object',properties:{articles:{type:'array',minItems:0,maxItems:3,items:{type:'object',properties:{headline:{type:'string',maxLength:72,get description(){return prompt('twitter.newsHeadline');}},body:{type:'string',maxLength:180,get description(){return prompt('twitter.newsBody');}},sourcePostIds:{type:'array',minItems:1,items:{type:'string'},get description(){return prompt('twitter.newsSources');}}},required:['headline','body','sourcePostIds'],additionalProperties:false}}},required:['articles'],additionalProperties:false}}};
export function parseTwitterDecision(raw:string):Decision{
 const x=JSON.parse(raw),affectionDelta=x?.affectionDelta??0;if(!x||!kinds.includes(x.action)||typeof x.target!=='string'||x.target.length>100||typeof x.text!=='string'||x.text.length>280||typeof x.image!=='boolean'||!Number.isInteger(affectionDelta)||affectionDelta < -3||affectionDelta > 3||(['post','reply','quote'].includes(x.action)&&!x.text.trim())||(x.image&&x.action!=='post'))throw Error('Twitter 工具參數不正確。回覆不能附圖或生圖。');return {action:x.action,target:x.target,text:x.text,image:x.image,...(Object.hasOwn(x,'affectionDelta')?{affectionDelta}: {})};
}
function parseTwitterToolCall(name:string,raw:string):SocialDecision[]{
 const x=JSON.parse(raw);
 if(name==='twitter_image_post')return [parseTwitterDecision(JSON.stringify({action:'post',target:'',text:x?.text,image:true}))];
 if(name==='send_twitter_private_line'){
  if(!x||typeof x.text!=='string'||!x.text.trim()||x.text.length>1500)throw Error('LLM 未提交有效的 LINE 私訊。');
  const affectionDelta=x.affectionDelta??0;if(!Number.isInteger(affectionDelta)||affectionDelta < -3||affectionDelta > 3)throw Error('Twitter 好感變化必須為 -3 至 3 的整數。');
  if(x.image!==undefined&&typeof x.image!=='boolean')throw Error(prompt('error.characterActions'));
  return [{action:'private_line',target:'kazuhiko',text:x.text.trim(),image:x.image===true,...(Object.hasOwn(x,'affectionDelta')?{affectionDelta}:{})}];
 }
 // Some OpenAI-compatible proxies may echo a legacy `image: false` even when
 // the advertised schema omits it. It cannot enable a capability, so accept it
 // during migration while still rejecting any attempt to turn images on.
 if(name!=='twitter_action'||!x||Object.hasOwn(x,'image')&&x.image!==false)throw Error('LLM 未提交有效 Twitter 工具。');
 const {then,...first}=x;
 if(then!==undefined&&(!Array.isArray(then)||then.length<1||then.length>2))throw Error(prompt('twitter.sequenceInvalid'));
 const actions=[first,...(then??[])].map(item=>parseTwitterDecision(JSON.stringify({...item,image:false})));
 if(actions.length>1&&actions.some(action=>action.action==='idle'))throw Error(prompt('twitter.sequenceIdle'));
 if(actions.filter(action=>['post','reply','quote'].includes(action.action)).length>1)throw Error(prompt('twitter.sequenceContentLimit'));
 if(new Set(actions.map(action=>`${action.action}:${action.target}`)).size!==actions.length)throw Error(prompt('twitter.sequenceDuplicate'));
 return actions;
}
function parseTwitterNewsBatch(raw:string,allowedSources:Set<string>):Decision[]{
 const x=JSON.parse(raw),articles=x?.articles;if(!Array.isArray(articles)||articles.length>3)throw Error(prompt('twitter.newsBatchInvalid'));
 const used=new Set<string>();return articles.map((article:unknown)=>{
  const item=article as {headline?:unknown;body?:unknown;sourcePostIds?:unknown},headline=typeof item?.headline==='string'?item.headline.trim():'',body=typeof item?.body==='string'?item.body.trim():'',sources=item?.sourcePostIds;
  if(!headline||headline.length>72||!body||body.length>180||!Array.isArray(sources)||!sources.length||sources.some(id=>typeof id!=='string'||!allowedSources.has(id)||used.has(id)))throw Error(prompt('twitter.newsSourceInvalid'));
  for(const id of sources)used.add(id as string);
  const text=`【${headline}】\n${body}\n#東愛知新聞`;if(text.length>280)throw Error(prompt('twitter.newsLengthInvalid'));
  return {action:'post',target:'',text,image:false};
 });
}
function twitterAccountName(c:Content,id:string){return c.characters.find(character=>character.id===id)?.name??publicAccount(c,id)?.name??(id==='kazuhiko'?'溫水和彥':id);}
function publicAccountFor(c:Content,id:string){return publicAccount(c,id);}
function rememberTwitter(s:GameState,c:Content,owner:string,eventType:SocialMemoryEvent['eventType'],actorId:string,content:string,details:Partial<Pick<SocialMemoryEvent,'postId'|'postAuthor'|'postAuthorName'|'targetId'|'targetName'|'quotedPostId'|'quotedPostAuthor'|'quotedPostAuthorName'>>={}){
 if(owner==='kazuhiko'||!c.characters.some(character=>character.id===owner))return;
 const social:SocialMemoryEvent={platform:'twitter',owner,ownerName:twitterAccountName(c,owner),actorId,actorName:twitterAccountName(c,actorId),eventType,...details};
 const memory=s.memories[owner]??=emptyMemory();memory.recent.push({role:actorId===owner?'assistant':'user',content,date:s.date,phase:s.phase,channel:'twitter',social});compactMemory(memory,c.settings.memoryChars,c.settings.recentTurns*2);
}
function twitterRoot(t:ReturnType<typeof twitterState>,post:TwitterPost){let root=post,guard=0;while(root.replyTo&&t.posts[root.replyTo]&&guard++<200)root=t.posts[root.replyTo];return root;}
function rememberPublishedPost(s:GameState,c:Content,post:TwitterPost){
 const t=twitterState(s,c),actor=post.author,parent=post.replyTo?t.posts[post.replyTo]:undefined,quoted=post.quoteTo?t.posts[post.quoteTo]:undefined;
 const actorName=c.characters.find(ch=>ch.id===actor)?.name??actor;
 const eventType=post.replyTo?'reply':post.quoteTo?'quote':'post';
 const ownDetails={postId:post.id,postAuthor:actor,postAuthorName:actorName,...(quoted?{quotedPostId:quoted.id,quotedPostAuthor:quoted.author,quotedPostAuthorName:twitterAccountName(c,quoted.author)}:{})};
 rememberTwitter(s,c,actor,eventType,actor,prompt(post.replyTo?'twitter.memory.ownReply':post.quoteTo?'twitter.memory.ownQuote':'twitter.memory.ownPost',{text:post.text}),ownDetails);
 if(parent){const root=twitterRoot(t,parent),context=prompt('twitter.memory.replyContext',{root:root.text,actor:actorName,reply:post.text}),details={postId:post.id,postAuthor:actor,postAuthorName:actorName,targetId:parent.author,targetName:twitterAccountName(c,parent.author)};if(canReadPost(t,parent.author,post.id))rememberTwitter(s,c,parent.author,'reply',actor,context,details);if(root.author!==parent.author&&canReadPost(t,root.author,post.id))rememberTwitter(s,c,root.author,'reply',actor,context,{...details,targetId:root.author,targetName:twitterAccountName(c,root.author)});}
 if(quoted&&canReadPost(t,quoted.author,post.id))rememberTwitter(s,c,quoted.author,'quote',actor,prompt('twitter.memory.quotedYou',{actor:actorName,original:quoted.text,text:post.text}),{postId:post.id,postAuthor:actor,postAuthorName:actorName,quotedPostId:quoted.id,quotedPostAuthor:quoted.author,quotedPostAuthorName:twitterAccountName(c,quoted.author)});
 for(const id of Object.keys(t.accounts))if(id!==actor&&canReadPost(t,id,post.id)&&twitterMentions(t,post.text,id,actor))rememberTwitter(s,c,id,'mention',actor,prompt('twitter.memory.mentionedYou',{actor:actorName,text:post.text}),{postId:post.id,postAuthor:actor,postAuthorName:actorName,targetId:id,targetName:twitterAccountName(c,id)});
}
export function applyTwitterDecision(s:GameState,c:Content,actor:string,d:Decision,now=Date.now()):TwitterPost|undefined{
 const t=twitterState(s,c);if(!t.accounts[actor])throw Error('找不到帳號。');
 if(t.accounts[actor]?.publicAccount&&['follow','accept','decline','unfollow'].includes(d.action))throw Error('官方帳號不會追蹤或回追其他帳號。');
 const target=t.accounts[d.target];const p=t.posts[d.target];
 const following=t.following[actor]??={};
 if(d.action==='idle')return;
 if(d.action==='delete'){if(!p||p.author!==actor)throw Error('只能刪除自己發布的 Twitter 貼文。');if(twitterPostPending(p))throw Error('圖片處理完成前不能刪除這則貼文。');delete t.posts[d.target];return;}
 if(['block','unblock'].includes(d.action)&&(!target||actor===d.target))throw Error('無效的封鎖對象。');
 if(d.action==='block'){
  ((t.blocks??={})[actor]??={})[d.target]=true;
  (t.following[actor]??={})[d.target]=false;(t.following[d.target]??={})[actor]=false;
  (t.requests[actor]??={})[d.target]=false;(t.requests[d.target]??={})[actor]=false;
  rememberTwitter(s,c,actor,'block',actor,prompt('twitter.memory.blockedByYou',{target:twitterAccountName(c,d.target)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});
  rememberTwitter(s,c,d.target,'block',actor,prompt('twitter.memory.blockedYou',{actor:twitterAccountName(c,actor)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});return;
 }
 if(d.action==='unblock'){if(!t.blocks?.[actor]?.[d.target])return;t.blocks[actor][d.target]=false;rememberTwitter(s,c,actor,'unblock',actor,prompt('twitter.memory.unblockedByYou',{target:twitterAccountName(c,d.target)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});return;}
 // Removing your own repost must remain possible after its author goes private.
 if(d.action==='repost'&&actor==='kazuhiko'&&p?.reposts[actor]){p.reposts[actor]=false;return;}
 if(['like','reply','repost','quote'].includes(d.action)&&(!p||twitterPostPending(p)||!canReadPost(t,actor,p.id)))throw Error('無法存取這則貼文。');
 if(['follow','accept','decline','unfollow'].includes(d.action)&&(!target||actor===d.target))throw Error('無效的追蹤對象。');
 if(['follow','accept','reply','like','repost','quote'].includes(d.action)&&twitterBlocked(t,actor,['reply','like','repost','quote'].includes(d.action)?p!.author:d.target))throw Error('封鎖中的帳號無法進行這項互動。');
 if(d.action==='post'||d.action==='reply'||d.action==='quote'){
  if(d.action==='reply'&&d.image)throw Error('Twitter 回覆不能附圖或生圖。');
  if(d.action==='quote'&&(t.accounts[p!.author].private||p!.replyTo&&!canReadPost({...t,following:{}},'public-viewer',p!.id)))throw Error('私人帳號或私人對話串的貼文不能轉發。');
  const blockedMention=Object.keys(t.accounts).find(id=>twitterMentions(t,d.text,id)&&twitterBlocked(t,actor,id));if(blockedMention)throw Error(prompt('error.twitterBlockedMention'));
  const post:TwitterPost={id:crypto.randomUUID(),author:actor,text:d.text.trim(),date:s.date,phase:s.phase,created:now,likes:{},reposts:{},...(d.image?{imagePending:true,imageStatus:'準備配圖',imageSession:imageSession+':'+s.runId}:{}),...(d.action==='reply'?{replyTo:d.target}:d.action==='quote'?{quoteTo:d.target}:{})};t.posts[post.id]=post;
  if(!d.image)rememberPublishedPost(s,c,post);
  return post;
 }
 if(d.action==='like'){if(actor!=='kazuhiko'&&(p.author===actor||p.likes[actor]))return;p.likes[actor]=actor==='kazuhiko'?!p.likes[actor]:true;if(p.likes[actor]){const details={postId:p.id,postAuthor:p.author,postAuthorName:twitterAccountName(c,p.author),targetId:p.author,targetName:twitterAccountName(c,p.author)};rememberTwitter(s,c,p.author,'like',actor,prompt('twitter.memory.likedYou',{actor:twitterAccountName(c,actor),text:p.text}),details);rememberTwitter(s,c,actor,'like',actor,prompt('twitter.memory.youLiked',{author:twitterAccountName(c,p.author),text:p.text}),details);}}
 if(d.action==='repost'){if(t.accounts[p.author].private||p.replyTo&&!canReadPost({...t,following:{}},'public-viewer',p.id))throw Error('私人帳號或私人對話串的貼文不能轉發。');if(actor!=='kazuhiko'&&(p.author===actor||p.reposts[actor]))return;p.reposts[actor]=actor==='kazuhiko'?!p.reposts[actor]:true;if(p.reposts[actor]){const details={postId:p.id,postAuthor:p.author,postAuthorName:twitterAccountName(c,p.author),targetId:p.author,targetName:twitterAccountName(c,p.author)};rememberTwitter(s,c,p.author,'repost',actor,prompt('twitter.memory.repostedYou',{actor:twitterAccountName(c,actor),text:p.text}),details);rememberTwitter(s,c,actor,'repost',actor,prompt('twitter.memory.youReposted',{author:twitterAccountName(c,p.author),text:p.text}),details);}}
 if(d.action==='follow'){
  if(following[d.target]||target.private&&t.requests[d.target]?.[actor])return;
  if(!following[d.target]&&!t.requests[d.target]?.[actor])rememberTwitter(s,c,actor,target.private?'follow_request':'follow',actor,prompt(target.private?'twitter.memory.youRequestedFollow':'twitter.memory.youFollowed',{target:twitterAccountName(c,d.target)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});
  if(target.private){if(!following[d.target]){(t.requests[d.target]??={})[actor]=true;((t.requestVersions??={})[d.target]??={})[actor]=crypto.randomUUID();rememberTwitter(s,c,d.target,'follow_request',actor,prompt('twitter.memory.requestedYou',{actor:twitterAccountName(c,actor)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});}}else if(!following[d.target]){
   following[d.target]=true;
   if(t.requests[d.target])(t.requests[d.target])[actor]=false;
   rememberTwitter(s,c,d.target,'follow',actor,prompt('twitter.memory.followedYou',{actor:twitterAccountName(c,actor)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});
   if(d.target!=='kazuhiko')(t.follows??={})[crypto.randomUUID()]={follower:actor,target:d.target,date:s.date,phase:s.phase,created:now};
   if(d.target==='kazuhiko'&&actor!=='kazuhiko')t.notices[crypto.randomUUID()]={text:prompt('twitter.notice.followedYou',{actor:c.characters.find(ch=>ch.id===actor)?.name??actor}),created:now,accountId:actor};
  }
 }
 if(d.action==='unfollow'){
  const wasFollowing=!!following[d.target];following[d.target]=false;(t.requests[d.target]??={})[actor]=false;
  if(wasFollowing)rememberTwitter(s,c,d.target,'unfollow',actor,prompt('twitter.memory.unfollowedYou',{actor:twitterAccountName(c,actor)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});
  if(actor==='kazuhiko'&&wasFollowing)(t.unfollows??={})[crypto.randomUUID()]={actor,target:d.target,date:s.date,phase:s.phase,created:now};
 }
 if(d.action==='accept'||d.action==='decline'){
  if(!t.requests[actor]?.[d.target])throw Error('追蹤請求已處理。');
  const ch=c.characters.find(ch=>ch.id===actor)!;
  if(d.action==='accept'&&d.target==='kazuhiko'&&(s.affection[actor]??0)<socialSettings(ch).twitterAffection)throw Error('尚未達到追蹤同意門檻。');
  t.requests[actor][d.target]=false;
  rememberTwitter(s,c,actor,d.action==='accept'?'follow_accept':'follow_decline',actor,prompt(d.action==='accept'?'twitter.memory.youAccepted':'twitter.memory.youDeclined',{target:twitterAccountName(c,d.target)}),{targetId:d.target,targetName:twitterAccountName(c,d.target)});
  if(d.action==='accept'&&!t.following[d.target]?.[actor]){(t.following[d.target]??={})[actor]=true;(t.follows??={})[crypto.randomUUID()]={follower:d.target,target:actor,date:s.date,phase:s.phase,created:now};}
  if(d.target==='kazuhiko')t.notices[crypto.randomUUID()]={text:prompt(d.action==='accept'?'twitter.notice.followAccepted':'twitter.notice.followDeclined',{actor:ch.name}),created:now,accountId:actor};
 }
}

export function publishCharacterTwitterPost(s:GameState,c:Content,actor:string,text:string,image?:{url?:string;caption?:string}){
 if(!socialAppEnabled(s,'twitter'))return;
 const clean=text.trim();if(!clean||clean.length>280||actor==='kazuhiko')return;
 const post=applyTwitterDecision(s,c,actor,{action:'post',target:'',text:clean,image:false});
 if(post&&image?.url)post.image=image.url;
 if(post)queueOnlineReactions(s,c,{action:'post',target:'',text:clean,image:false},post,actor);
 return post;
}

export function applyCharacterTwitterFollow(s:GameState,c:Content,actor:string,target:string,unfollow=false){
 if(!socialAppEnabled(s,'twitter'))throw Error(prompt('error.characterActions'));
 const before=twitterState(s,c),wasFollowing=!!before.following[actor]?.[target],wasPending=!!before.requests[target]?.[actor];
 const decision:Decision={action:unfollow?'unfollow':'follow',target,text:'',image:false};
 applyTwitterDecision(s,c,actor,decision);
 const after=twitterState(s,c);
 if(wasFollowing!==!!after.following[actor]?.[target]||wasPending!==!!after.requests[target]?.[actor])queueOnlineReactions(s,c,decision,undefined,actor);
}

// Every update reads fresh state and uses compare-and-swap, including after LLM/image work.
async function update(ownerId:string,runId:string|undefined,change:(s:GameState)=>void){
 for(let retry=0;retry<32;retry++){
  const old=await read<GameState|null>('game:'+ownerId,null);if(!old||old.runId!==runId)return;
  const next=structuredClone(old);change(next);next.revision=old.revision+1;next.sceneRevision=old.sceneRevision??old.revision;
  try{await commit(ownerId,next,old);return next;}catch(e){if(!(e instanceof Error)||e.message!=='進度已在另一個分頁更新，請重新整理。'||retry===31)throw e;await new Promise(resolve=>setTimeout(resolve,Math.min(8,retry+1)));}
 }
}
async function twitterUserContent(context:unknown,post?:TwitterPost){
 const contentParts:any[]=[{type:'text',text:JSON.stringify(context)}];
 // Images are never included while the model is choosing among posts. Once a
 // reply target is fixed, a separate request receives only that target image.
 if(post?.image){
  const match=/^\/api\/media\/([a-f0-9-]+\.(?:png|jpg|webp))$/.exec(post.image);if(!match)return contentParts[0].text;
  const asset=await assets().get(match[1]);if(!asset)return contentParts[0].text;
  const encoded=Buffer.from(asset.body).toString('base64');
  contentParts.push({type:'text',text:`Image attached to Twitter post ${post.id}:`},{type:'image_url',image_url:{url:`data:${asset.httpMetadata.contentType};base64,${encoded}`,detail:'low'}});
 }
 return contentParts.length===1?contentParts[0].text:contentParts;
}
function twitterConversation(posts:TwitterPost[],targetId:string){
 const byId=new Map(posts.map(post=>[post.id,post])),target=byId.get(targetId);if(!target)return [];
 let root=target,guard=0;while(root.replyTo&&byId.has(root.replyTo)&&guard++<200)root=byId.get(root.replyTo)!;
 const ids=new Set([root.id]);let changed=true;while(changed){changed=false;for(const post of posts)if(post.replyTo&&ids.has(post.replyTo)&&!ids.has(post.id)){ids.add(post.id);changed=true;}}
 return posts.filter(post=>ids.has(post.id)).sort((a,b)=>a.created-b.created);
}
function municipalShareCandidates(t:ReturnType<typeof twitterState>,posts:TwitterPost[],actor=cityAccountId){
 const alreadyQuoted=new Set(Object.values(t.posts).filter(post=>post.author===actor&&post.quoteTo).map(post=>post.quoteTo!));
 return posts.filter(post=>post.author!==actor&&t.accounts[post.author]?.publicAccount&&!post.replyTo&&!post.quoteTo&&!twitterPostPending(post)&&!alreadyQuoted.has(post.id)).sort((a,b)=>b.created-a.created);
}
const regionalNewsId=newsAccountId;
export function twitterNewsSourceWindow(date:string,phase:number){
 if(phase>0)return {date,phase:phase-1};
 const day=new Date(date+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-1);return {date:day.toISOString().slice(0,10),phase:2};
}
export function twitterNewsCandidates(t:ReturnType<typeof twitterState>,date:string,phase:number,actor=regionalNewsId){
 const source=twitterNewsSourceWindow(date,phase);
 return twitterPosts(t).filter(post=>post.date===source.date&&post.phase===source.phase&&post.author!==actor&&!post.replyTo&&!twitterPostPending(post)&&t.accounts[post.author]?.private===false&&canReadPost(t,actor,post.id));
}
function newsDigestJobId(s:Pick<GameState,'date'|'phase'>,actor:string){return `${s.date}:${s.phase}:${actor}`;}
function scheduleNewsDigest(s:GameState,c:Content,delay=9000){
 const t=twitterState(s,c);
 for(const account of publicAccounts(c).filter(account=>hasPublicModule(account,'reporting'))){
  const id=newsDigestJobId(s,account.id);if(t.jobs?.[id])continue;
  const candidates=twitterNewsCandidates(t,s.date,s.phase,account.id);
  (t.jobs??={})[id]={actor:account.id,date:s.date,phase:s.phase,due:Date.now()+delay,posts:candidates.map(post=>post.id),status:'scheduled',trigger:{kind:'news-digest',source:account.id}};
 }
}
function liveNpcTarget(s:GameState,actor:string,target:TwitterPost,date=s.date,phase=s.phase){
 const t=s.twitter!;
 return actor!=='kazuhiko'&&target.author!=='kazuhiko'&&target.author!==actor&&target.date===date&&target.phase===phase&&t.onlineSlot===`${date}:${phase}`&&!!t.online?.includes(actor)&&!!t.online?.includes(target.author)&&!t.jobs?.[`${date}:${phase}:${actor}`]?.posts.includes(target.id);
}
async function decide(s:GameState,c:Content,actor:string,request?:Decision,allowedPosts?:Set<string>,trigger?:{kind:string;source:string;postId?:string;text?:string},onReplySelected?:(target:string)=>Promise<void>,advisoryTopic?:string):Promise<SocialDecision[]>{
 const ai=await apiSettings();if(!ai.url||!ai.key||!ai.model)throw Error('Twitter 需要先設定 LLM。');
 const base=ai.url.replace(/\/+$/,'');const endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
 const t=twitterState(s,c),ch=c.characters.find(ch=>ch.id===actor),publicAccount=publicAccountFor(c,actor);
 if(!ch&&!publicAccount)throw Error('找不到帳號。');
 const newsDigest=hasPublicModule(publicAccount,'reporting')&&trigger?.kind==='news-digest';
 const imageAllowed=(await imageSettings()).enabled;
 const view=twitterView(t,actor);
 const autonomousMunicipal=hasPublicModule(publicAccount,'municipal')&&!trigger;
 const readable=twitterPosts(view).filter(p=>!twitterPostPending(p)&&(newsDigest?!!allowedPosts?.has(p.id):autonomousMunicipal||trigger||!allowedPosts||allowedPosts.has(p.id)));
 const conversationTarget=request&&['reply','quote'].includes(request.action)?request.target:trigger?.postId;
 const conversation=conversationTarget?twitterConversation(readable,conversationTarget):[];
 const posts=newsDigest?readable:conversation.length?conversation:readable.slice(0,35);
 const roll=Math.random();
 const discovery=trigger?.kind==='discovery';
 const policeAccount=hasPublicModule(publicAccount,'patrol');
 const policePatrol=policeAccount&&trigger?.kind==='patrol';
 const municipalAccount=hasPublicModule(publicAccount,'municipal');
 const privateLineAllowed=socialAppEnabled(s,'line')&&!!ch&&!request&&!discovery&&trigger?.source==='kazuhiko'&&['post','reply','quote'].includes(trigger.kind)&&s.contacts.includes(actor);
 const requestInput=request?{action:request.action,target:request.target,text:request.text}:undefined;
 const officialActions=policeAccount?policeAdvisoryStrategy(actor,trigger,publicAccount).actions:municipalAccount?municipalOutreachStrategy(actor,trigger,publicAccount).actions:publicAccount?hasPublicModule(publicAccount,'promotion')?storePromotionStrategy(actor,trigger,publicAccount).actions:civicInformationActions(trigger):[];
 const textTool=request&&!request.image?{...twitterTool,function:{...twitterTool.function,description:prompt('twitter.requestTool'),parameters:{...twitterTool.function.parameters,properties:Object.fromEntries(Object.entries(requestInput!).map(([key,value])=>[key,{type:typeof value,enum:[value]}]))}}}:publicAccount?{...twitterTool,function:{...twitterTool.function,parameters:{...twitterTool.function.parameters,properties:{...twitterActionProperties,action:{type:'string',enum:officialActions}}}}}:discovery?{...twitterTool,function:{...twitterTool.function,parameters:{...twitterTool.function.parameters,properties:{...twitterActionProperties,action:{type:'string',enum:['follow','accept','decline','unblock','idle']}}}}}:twitterTool;
 const imagePostTool=request?.image?{...twitterImagePostTool,function:{...twitterImagePostTool.function,description:prompt('twitter.requestTool'),parameters:{...twitterImagePostTool.function.parameters,properties:{text:{type:'string',enum:[request.text]}}}}}:twitterImagePostTool;
 const tools=newsDigest?[twitterNewsBatchTool]:request?.image?[imagePostTool]:imageAllowed&&!request&&!discovery&&(!publicAccount||!trigger)?[textTool,imagePostTool,...(privateLineAllowed?[twitterPrivateLineTool]:[])]:[textTool,...(privateLineAllowed?[twitterPrivateLineTool]:[])];
 const selectedTool=newsDigest?'twitter_news_batch':request?.image?'twitter_image_post':request||discovery?'twitter_action':'required';
 const actorName=ch?.name??publicAccount!.name,actorBio=ch?.bio??publicAccount!.bio,actorPrompt=ch?configuredPrompt(ch.prompt,{name:ch.name,bio:ch.bio}):publicAccount!.prompt;
 const referenceQuery=JSON.stringify({channel:'twitter',actor:{id:actor,name:actorName,profile:ch?currentProfile(ch,s,c):actorBio},date:s.date,phase:s.phase,calendar:calendarPromptContext(s.date),trigger,recentPosts:readable.slice(0,12).map(({image,...item})=>({...item,hasImage:!!image}))});
 const [knowledge,webKnowledge]=!request&&!discovery&&!newsDigest?await Promise.all([knowledgeContext(endpoint,ai,referenceQuery),searchContext(referenceQuery)]):['',''];
 const system=request?prompt('twitter.requestSystem'):newsDigest?[prompt('twitter.characterSystem',{name:actorName,characterPrompt:actorPrompt}),prompt('twitter.officialAccountSystem',{patrolException:''}),prompt('twitter.newsDigestSystem'),regionalNewsCoverageStrategy(actor,trigger,publicAccount)].join('\n\n'):[prompt('twitter.characterSystem',{name:actorName,characterPrompt:actorPrompt}),publicAccount?prompt('twitter.officialAccountSystem',{patrolException:policeAccount?prompt('twitter.policePatrolException'):''}):'',publicAccount?prompt('twitter.officialCadenceSystem'):'',storePromotionStrategy(actor,trigger,publicAccount).system,civicInformationStrategy(publicAccount,trigger),policeAdvisoryStrategy(actor,trigger,publicAccount).system,policeAccount&&!trigger&&advisoryTopic?prompt('twitter.policeAdvisorySlot',{topic:advisoryTopic}):'',municipalOutreachStrategy(actor,trigger,publicAccount).system,municipalAccount&&!trigger?prompt('twitter.municipalCurationSystem'):'',publicAccount&&trigger&&!policePatrol?prompt('twitter.officialEngagementSystem'):'',policePatrol?[prompt('twitter.policePatrolSystem'),publicAccount?.modules?.patrol?.prompt].filter(Boolean).join('\n\n'):'',knowledge,webKnowledge,prompt('twitter.blockSystem'),prompt('twitter.mentionSystem'),prompt('twitter.hashtagSystem'),prompt('twitter.repostSystem'),prompt('twitter.ecosystemSystem'),!publicAccount&&!discovery?prompt('twitter.sequenceSystem'):'',discovery?prompt('twitter.discoverySystem'):prompt('twitter.continuationSystem'),trigger&&!discovery&&!policePatrol?prompt('twitter.reactionSystem'):'',privateLineAllowed?prompt('twitter.privateLineTrigger'):'',trigger?.kind==='catchup'?prompt('twitter.catchupSystem'):''].filter(Boolean).join('\n\n');
 const memory=s.memories[actor]??emptyMemory();
 const characterAccounts=c.characters.filter(x=>characterAvailable(x,s,c)).map(x=>({id:x.id,name:x.name,bio:x.bio,profile:currentProfile(x,s,c),publicBio:socialSettings(x,requestLanguage()).twitterBio,...t.accounts[x.id]}));
 const officialAccounts=publicAccounts(c).map(x=>({id:x.id,name:x.name,bio:x.bio,profile:x.bio,publicBio:x.bio,...t.accounts[x.id]}));
 const accounts=[...characterAccounts,...officialAccounts];
 const candidates=accounts.filter(x=>x.id!==actor&&!twitterBlocked(t,actor,x.id)&&!t.following[actor]?.[x.id]&&!t.requests[x.id]?.[actor]).map(x=>({...x,followsYou:!!t.following[x.id]?.[actor],mutualAccounts:Object.keys(t.following[actor]??{}).filter(id=>t.following[actor][id]&&t.following[id]?.[x.id])}));
 const interacted=new Set(Object.values(t.posts).flatMap(post=>{const parent=post.replyTo?t.posts[post.replyTo]:undefined;return parent&&post.author===actor?[parent.author]:parent?.author===actor?[post.author]:[];}));
 const playerCandidate=candidates.find(candidate=>candidate.id==='kazuhiko');
 const officialCandidates=candidates.filter(candidate=>candidate.publicAccount);
 const newNpcs=candidates.filter(candidate=>candidate.id!=='kazuhiko'&&!candidate.publicAccount&&!candidate.followsYou&&!interacted.has(candidate.id));
 // Publishing/reactions may still follow anyone. The separate discovery turn
 // keeps relevant official accounts visible even after an earlier interaction.
 const followCandidates=discovery?[...(playerCandidate?[playerCandidate]:[]),...officialCandidates,...newNpcs]:candidates;
 const limit=twitterNpcInteractionLimit(t),liveTargets=posts.filter(post=>liveNpcTarget(s,actor,post));
 const budgetThreads=[...new Map(liveTargets.map(post=>{const root=twitterRoot(t,post),key=`${s.date}:${s.phase}:${root.id}`,used=t.npcInteractions?.[key]??0;return [root.id,{rootPostId:root.id,used,remaining:Math.max(0,limit-used),targetIds:liveTargets.filter(target=>twitterRoot(t,target).id===root.id).map(target=>target.id)}];})).values()];
 const interactionBudget={scope:'per_thread',limit,threads:budgetThreads,limitedTargetIds:budgetThreads.filter(item=>item.remaining===0).flatMap(item=>item.targetIds)};
 const contextPosts=posts.map(({image,...post})=>({...post,hasImage:!!image}));
 const municipalCandidates=municipalAccount&&!trigger?municipalShareCandidates(t,posts,actor).slice(0,12):[];
 const context=request?{request:requestInput,roll,calendar:calendarPromptContext(s.date)}:newsDigest?{date:s.date,phase:s.phase,sourceWindow:twitterNewsSourceWindow(s.date,s.phase),sourcePosts:contextPosts.map(post=>({...post,authorName:twitterAccountName(c,post.author),authorHandle:t.accounts[post.author]?.handle}))}:{roll,date:s.date,phase:s.phase,calendar:calendarPromptContext(s.date),profile:ch?currentProfile(ch,s,c):actorBio,accounts,online:t.online??[],trends:twitterTrends(view,actor),searchResults:contextPosts,municipalShareCandidates:municipalCandidates.map(post=>({postId:post.id,authorId:post.author,authorName:twitterAccountName(c,post.author),text:post.text,date:post.date,phase:post.phase})),followCandidates:publicAccount?[]:followCandidates,officialFollowCandidates:publicAccount?[]:officialCandidates,following:t.following[actor]??{},blockedByYou:t.blocks?.[actor]??{},blockedYou:Object.fromEntries(Object.keys(t.accounts).map(id=>[id,!!t.blocks?.[id]?.[actor]])),receivedFollowRequests:publicAccount?{}:t.requests[actor]??{},privateLineAvailable:privateLineAllowed,playerAffection:s.affection[actor]??0,acceptPlayerMinimum:ch?socialSettings(ch).twitterAffection:101,memory:{conversationRecent:conversationMemoryMessages(memory,s,actor),socialRecent:socialMemoryContext(memory,s,actor),summary:reliableMemorySummary(memory),facts:memory.facts,important:importantMemoryView(memory,trigger?.text??'')},trigger,posts:contextPosts,interactionBudget,...(policeAccount&&!trigger&&advisoryTopic?{advisoryTopic,todayAdvisories:Object.values(t.posts).filter(post=>post.author===actor&&post.date===s.date&&!post.replyTo).map(post=>({topic:post.advisoryTopic??inferPoliceAdvisoryTopic(post.text),text:post.text}))}:{})};
 const response=await modelFetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,max_tokens:newsDigest?1800:900,temperature:request?0:newsDigest?0.65:publicAccount&&trigger?0.55:0.9,parallel_tool_calls:false,tools,tool_choice:selectedTool==='required'?'required':{type:'function',function:{name:selectedTool}},messages:[{role:'system',content:system+(!request&&!discovery&&!newsDigest?'\n\n'+prompt('twitter.engagementSystem')+'\n\n'+prompt('twitter.threadBudgetSystem'):'')},{role:'user',content:JSON.stringify(context)}]})});
 if(!response.ok)throw Error(`Twitter LLM HTTP ${response.status}`);
 const result=await response.json();if(result.choices?.[0]?.finish_reason==='length')throw Error('Twitter LLM 回應被截斷。');const calls=result.choices?.[0]?.message?.tool_calls;
 if(calls?.length!==1||!tools.some(tool=>tool.function.name===calls[0].function?.name))throw Error('LLM 未提交有效 Twitter 工具。');
 let decisions=newsDigest?parseTwitterNewsBatch(calls[0].function.arguments,new Set(posts.map(post=>post.id))):parseTwitterToolCall(calls[0].function.name,calls[0].function.arguments);
 if(decisions[0].action==='private_line'){
  if(!privateLineAllowed)throw Error('此情境不能傳送 LINE 私訊。');
  return decisions;
 }
 for(const d of decisions){
  if(d.action==='private_line')throw Error(prompt('twitter.sequencePrivateLine'));
  if(publicAccount&&!newsDigest&&!request&&!officialActions.includes(d.action))throw Error(prompt('twitter.officialActionInvalid'));
  if(policeAccount&&!trigger&&d.action==='post'&&advisoryTopic){const inferred=inferPoliceAdvisoryTopic(d.text);if(inferred&&inferred!==advisoryTopic)Object.assign(d,{action:'idle',target:'',text:'',image:false});}
  if(publicAccount&&d.action==='reply'){
   const targetPost=posts.find(post=>post.id===d.target),root=targetPost&&twitterRoot(t,targetPost),handle=t.accounts[actor].handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const explicitlyMentioned=!!targetPost&&new RegExp(`(^|[^A-Za-z0-9_])@${handle}(?![A-Za-z0-9_])`,'i').test(targetPost.text);
   const patrolTarget=policePatrol&&targetPost?.id===trigger?.postId&&!!root&&!t.accounts[root.author]?.private;
   if(!targetPost||root?.author!==actor&&!explicitlyMentioned&&!patrolTarget)throw Error('官方帳號只能回覆明確提及它的貼文、自己貼文中的留言，或獲授權巡邏的公開討論串。');
  }
  if(policeAccount&&d.action==='block')throw Error('警察巡邏帳號只能直接回覆、勸導或警告，不能封鎖帳號。');
  if(d.action==='block'&&(!trigger||trigger.source!==d.target||discovery))throw Error('只能封鎖這次實際觸發互動的帳號。');
  if(d.action==='unblock'&&(!(discovery||publicAccount&&!trigger)||!t.blocks?.[actor]?.[d.target]))throw Error('只能在關係檢視時解除自己設下的封鎖。');
  if(municipalAccount&&d.action==='quote'&&!municipalCandidates.some(post=>post.id===d.target))throw Error(prompt('twitter.municipalQuoteInvalid'));
  if(discovery&&(!['follow','accept','decline','idle'].includes(d.action)||d.action==='follow'&&!followCandidates.some(candidate=>candidate.id===d.target)))throw Error('Invalid Twitter discovery action.');
  if(!request&&d.action==='decline'&&d.target==='kazuhiko'&&t.requests[actor]?.kazuhiko&&ch&&(s.affection[actor]??0)>=socialSettings(ch).twitterAffection)d.action='accept';
  if(d.image&&!imageAllowed)throw Error('Stable Diffusion 尚未啟用，不能建立配圖。');
  if(['like','reply','repost','quote'].includes(d.action)&&!posts.some(p=>p.id===d.target))throw Error('工具選擇了未讀取的貼文。');
 }
 if(request&&(decisions.length!==1||(['action','target','text','image'] as const).some(k=>(decisions[0] as Decision)[k]!==request[k])))throw Error('LLM 未確認指定操作，請重試。');
 const replyIndex=decisions.findIndex(d=>d.action==='reply'),d=decisions[replyIndex] as Decision|undefined;
 const target=d?posts.find(post=>post.id===d.target):undefined,initialAffection=d?.affectionDelta;
 if(target)await onReplySelected?.(target.id);
 if(target?.image){
  const fixed={action:{type:'string',enum:['reply']},target:{type:'string',enum:[target.id]},text:request?{type:'string',enum:[request.text]}:{type:'string'}};
  const replyTool={...twitterTool,function:{...twitterTool.function,description:prompt('twitter.replyImageTool'),parameters:{...twitterTool.function.parameters,properties:fixed}}};
 const replyContext={actor:{id:actor,name:actorName,profile:ch?currentProfile(ch,s,c):actorBio},calendar:calendarPromptContext(s.date),selectedPost:{...target,image:true},draftText:d!.text};
  const replyResponse=await modelFetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,max_tokens:900,temperature:request?0:0.7,parallel_tool_calls:false,tools:[replyTool],tool_choice:{type:'function',function:{name:'twitter_action'}},messages:[{role:'system',content:prompt('twitter.replyImageSystem')},{role:'user',content:await twitterUserContent(replyContext,target)}]})});
  if(!replyResponse.ok)throw Error(`Twitter 圖片回覆 LLM HTTP ${replyResponse.status}`);
  const replyData=await replyResponse.json(),replyCalls=replyData.choices?.[0]?.message?.tool_calls;
  if(replyData.choices?.[0]?.finish_reason==='length'||replyCalls?.length!==1||replyCalls[0]?.function?.name!=='twitter_action')throw Error('LLM 未完成圖片貼文的獨立回覆確認。');
  const revised=parseTwitterToolCall(replyCalls[0].function.name,replyCalls[0].function.arguments);
  if(revised.length!==1||revised[0].action==='private_line')throw Error('LLM 改變了已選定的 Twitter 回覆目標。');
  revised[0].affectionDelta=initialAffection;
  if(revised[0].action!=='reply'||revised[0].target!==target.id||revised[0].image||(request&&revised[0].text!==request.text))throw Error('LLM 改變了已選定的 Twitter 回覆目標。');
  decisions[replyIndex]=revised[0];
 }
 return decisions;
}

async function publishImage(ownerId:string,runId:string|undefined,c:Content,post:TwitterPost,image?:string,emitSocialEvent=true){
 const latest=await update(ownerId,runId,s=>{const p=s.twitter?.posts[post.id];if(!p||!twitterPostPending(p))return;
  if(image)p.image=image;p.imagePending=false;delete p.imageSession;p.imageStatus=image?'完成':'配圖失敗或中斷，文字貼文已保留';if(emitSocialEvent)p.created=Date.now();
  if(emitSocialEvent){rememberPublishedPost(s,c,p);queueOnlineReactions(s,c,{action:p.replyTo?'reply':'post',target:p.replyTo??'',text:p.text,image:!!image},p,p.author);}
 });
 if(latest)resumeTwitter(ownerId,latest,c);
}
async function attachImage(ownerId:string,runId:string|undefined,c:Content,post:TwitterPost,emitSocialEvent=true){
 try{
  const settings=await imageSettings();if(!settings.enabled){await publishImage(ownerId,runId,c,post,undefined,emitSocialEvent);return;}
  const snapshot=await read<GameState|null>('game:'+ownerId,null),thread:TwitterPost[]=[];let cursor:TwitterPost|undefined=post;const seen=new Set<string>();
  while(cursor&&!seen.has(cursor.id)&&thread.length<12){seen.add(cursor.id);thread.unshift(cursor);cursor=cursor.replyTo?snapshot?.twitter?.posts[cursor.replyTo]:undefined;}
  const characterName=c.characters.find(ch=>ch.id===post.author)?.name??'',outfits=getCharacterOutfits(characterName,settings.modelFamily);
  let loras:{name:string;path:string}[]=[];
  if(outfits.length){const catalog=await apiFetch(imageEndpoint(settings.url).replace(/txt2img$/,'loras'),{redirect:'error',headers:settings.key?{Authorization:'Bearer '+settings.key}:{}});if(!catalog.ok)throw Error('讀取 LoRA 失敗');loras=filterModelLoras(await catalog.json(),settings.modelFamily);}
  const ai=await apiSettings(),base=ai.url.replace(/\/+$/,'');
  const characterSchema={type:'function',function:{name:'twitter_image',description:prompt('twitter.imageTool'),parameters:{type:'object',properties:{prompt:{type:'string'},negative_prompt:{type:'string'},caption:{type:'string'},loras:{type:'array',items:{type:'object',properties:{name:{type:'string'},weight:{type:'number'}},required:['name','weight'],additionalProperties:false}}},required:['prompt','negative_prompt','caption','loras'],additionalProperties:false}}};
  const tools=[...(outfits.length?[characterSchema]:[]),objectImageTool,sceneImageTool];
  const r=await modelFetch(base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,max_tokens:1600,tools,tool_choice:'required',parallel_tool_calls:false,messages:[{role:'system',content:prompt('twitter.imageSystem')+'\n\n'+prompt('image.objectChoice')+'\n\n'+prompt('image.sceneChoice')},{role:'user',content:JSON.stringify({post,thread,calendar:calendarPromptContext(post.date),character:characterName,outfits,loras,model:settings.modelFamily})}]})});
  if(!r.ok)throw Error(`Twitter image LLM HTTP ${r.status}`);
  const j=await r.json(),calls=j.choices?.[0]?.message?.tool_calls,call=calls?.[0];if(calls?.length!==1||!tools.some(tool=>tool.function.name===call?.function?.name)||j.choices?.[0]?.finish_reason==='length')throw Error('沒有有效的圖片工具');const plan=call.function.name==='generate_object_image'?parseObjectImagePlan(call.function.arguments):call.function.name==='generate_scene_image'?parseSceneImagePlan(call.function.arguments):parseImagePlan(call.function.arguments);
  if(plan.loras.some(l=>!loras.some(x=>x.name===l.name)))throw Error('無效 LoRA');
  const url=await generateImage(plan,settings);
  await publishImage(ownerId,runId,c,post,url,emitSocialEvent);
 }catch{await publishImage(ownerId,runId,c,post,undefined,emitSocialEvent).catch(()=>{});}
}

const activeJobs=new Set<string>();
const recentTwitterView=new Map<string,number>();
const jobKey=(ownerId:string,runId:string|undefined,id:string)=>runtimeConfig().dataDir+':'+ownerId+':'+runId+':'+id;
const liveJobKey=(ownerId:string,runId:string|undefined,id:string)=>{try{return jobKey(ownerId,runId,id);}catch{return undefined;}};
const playerView=(s:GameState)=>twitterView(s.twitter!,'kazuhiko',s.date,s.phase,new Set([...s.met,'kaju','kazuhiko']));
export function appendCharacterLine(s:GameState,c:Content,actor:string,text:string,image?:{url?:string;caption?:string}){
 s.messages[actor]=[...(s.messages[actor]??[]),{id:crypto.randomUUID(),phase:s.phase,from:actor,text,date:s.date,...(image?.url?{image:image.url,imageCaption:image.caption}:{})}].slice(-100);
 const memory=s.memories[actor]??=emptyMemory();memory.recent.push({role:'assistant',content:text,date:s.date,phase:s.phase,channel:'line'});compactMemory(memory,c.settings.memoryChars,c.settings.recentTurns);
}
function applyTwitterAffection(s:GameState,c:Content,actor:string,trigger:TwitterJob['trigger']|undefined,delta:number|undefined){
 if(trigger?.source!=='kazuhiko'||actor==='kazuhiko'||!c.characters.some(character=>character.id===actor)||!Number.isInteger(delta)||!delta)return;
 s.affection[actor]=Math.max(0,Math.min(100,(s.affection[actor]??0)+delta!));
}
async function handleUnfollowLine(ownerId:string,runId:string|undefined,c:Content,actor:string){
 try{
  let event:{actor:string;target:string;date:string;phase:number;created:number}|undefined;
  const claimed=await update(ownerId,runId,s=>{event=undefined;const found=Object.values(s.twitter?.unfollows??{}).filter(x=>x.target===actor&&!x.handled).sort((a,b)=>a.created-b.created)[0];if(found){found.handled=true;event={...found};}});
  if(!claimed||claimed.ended||!socialAppEnabled(claimed,'line')||!event||!claimed.contacts.includes(actor)||claimed.twitter?.following.kazuhiko?.[actor])return;
  const ch=c.characters.find(x=>x.id===actor);if(!ch)return;
  const memory=claimed.memories[actor]??emptyMemory(),ai=await apiSettings();if(!ai.url||!ai.key||!ai.model)return;
  const base=ai.url.replace(/\/+$/,''),endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
  const schema={type:'function',function:{name:'send_unfollow_line',description:prompt('proactive.tool'),parameters:{type:'object',properties:{send:{type:'boolean'},text:{type:'string',description:prompt('proactive.text')},image:{type:'boolean',description:prompt('proactive.image')}},required:['send','text','image'],additionalProperties:false}}};
  const context={event,calendar:calendarPromptContext(claimed.date),profile:currentProfile(ch,claimed,c),affection:claimed.affection[actor]??0,memory:{summary:memory.summary,facts:memory.facts,important:importantMemoryView(memory,'解除追蹤 朋友 關係')}};
  const referenceQuery=JSON.stringify({channel:'line',mode:'twitter-unfollow',...context});
  const [knowledge,webKnowledge]=await Promise.all([knowledgeContext(endpoint,ai,referenceQuery),searchContext(referenceQuery)]);
  const response=await modelFetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,max_tokens:900,temperature:.7,tools:[schema],tool_choice:{type:'function',function:{name:'send_unfollow_line'}},parallel_tool_calls:false,messages:[{role:'system',content:[configuredPrompt(c.settings.systemPrompt),configuredPrompt(ch.prompt,{name:ch.name,bio:ch.bio}),knowledge,webKnowledge,prompt('twitter.unfollowTrigger')].filter(Boolean).join('\n\n')},{role:'user',content:JSON.stringify(context)}]})});
  const call=(await response.json()).choices?.[0]?.message?.tool_calls?.[0];if(call?.function?.name!=='send_unfollow_line')return;
  const decision=JSON.parse(call.function.arguments);if(decision.send!==true||typeof decision.text!=='string'||!decision.text.trim()||decision.text.length>1500||typeof decision.image!=='boolean')return;
  const text=decision.text.trim(),generated=decision.image?await requestImage(claimed,c,'line',text,actor,undefined,undefined,{allowCharacterlessLine:true,proactiveLine:true}):{};
  await update(ownerId,runId,s=>{if(s.ended||!socialAppEnabled(s,'line')||!s.contacts.includes(actor)||s.twitter?.following.kazuhiko?.[actor])return;appendCharacterLine(s,c,actor,text,generated);});
 }catch{/* Optional reaction must not break the Twitter job. */}
}
async function handleFollowBack(ownerId:string,runId:string|undefined,c:Content,actor:string){
 try{
  const current=await read<GameState|null>('game:'+ownerId,null);if(!current||current.ended||current.runId!==runId||!Object.values(current.twitter?.follows??{}).some(event=>event.target===actor&&!event.handled))return;
  await update(ownerId,runId,s=>{
   if(s.ended)return;
   const t=twitterState(s,c),events=Object.values(t.follows??{}).filter(event=>event.target===actor&&!event.handled).sort((a,b)=>a.created-b.created);
   for(const event of events)event.handled=true;
   const ch=c.characters.find(character=>character.id===actor);if(!ch||!socialSettings(ch).twitterFollowBack)return;
   for(const event of events){
    if(!t.accounts[event.follower]||twitterBlocked(t,actor,event.follower)||!t.following[event.follower]?.[actor]||t.following[actor]?.[event.follower]||t.requests[event.follower]?.[actor])continue;
    const follow:Decision={action:'follow',target:event.follower,text:'',image:false};
    applyTwitterDecision(s,c,actor,follow);queueOnlineReactions(s,c,follow,undefined,actor);
   }
  });
 }catch{/* Follow-back is optional and must not prevent normal Twitter activity. */}
}
export async function runTwitterJob(ownerId:string,runId:string|undefined,c:Content,id:string){
 c=await content();
 const pendingState=await read<GameState|null>('game:'+ownerId,null),pendingJob=pendingState&&pendingState.runId===runId?pendingState.twitter?.jobs?.[id]:undefined;
 if(!pendingState||!socialAppEnabled(pendingState,'twitter'))return;
 if(pendingJob?.status==='scheduled'&&!pendingState?.ended)await handleFollowBack(ownerId,runId,c,pendingJob.actor);
 let snapshot:GameState|undefined;
 await update(ownerId,runId,s=>{
  snapshot=undefined;
  const job=s.twitter?.jobs?.[id];if(!job||job.status!=='scheduled'||!socialAppEnabled(s,'twitter'))return;
  twitterState(s,c);
  if(job.trigger?.kind==='news-digest'){
   const source=twitterNewsSourceWindow(job.date,job.phase);
   const olderJobs=Object.values(s.twitter!.jobs??{}).some(other=>other!==job&&other.date===source.date&&other.phase===source.phase&&['scheduled','running'].includes(other.status));
   if(olderJobs&&(job.retryCount??0)<12){job.retryCount=(job.retryCount??0)+1;job.due=Date.now()+2000;return;}
   job.posts=twitterNewsCandidates(s.twitter!,job.date,job.phase).map(post=>post.id);
   if(!job.posts.length){job.status='done';return;}
  }
  if(job.trigger?.kind==='follow'&&job.trigger.requestVersion&&(!s.twitter!.requests[job.actor]?.[job.trigger.source]||s.twitter!.requestVersions?.[job.actor]?.[job.trigger.source]!==job.trigger.requestVersion)){job.status='done';return;}
  if(s.ended){job.status='done';return;}
  if(!job.trigger&&hasPublicModule(publicAccountFor(c,job.actor),'advisory')){
   job.advisoryTopic??=choosePoliceAdvisoryTopic(s.twitter!,job.date,job.actor,Math.random,id);
   if(!job.advisoryTopic){job.status='done';return;}
  }
  const event=job.trigger?.postId?s.twitter?.posts[job.trigger.postId]:undefined;
  if(job.trigger?.postId&&(!event||!canReadPost(s.twitter!,job.actor,event.id))){job.status='done';return;}
  if(event&&twitterPostPending(event)){job.due=Date.now()+1000;return;}
  // Another job for this actor must finish before building this context.
  if(Object.entries(s.twitter?.jobs??{}).some(([other,j])=>other!==id&&j.actor===job.actor&&j.status==='running')){job.due=Date.now()+1000;return;}
  job.status='running';snapshot=structuredClone(s);snapshot.date=job.date;snapshot.phase=job.phase;
 });
 if(!snapshot)return;
 const job=snapshot.twitter!.jobs![id];
 try{
  const decisions=await decide(snapshot,c,job.actor,undefined,new Set(job.posts),job.trigger,async target=>{
   await update(ownerId,runId,s=>{const active=s.twitter?.jobs?.[id];if(active?.status==='running')active.replyTarget=target;});
   if(Date.now()-(recentTwitterView.get(ownerId)??0)<1500)await new Promise(resolve=>setTimeout(resolve,700));
  },job.advisoryTopic);
  const privateLineImage=decisions[0].action==='private_line'&&decisions[0].image?await requestImage(snapshot,c,'line',decisions[0].text,job.actor,undefined,undefined,{allowCharacterlessLine:true,proactiveLine:true}):{};
  const created:{decision:Decision;post:TwitterPost}[]=[];
  await update(ownerId,runId,s=>{
   if(s.twitter?.jobs?.[id]?.status!=='running')return;
   if(!socialAppEnabled(s,'twitter')){s.twitter.jobs[id].status='done';return;}
   if(s.ended){s.twitter.jobs[id].status='done';return;}
   created.length=0;
   if(decisions[0].action==='private_line'){
    const decision=decisions[0];
    const event=job.trigger?.postId?s.twitter?.posts[job.trigger.postId]:undefined;
    if(s.contacts.includes(job.actor)&&job.trigger?.source==='kazuhiko'&&['post','reply','quote'].includes(job.trigger.kind)&&event&&canReadPost(s.twitter!,job.actor,event.id)){applyTwitterAffection(s,c,job.actor,job.trigger,decision.affectionDelta);appendCharacterLine(s,c,job.actor,decision.text,privateLineImage);}
    s.twitter!.jobs![id].status='done';return;
   }
   const planned=decisions as Decision[],time={...s,date:job.date,phase:job.phase},t=twitterState(s,c);
   const affectionDelta=Math.max(-3,Math.min(3,planned.reduce((sum,decision)=>sum+(decision.affectionDelta??0),0)));
   if(!job.trigger?.postId||t.posts[job.trigger.postId]&&canReadPost(t,job.actor,job.trigger.postId))applyTwitterAffection(s,c,job.actor,job.trigger,affectionDelta);
   for(const decision of planned){
    let appliedDecision=decision,target=t.posts[decision.target];
    if(job.advisoryTopic&&decision.action==='post'&&policeAdvisoryUsedTopics(t,job.date,job.actor).has(job.advisoryTopic))continue;
    // Bind approval/rejection to the exact application the model saw. A stale
    // relationship action is skipped without discarding independent later work.
    if(['accept','decline'].includes(decision.action)&&(!snapshot!.twitter!.requests[job.actor]?.[decision.target]||!t.requests[job.actor]?.[decision.target]||snapshot!.twitter!.requestVersions?.[job.actor]?.[decision.target]!==t.requestVersions?.[job.actor]?.[decision.target]))continue;
    // Compare every step with fresh state. Idempotent steps do not prevent the
    // remaining ordered actions (for example an existing follow before reply).
    const duplicate=decision.action==='reply'&&Object.values(t.posts).some(p=>p.author===job.actor&&p.replyTo===decision.target)
     ||decision.action==='quote'&&Object.values(t.posts).some(p=>p.author===job.actor&&p.quoteTo===decision.target&&p.text===decision.text.trim())
     ||decision.action==='like'&&(target?.author===job.actor||!!target?.likes[job.actor])
     ||decision.action==='repost'&&(target?.author===job.actor||!!target?.reposts[job.actor])
     ||decision.action==='follow'&&(!!t.following[job.actor]?.[decision.target]||!!t.requests[decision.target]?.[job.actor]);
    if(duplicate)continue;
    const liveNpcInteraction=!!target&&['reply','like','repost','quote'].includes(decision.action)&&liveNpcTarget(s,job.actor,target,job.date,job.phase);
    if(liveNpcInteraction){const rootId=twitterRoot(t,target!).id,key=`${job.date}:${job.phase}:${rootId}`,used=t.npcInteractions?.[key]??0;if(used>=twitterNpcInteractionLimit(t))appliedDecision={action:'idle',target:'',text:'',image:false};else (t.npcInteractions??={})[key]=used+1;}
    const post=applyTwitterDecision(time,c,job.actor,appliedDecision);if(post&&job.advisoryTopic&&appliedDecision.action==='post')post.advisoryTopic=job.advisoryTopic;
    if(post&&appliedDecision.image&&['post','reply'].includes(appliedDecision.action))post.imageStatus='準備配圖';
    if(post)created.push({decision:appliedDecision,post});
    if(appliedDecision.action!=='idle'&&s.date===job.date&&s.phase===job.phase)queueOnlineReactions(s,c,appliedDecision,post,job.actor);
   }
   if(job.trigger?.kind==='catchup'&&job.trigger.postId&&t.posts[job.trigger.postId]){
    const event=t.posts[job.trigger.postId],root=twitterRoot(t,event),seen=(t.threadSeen??={})[job.actor]??={};
    seen[root.id]=Math.max(seen[root.id]??0,event.created);
   }
   s.twitter!.jobs![id].status='done';
  });
  for(const item of created)if(item.decision.image&&['post','reply'].includes(item.decision.action))await attachImage(ownerId,runId,c,item.post);
  await handleFollowBack(ownerId,runId,c,job.actor);
  if(!job.trigger)await handleUnfollowLine(ownerId,runId,c,job.actor);
 }catch(e){await update(ownerId,runId,s=>{const j=s.twitter?.jobs?.[id];if(j){j.status='failed';j.error=e instanceof Error?e.message:'LLM 錯誤';}if(s.twitter?.notices)delete s.twitter.notices.scheduler;}).catch(()=>{});}
}
export function resumeTwitter(ownerId:string,s:GameState,c:Content){
 if(!socialAppEnabled(s,'twitter'))return;
 // A new process or loaded run cannot finish the old image request. Release
 // orphan uploads as explicitly failed text posts; never resubmit paid work.
 for(const post of Object.values(s.twitter?.posts??{}))if(twitterPostPending(post)&&post.imageSession!==imageSession+':'+s.runId)void publishImage(ownerId,s.runId,c,post).catch(()=>{});
 for(const [id,job] of Object.entries(s.twitter?.jobs??{})){
  if(!['scheduled','running'].includes(job.status))continue;
  const key=jobKey(ownerId,s.runId,id);if(activeJobs.has(key))continue;
  activeJobs.add(key);
  if(job.status==='running'){
   void update(ownerId,s.runId,state=>{const j=state.twitter?.jobs?.[id];if(j?.status==='running'){j.status='interrupted';j.error='服務重啟；未自動重送 LLM 請求。';}}).catch(()=>{}).finally(()=>activeJobs.delete(key));continue;
  }
  const timer=setTimeout(()=>{if(key!==liveJobKey(ownerId,s.runId,id)){activeJobs.delete(key);return;}void runTwitterJob(ownerId,s.runId,c,id).catch(()=>{}).finally(async()=>{activeJobs.delete(key);try{if(key!==liveJobKey(ownerId,s.runId,id))return;const latest=await read<GameState|null>('game:'+ownerId,null);if(latest&&latest.runId===s.runId)resumeTwitter(ownerId,latest,c);}catch{}});},Math.max(0,job.due-Date.now()));timer.unref?.();
 }
}
function queueOnlineReactions(s:GameState,c:Content,d:Decision,post:TwitterPost|undefined,source:string){
 if(!socialAppEnabled(s,'twitter'))return;
 if(s.ended||post&&twitterPostPending(post))return;
 const t=twitterState(s,c),stamp=`${s.date}:${s.phase}:`,targets=new Set<string>();
 // Undo is not a new social event. Do not notify or wake models on unlike/unrepost.
 if(d.action==='like'&&!t.posts[d.target]?.likes[source]||d.action==='repost'&&!t.posts[d.target]?.reposts[source])return;
 // A patrol warning is terminal for background automation. People can still
 // answer it manually, but NPCs must not auto-argue with police in a loop.
 if(d.action==='reply'&&hasPublicModule(publicAccount(c,source),'patrol'))return;
 if(['follow','unfollow','accept','decline'].includes(d.action))targets.add(d.target);
 if(['reply','like','repost','quote'].includes(d.action)){const target=t.posts[d.target];if(target)targets.add(target.author);}
 if(['post','repost','quote'].includes(d.action)){
  const organic=Object.keys(t.accounts).filter(actor=>t.following[actor]?.[source]&&t.jobs?.[stamp+actor]&&(t.onlineSlot!==`${s.date}:${s.phase}`||t.online?.includes(actor))).sort(()=>Math.random()-.5).slice(0,2);
  for(const actor of organic)targets.add(actor);
 }
 if(['post','reply','quote'].includes(d.action))for(const id of Object.keys(t.accounts)){
  if(twitterMentions(t,d.text,id,source))targets.add(id);
 }
 const patrolEvent=post??(['reply','quote'].includes(d.action)?t.posts[d.target]:undefined);
 const patrolRoot=patrolEvent&&twitterRoot(t,patrolEvent);
 if(['post','reply','quote'].includes(d.action)&&patrolRoot&&!t.accounts[patrolRoot.author]?.private)
  for(const account of publicAccounts(c))if(hasPublicModule(account,'patrol'))targets.add(account.id);
 targets.delete('kazuhiko');targets.delete(source);
 for(const actor of targets){
  const publicAccount=!!t.accounts[actor]?.publicAccount;
  if(publicAccount){
   const eventPost=post??(['reply','like','repost','quote'].includes(d.action)?t.posts[d.target]:undefined),root=eventPost&&twitterRoot(t,eventPost);
   const mentioned=!!eventPost&&twitterMentions(t,eventPost.text,actor,eventPost.author);
   const patrol=hasPublicModule(publicAccountFor(c,actor),'patrol')&&['post','reply','quote'].includes(d.action)&&!!root&&!t.accounts[root.author]?.private;
   if(!(mentioned||d.action==='reply'&&root?.author===actor||patrol))continue;
  }
  if(!publicAccount&&!t.jobs?.[stamp+actor])continue;
  if(!publicAccount&&t.onlineSlot===`${s.date}:${s.phase}`&&!t.online?.includes(actor))continue;
  const eventPost=post?.id??(['reply','like','repost','quote'].includes(d.action)?d.target:undefined);
  const directOfficial=publicAccount&&eventPost&&(()=>{const event=t.posts[eventPost],root=event&&twitterRoot(t,event),handle=t.accounts[actor].handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return !!event&&(root.author===actor||new RegExp(`(^|[^A-Za-z0-9_])@${handle}(?![A-Za-z0-9_])`,'i').test(event.text));})();
  const triggerKind=publicAccount&&hasPublicModule(publicAccountFor(c,actor),'patrol')&&!directOfficial?'patrol':d.action;
  const requestVersion=d.action==='follow'&&t.requests[d.target]?.[source]?t.requestVersions?.[d.target]?.[source]:undefined;
  if(eventPost&&!canReadPost(t,actor,eventPost))continue;
  if(Object.values(t.jobs??{}).some(j=>j.actor===actor&&j.date===s.date&&j.phase===s.phase&&j.trigger?.kind===triggerKind&&j.trigger?.source===source&&j.trigger?.postId===eventPost&&j.trigger?.requestVersion===requestVersion&&['scheduled','running'].includes(j.status)))continue;
  const id=`${stamp}reaction:${actor}:${crypto.randomUUID()}`;
  (t.jobs??={})[id]={actor,date:s.date,phase:s.phase,due:Date.now()+500+Math.floor(Math.random()*1500),posts:Object.keys(t.posts),status:'scheduled',trigger:{kind:triggerKind,source,postId:eventPost,text:d.text,requestVersion}};
 }
}
function catchUpThread(s:GameState,c:Content,actor:string){
 const t=twitterState(s,c),seen=(t.threadSeen??={})[actor]??={},handle=t.accounts[actor]?.handle??actor;
 (t.threadSeen??={})[actor]=seen;
 const mention=new RegExp(`(^|[^A-Za-z0-9_])@${handle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![A-Za-z0-9_])`,'i');
 const threads=new Map<string,TwitterPost[]>();
 for(const post of Object.values(t.posts))if(canReadPost(t,actor,post.id)){const root=twitterRoot(t,post);const list=threads.get(root.id)??[];list.push(post);threads.set(root.id,list);}
 // Old builds acknowledged catch-up threads before the LLM result existed.
 // Reopen failed/interrupted work so a later online slot can try it again.
 for(const job of Object.values(t.jobs??{}))if(['failed','interrupted'].includes(job.status)&&job.actor===actor&&job.trigger?.kind==='catchup'&&job.trigger.postId){
  const event=t.posts[job.trigger.postId];if(!event)continue;const root=twitterRoot(t,event),acknowledgedLater=Object.values(t.jobs??{}).some(other=>other.status==='done'&&other.actor===actor&&other.trigger?.kind==='catchup'&&!!other.trigger.postId&&twitterRoot(t,t.posts[other.trigger.postId]??event).id===root.id&&(t.posts[other.trigger.postId]?.created??0)>=event.created);
  if(!acknowledgedLater&&(seen[root.id]??0)>=event.created)seen[root.id]=Math.max(0,event.created-1);
 }
 const reservedThrough=new Map<string,number>();for(const job of Object.values(t.jobs??{}))if(['scheduled','running'].includes(job.status)&&job.actor===actor&&job.trigger?.kind==='catchup'&&job.trigger.postId&&t.posts[job.trigger.postId]){const event=t.posts[job.trigger.postId],rootId=twitterRoot(t,event).id;reservedThrough.set(rootId,Math.max(reservedThrough.get(rootId)??0,event.created));}
 const candidates=[...threads.entries()].map(([rootId,posts])=>{
  const latest=posts.reduce((a,b)=>a.created>b.created?a:b),unseenAfter=Math.max(seen[rootId]??0,reservedThrough.get(rootId)??0),unseen=posts.filter(post=>post.author!==actor&&post.created>unseenAfter);
  const directed=unseen.filter(post=>mention.test(post.text)||!!post.replyTo&&t.posts[post.replyTo]?.author===actor),focus=(directed.length?directed:unseen).reduce<TwitterPost|undefined>((latest,post)=>!latest||post.created>latest.created?post:latest,undefined);
  return {rootId,posts,latest,directed:directed.length>0,focus};
 }).filter(({rootId,posts,latest,focus})=>!!focus&&focus.created>(reservedThrough.get(rootId)??0)&&latest.author!==actor&&(posts.some(post=>post.author===actor)||posts.some(post=>post.author!==actor&&mention.test(post.text))||posts.some(post=>!!t.following[actor]?.[post.author]))).sort((a,b)=>Number(b.directed)-Number(a.directed)||b.focus!.created-a.focus!.created);
 const chosen=candidates[0];if(!chosen)return;
 // The newest relevant thread gets one explicit reaction opportunity. Older
 // ordinary timeline items sink instead of becoming a mechanical backlog.
 // Direct mentions and replies remain unread until they receive their own turn.
 for(const candidate of candidates)if(candidate!==chosen&&!candidate.directed)seen[candidate.rootId]=candidate.latest.created;
 return chosen.focus;
}
function scheduleCatchUp(s:GameState,c:Content,actor:string,delay:number){
 const t=twitterState(s,c),activity=catchUpThread(s,c,actor);if(!activity)return;
 const jobId=`${s.date}:${s.phase}:catchup:${actor}:${activity.id}`;
 const existing=t.jobs?.[jobId];
 if(!existing)(t.jobs??={})[jobId]={actor,date:s.date,phase:s.phase,due:Date.now()+delay,posts:Object.keys(t.posts),status:'scheduled',trigger:{kind:'catchup',source:activity.author,postId:activity.id,text:activity.text}};
 else if(['failed','interrupted'].includes(existing.status)&&(existing.retryCount??0)<1){existing.status='scheduled';existing.retryCount=(existing.retryCount??0)+1;existing.due=Date.now()+delay;existing.posts=Object.keys(t.posts);delete existing.error;delete existing.replyTarget;}
}
function hasRetryableCatchUp(t:ReturnType<typeof twitterState>){return Object.values(t.jobs??{}).some(job=>['failed','interrupted'].includes(job.status)&&(job.retryCount??0)<1&&job.trigger?.kind==='catchup'&&!!t.online?.includes(job.actor));}
function scheduleDiscovery(s:GameState){
 const t=s.twitter!,stamp=`${s.date}:${s.phase}`;
 for(const actor of t.online??[]){
  if(t.accounts[actor]?.publicAccount)continue;
  const id=`${stamp}:discovery:${actor}`;
  if(!t.jobs?.[id])(t.jobs??={})[id]={actor,date:s.date,phase:s.phase,due:Date.now()+2000,posts:Object.keys(t.posts),status:'scheduled',trigger:{kind:'discovery',source:actor}};
 }
}
function scheduleStorePromotions(c:Content,phase:number,important:boolean){
 return selectStorePromotionAccounts(phase,important,Math.random,publicAccounts(c)).map(id=>({id,delay:2500+Math.floor(Math.random()*12000)}));
}
function scheduleCivicInformation(c:Content,important:boolean){
 return selectCivicInformationAccounts(important,Math.random,publicAccounts(c)).map(id=>({id,delay:4000+Math.floor(Math.random()*15000)}));
}
function schedulePoliceAdvisory(c:Content,t:ReturnType<typeof twitterState>,date:string,important:boolean){
 return publicAccounts(c).filter(account=>hasPublicModule(account,'advisory')&&shouldPublishPoliceAdvisory(important)).flatMap(account=>{
  const advisoryTopic=choosePoliceAdvisoryTopic(t,date,account.id);
  return advisoryTopic?[{id:account.id,delay:5000+Math.floor(Math.random()*12000),advisoryTopic}]:[];
 });
}
function scheduleMunicipalOutreach(c:Content,t:ReturnType<typeof twitterState>,posts:TwitterPost[],important:boolean){
 return publicAccounts(c).filter(account=>hasPublicModule(account,'municipal')&&shouldPublishMunicipalOutreach(municipalShareCandidates(t,posts,account.id).length>0,important)).map(account=>({id:account.id,delay:18000+Math.floor(Math.random()*8000)}));
}
export function startTwitterSlot(ownerId:string,s:GameState,c:Content,old?:GameState){
 if(!socialAppEnabled(s,'twitter'))return (_ok:boolean)=>{};
 const t=twitterState(s,c),stamp=s.date+':'+s.phase;
 if(s.ended||old&&old.date===s.date&&old.phase===s.phase)return (_ok:boolean)=>{};
 if(t.slots[stamp]&&t.onlineSlot===stamp&&t.online?.length){t.online=[...new Set([...t.online,...publicAccounts(c).map(account=>account.id)])];scheduleNewsDigest(s,c,1500);for(const actor of t.online)scheduleCatchUp(s,c,actor,1000+Math.floor(Math.random()*1000));scheduleDiscovery(s);return (ok:boolean)=>{if(ok)resumeTwitter(ownerId,s,c);};}
 if(t.onlineSlot!==stamp&&t.npcInteractions)t.npcInteractions=Object.fromEntries(Object.entries(t.npcInteractions).filter(([key])=>key.startsWith(stamp+':')));
 t.slots[stamp]=true;
 const eligible=c.characters.filter(ch=>ch.id!=='kazuhiko'&&characterAvailable(ch,s,c));
 const posts=new Set(Object.keys(t.posts)); // New posts cannot cause same-slot reaction stampedes.
 // Recover the original online actors from durable jobs before sampling a
 // missing roster. Completed jobs must never be submitted again on repair.
 const existing=eligible.filter(ch=>!!t.jobs?.[stamp+':'+ch.id]);
 const selectedCharacters=existing.length?existing:eligible.filter(ch=>Math.random()<twitterOnlineProbability(ch));
 const visible=eligible.filter(ch=>ch.id==='kaju'||s.met.includes(ch.id));
 const fill=(pool:typeof eligible,target:number,count:()=>number)=>{for(const {ch} of pool.filter(ch=>!selectedCharacters.includes(ch)).map(ch=>({ch,score:Math.random()*twitterOnlineProbability(ch)})).sort((a,b)=>b.score-a.score)){if(count()>=target)break;selectedCharacters.push(ch);}};
 const visibleOnline=()=>selectedCharacters.filter(ch=>visible.includes(ch)).length;
 fill(visible,Math.min(4,visible.length),visibleOnline);
 fill(eligible,Math.min(6,eligible.length),()=>selectedCharacters.length);
 const selected:{id:string;delay:number;advisoryTopic?:string}[]=selectedCharacters.map(ch=>({id:ch.id,delay:5000+Math.floor(Math.random()*45000)}));
 const calendar=calendarPromptContext(s.date),important=!!(calendar.holiday||calendar.vacation||calendar.openingDay);
 const slotPosts=[...posts].map(id=>t.posts[id]).filter((post):post is TwitterPost=>!!post);
 selected.push(...scheduleStorePromotions(c,s.phase,important));
 selected.push(...scheduleCivicInformation(c,important));
 selected.push(...schedulePoliceAdvisory(c,t,s.date,important));
 selected.push(...scheduleMunicipalOutreach(c,t,slotPosts,important));
 t.onlineSlot=stamp;t.online=[...new Set([...selectedCharacters.map(ch=>ch.id),...publicAccounts(c).map(account=>account.id)])];
 for(const {id,delay,advisoryTopic} of selected){
  if(t.jobs?.[stamp+':'+id])continue;
  (t.jobs??={})[stamp+':'+id]={actor:id,date:s.date,phase:s.phase,due:Date.now()+delay,posts:[...posts],status:'scheduled',...(advisoryTopic?{advisoryTopic}:{})};
  scheduleCatchUp(s,c,id,delay+1000);
 }
 scheduleNewsDigest(s,c,9000+Math.floor(Math.random()*12000));
 for(const account of publicAccounts(c))scheduleCatchUp(s,c,account.id,1000+Math.floor(Math.random()*1000));
 scheduleDiscovery(s);
 return (ok:boolean)=>{if(ok)resumeTwitter(ownerId,s,c);};
}

const pending=new Set<string>();
export async function twitterApi(req:Request){
 try{
  const id=owner(req);if(!id)return json({error:'請先載入遊戲。'},401);
  const c=await content(),s=await read<GameState|null>('game:'+id,null);if(!s)return json({error:'找不到進度。'},404);
  if(!socialAppEnabled(s,'twitter'))return json({error:'Twitter 已停用。'},403);
  twitterState(s,c);
  if(req.method==='GET'){
   recentTwitterView.set(id,Date.now());
   const stamp=`${s.date}:${s.phase}`;
   if(!s.ended&&(s.twitter?.onlineSlot!==stamp||!s.twitter?.online?.length||publicAccounts(c).some(account=>!s.twitter?.online?.includes(account.id))||publicAccounts(c).filter(account=>hasPublicModule(account,'reporting')).some(account=>!s.twitter?.jobs?.[`${stamp}:${account.id}`])||s.twitter.online.some(actor=>!s.twitter?.accounts[actor]?.publicAccount&&!s.twitter?.jobs?.[`${stamp}:discovery:${actor}`])||hasRetryableCatchUp(s.twitter))){const repaired=await update(id,s.runId,state=>{startTwitterSlot(id,state,c);});if(repaired){resumeTwitter(id,repaired,c);return json({twitter:playerView(repaired),revision:repaired.revision,runId:repaired.runId});}}
   resumeTwitter(id,s,c);return json({twitter:playerView(s),revision:s.revision,runId:s.runId});
  }
  sameOrigin(req);if(s.ended)throw Error('遊戲已結束。');
  const raw=await req.text();if(raw.length>4000)throw Error('操作內容過長。');const input=JSON.parse(raw);
  if(input.runId!==s.runId)throw Error('已更換存檔，請重新開啟 Twitter。');
  if(req.method==='PATCH'){
   const hasLimit=input.npcInteractionLimit!==undefined,hasPrivacy=input.playerPrivate!==undefined;
   if(!hasLimit&&!hasPrivacy)throw Error('沒有可更新的 Twitter 設定。');
   if(hasLimit&&(!Number.isInteger(input.npcInteractionLimit)||input.npcInteractionLimit<0||input.npcInteractionLimit>20))throw Error('NPC 互動次數必須介於 0 到 20。');
   if(hasPrivacy&&typeof input.playerPrivate!=='boolean')throw Error('Twitter 私人帳號設定必須是布林值。');
   const next=await update(id,s.runId,state=>{if(state.ended)throw Error('遊戲已結束。');const t=twitterState(state,c);if(hasLimit)t.npcInteractionLimit=input.npcInteractionLimit;if(hasPrivacy){t.playerPrivate=input.playerPrivate;t.accounts.kazuhiko.private=input.playerPrivate;}});if(!next)throw Error('存檔已切換。');
   return json({twitter:playerView(next),revision:next.revision,runId:next.runId});
  }
  if(pending.has(id))throw Error('上一個 Twitter 操作仍在處理。');
  pending.add(id);
  try{
   if(typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(input.requestId))throw Error('缺少操作識別碼。');
   if(input.action==='retry-image'){
    if(typeof input.target!=='string'||!input.target)throw Error('缺少要重試配圖的貼文。');
    const intent=JSON.stringify({action:'retry-image',target:input.target}),previous=s.twitter!.operations?.[input.requestId];
    if(previous){if(previous!==intent)throw Error('同一操作識別碼不能用於不同操作。');return json({twitter:playerView(s),revision:s.revision,runId:s.runId});}
    const failed=s.twitter!.posts[input.target];
    if(!failed||failed.replyTo||failed.image||twitterPostPending(failed)||!canReadPost(s.twitter!,'kazuhiko',failed.id))throw Error('這則貼文目前無法重試配圖。');
    const settings=await imageSettings();if(!settings.enabled)throw Error('請先啟用 Stable Diffusion 配圖。');
    let post:TwitterPost|undefined;const latestContent=await content();
    const next=await update(id,s.runId,state=>{const t=twitterState(state,latestContent),candidate=t.posts[input.target];if(!candidate||candidate.replyTo||candidate.image||twitterPostPending(candidate)||!canReadPost(t,'kazuhiko',candidate.id))throw Error('這則貼文目前無法重試配圖。');candidate.imagePending=true;candidate.imageStatus='準備配圖';candidate.imageSession=imageSession+':'+state.runId;post={...candidate};(t.operations??={})[input.requestId]=intent;});
    if(!next||!post)throw Error('存檔已切換。');
    void attachImage(id,s.runId,latestContent,post,false);
    return json({twitter:playerView(next),revision:next.revision,runId:next.runId});
   }
   const d=parseTwitterDecision(JSON.stringify(input));
   const intent=JSON.stringify(d),previous=s.twitter!.operations?.[input.requestId];
   if(previous){if(previous!==intent)throw Error('同一操作識別碼不能用於不同操作。');return json({twitter:playerView(s),revision:s.revision,runId:s.runId});}
   const known=new Set([...s.met,'kaju','kazuhiko']);
   if(['follow','unfollow','block','unblock'].includes(d.action)&&!known.has(d.target)&&!s.twitter?.accounts[d.target]?.publicAccount)throw Error('尚未認識這個角色。');
   // Validate access and thresholds before paying for an LLM request.
   applyTwitterDecision(structuredClone(s),c,'kazuhiko',d);
   // Deterministic account controls and engagement toggles do not need an LLM
   // round-trip. Only authored text/image content is sent for tool validation.
   if(['post','reply','quote'].includes(d.action))await decide(s,c,'kazuhiko',d);
   const latestContent=await content();
   let post:TwitterPost|undefined;const next=await update(id,s.runId,state=>{if(state.ended)throw Error('遊戲已結束。');post=undefined;const t=twitterState(state,latestContent);if(t.operations?.[input.requestId])return;post=applyTwitterDecision(state,latestContent,'kazuhiko',d);(t.operations??={})[input.requestId]=intent;if(post&&d.image)post.imageStatus='準備配圖';queueOnlineReactions(state,latestContent,d,post,'kazuhiko');});
   if(!next)throw Error('存檔已切換。');
   if(post&&d.image&&['post','reply'].includes(d.action))void attachImage(id,s.runId,c,post);
   resumeTwitter(id,next,latestContent);
   if(d.action==='unfollow'&&next.twitter?.jobs?.[`${next.date}:${next.phase}:${d.target}`])void handleUnfollowLine(id,s.runId,latestContent,d.target);
   const notice=d.action==='follow'&&s.twitter!.accounts[d.target].private?'追蹤請求已送出，等待對方上線決定。':undefined;
   return json({twitter:playerView(next),revision:next.revision,runId:next.runId,...(notice?{notice}:{})});
  }finally{pending.delete(id);}
 }catch(e){return json({error:e instanceof Error?e.message:'Twitter 操作失敗。'},400);}
}
