// Explicit opt-in: makes four real model requests using environment settings.
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeRuntime} from '../server/runtime';
import {defaultContent} from '../core/content';
import {createGame} from '../core/engine';
import {write,read} from '../server/repository';
import {applyTwitterDecision,runTwitterJob} from '../server/twitter';
import type {GameState} from '../core/types';
if(!process.argv.includes('--live'))throw Error('Pass --live to use the configured model.');
if(!process.env.AI_API_URL||!process.env.AI_API_KEY||!process.env.AI_MODEL)throw Error('Missing AI environment settings.');
const dir=mkdtempSync(join(tmpdir(),'twitter-live-audit-'));
const close=initializeRuntime({dataDir:dir,port:0,env:{AI_API_URL:process.env.AI_API_URL,AI_API_KEY:process.env.AI_API_KEY,AI_MODEL:process.env.AI_MODEL}});
try{
 for(const kind of ['discovery','like-opportunity','repost-opportunity','reply-without-mention']){
  const s=createGame(defaultContent);s.runId=kind;s.met=[];
  s.twitter!.following.anna={};s.twitter!.online=['anna','lemon'];s.twitter!.onlineSlot=`${s.date}:${s.phase}`;
  let target:string|undefined;
  if(kind==='like-opportunity')target=applyTwitterDecision(s,defaultContent,'lemon',{action:'post',target:'',text:'今天的田徑比賽拿到了第一名！努力總算有成果，好開心！',image:false})!.id;
  if(kind==='repost-opportunity')target=applyTwitterDecision(s,defaultContent,'lemon',{action:'post',target:'',text:'明天中午校內甜點義賣，收益全數捐給圖書館。地點在文藝社教室，歡迎全校參加！請幫忙轉發讓更多同學知道。',image:false})!.id;
  if(kind==='reply-without-mention'){
   const root=applyTwitterDecision(s,defaultContent,'anna',{action:'post',target:'',text:'今天吃了草莓鬆餅！',image:false})!;
   target=applyTwitterDecision(s,defaultContent,'kazuhiko',{action:'reply',target:root.id,text:'妳比較推薦草莓還是巧克力口味？',image:false})!.id;
  }
  const before=new Set(Object.keys(s.twitter!.posts));
  s.twitter!.jobs={audit:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[...before],status:'scheduled',trigger:{kind:kind==='discovery'?'discovery':kind==='reply-without-mention'?'reply':'post',source:kind==='discovery'?'anna':kind==='reply-without-mention'?'kazuhiko':'lemon',postId:target}}};
  await write('game:audit',s);await runTwitterJob('audit',s.runId,defaultContent,'audit');
  const after=await read<GameState>('game:audit',s),t=after.twitter!;
  console.log(JSON.stringify({scenario:kind,status:t.jobs!.audit.status,followed:Object.keys(t.following.anna).filter(id=>t.following.anna[id]),requested:Object.keys(t.requests).filter(id=>t.requests[id].anna),liked:target?!!t.posts[target].likes.anna:false,reposted:target?!!t.posts[target].reposts.anna:false,newReplies:Object.values(t.posts).filter(p=>!before.has(p.id)).map(p=>({replyToTarget:p.replyTo===target,text:p.text}))}));
 }
}finally{close();rmSync(dir,{recursive:true,force:true});}
