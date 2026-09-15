import {test,expect,afterEach} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultContent} from '../core/content';
import {createGame,act} from '../core/engine';
import {socialSettings,twitterState,twitterView,canReadPost,withoutTwitter,twitterHashtags,twitterNotificationKey,twitterHasUnread,twitterOnlineProbability,twitterNotificationTokens,twitterTrends} from '../core/twitter';
import {applyTwitterDecision,parseTwitterDecision,twitterApi,runTwitterJob,startTwitterSlot,resumeTwitter,twitterNewsCandidates,twitterNewsSourceWindow} from '../server/twitter';
import {assets,initializeRuntime} from '../server/runtime';
import {write,read} from '../server/repository';
import type {GameState} from '../core/types';
import {mergeConcurrentState} from '../server/concurrent-state';
import {validateContent} from '../server/validation';
import {characterAvailable} from '../core/timeline';
import {twitterPublicAccounts} from '../core/twitter-public';
import {saveKnowledgeFiles} from '../server/knowledge';
import {saveSearchSettings} from '../server/web-search';
import {conversationMemoryMessages,socialMemoryContext} from '../server/memory-context';
import {prompt} from '../server/prompt';
const originalFetch=globalThis.fetch;const originalRandom=Math.random;
let close:(()=>void)|undefined,dir='';
afterEach(()=>{globalThis.fetch=originalFetch;Math.random=originalRandom;close?.();close=undefined;if(dir){rmSync(dir,{recursive:true,force:true});dir='';}});
function setup(){dir=mkdtempSync(join(tmpdir(),'makein-twitter-test-'));close=initializeRuntime({dataDir:dir,env:{},port:0});}
const decision=(action:string,target='',text='')=>parseTwitterDecision(JSON.stringify({action,target,text,image:false}));
const owner='a'.repeat(64);
function request(body:unknown,method='POST'){return new Request('http://localhost:9487/api/twitter',{method,headers:{cookie:'makeine_player='+owner,origin:'http://localhost:9487'},body:JSON.stringify(body)});}

test('scheduled Twitter timers stop quietly after their runtime closes',async()=>{
 setup();const s=createGame(defaultContent);s.twitter!.jobs={late:{actor:'anna',date:s.date,phase:s.phase,due:Date.now()+5,posts:[],status:'scheduled'}};await write('game:'+owner,s);
 resumeTwitter(owner,s,defaultContent);const shutdown=close!;close=undefined;shutdown();await Bun.sleep(20);
 expect(true).toBe(true);
});

for(const applicant of ['kazuhiko','mitsuki'])for(const action of ['accept','decline'])test(`stale LLM ${action} for ${applicant} cannot process a replacement follow application`,async()=>{
 setup();const c=structuredClone(defaultContent),anna=c.characters.find(ch=>ch.id==='anna')!;anna.social={...socialSettings(anna),twitterPrivate:true,twitterAffection:100};await write('content',c);await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'mock'});
 // Low affection preserves a genuine player decline; acceptance cases meet the threshold.
 const s=createGame(c);s.affection.anna=action==='accept'?100:0;applyTwitterDecision(s,c,applicant,decision('follow','anna'));const originalVersion=s.twitter!.requestVersions!.anna[applicant];
 s.twitter!.jobs={old:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};await write('game:'+owner,s);
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);
 globalThis.fetch=(async()=>{entered();await gate;return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision(action,applicant))}}]}}]});}) as unknown as typeof fetch;
 const running=runTwitterJob(owner,s.runId,c,'old');await started;
 try{
  const current=await read<GameState>('game:'+owner,s);applyTwitterDecision(current,c,applicant,decision('unfollow','anna'));applyTwitterDecision(current,c,applicant,decision('follow','anna'));expect(current.twitter!.requestVersions!.anna[applicant]).not.toBe(originalVersion);await write('game:'+owner,current);
 }finally{release();}
 await running;let saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.jobs!.old.status).toBe('done');expect(saved.twitter!.requests.anna[applicant]).toBe(true);expect(saved.twitter!.following[applicant]?.anna).not.toBe(true);
 expect(JSON.stringify(saved.memories.anna)).not.toContain('你在 Twitter 接受');expect(JSON.stringify(saved.memories.anna)).not.toContain('你在 Twitter 拒絕');
 saved.twitter!.jobs!.fresh={actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'};await write('game:'+owner,saved);await runTwitterJob(owner,s.runId,c,'fresh');saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.requests.anna[applicant]).toBe(false);expect(!!saved.twitter!.following[applicant]?.anna).toBe(action==='accept');
});

test('reapplying while an older follow reaction is queued creates a separate reaction',async()=>{
 setup();const c=structuredClone(defaultContent),anna=c.characters.find(ch=>ch.id==='anna')!;anna.social={...socialSettings(anna),twitterPrivate:true};await write('content',c);
 const s=createGame(c),stamp=`${s.date}:${s.phase}`;s.met.push('anna');s.twitter!.online=['anna'];s.twitter!.onlineSlot=stamp;s.twitter!.jobs={[stamp+':anna']:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};await write('game:'+owner,s);
 for(const action of ['follow','unfollow','follow']){const r=await twitterApi(request({...decision(action,'anna'),runId:s.runId,requestId:crypto.randomUUID()}));expect(r.status).toBe(200);}
 const saved=await read<GameState>('game:'+owner,s),jobs=Object.entries(saved.twitter!.jobs!).filter(([,j])=>j.trigger?.kind==='follow');expect(jobs).toHaveLength(2);expect(new Set(jobs.map(([,j])=>j.trigger!.requestVersion)).size).toBe(2);
 let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('obsolete job must not call LLM');}) as unknown as typeof fetch;await runTwitterJob(owner,s.runId,c,jobs[0][0]);expect(calls).toBe(0);
 expect(twitterView(saved.twitter!,'kazuhiko').requestVersions).toBeUndefined();
});

test('legacy request versions are stable and only a new application changes them',()=>{
 const s=createGame(defaultContent);s.twitter!.requests.anna={mitsuki:true};const first=twitterState(s,defaultContent).requestVersions!.anna.mitsuki;
 expect(twitterState(s,defaultContent).requestVersions!.anna.mitsuki).toBe(first);
 const c=structuredClone(defaultContent),anna=c.characters.find(ch=>ch.id==='anna')!;anna.social={...socialSettings(anna),twitterPrivate:true};applyTwitterDecision(s,c,'mitsuki',decision('follow','anna'));expect(s.twitter!.requestVersions!.anna.mitsuki).toBe(first);
 applyTwitterDecision(s,c,'mitsuki',decision('unfollow','anna'));applyTwitterDecision(s,c,'mitsuki',decision('follow','anna'));expect(s.twitter!.requestVersions!.anna.mitsuki).not.toBe(first);
});
test('new and legacy games start with Kaju LINE and mutually following Twitter; social defaults differ',()=>{
 const s=createGame(defaultContent);expect(s.contacts).toContain('kaju');expect(s.twitter?.following.kazuhiko.kaju).toBe(true);expect(s.twitter?.following.kaju.kazuhiko).toBe(true);
 delete s.twitter;const restored=twitterState(s,defaultContent);expect(restored.following.kazuhiko.kaju).toBe(true);
 const groups=[['kazuhiko','kaju'],['kaju','asami'],['anna','sosuke'],['sosuke','karen'],['tamaki','koto','komari'],['mitsuki','chihaya'],['lemon','mitsuki'],['amanatsu','konuki'],['hibari','tiara']];
 for(const group of groups)for(const actor of group)for(const target of group)if(actor!==target)expect(restored.following[actor]?.[target]).toBe(true);
 expect(restored.npcInteractionLimit).toBe(3);
 expect(new Set(defaultContent.characters.map(ch=>socialSettings(ch).lineAffection)).size).toBeGreaterThan(2);
});
test('per-character LINE gate is enforced by engine',()=>{
 const c=structuredClone(defaultContent),ch=c.characters.find(x=>x.id==='anna')!;ch.social={...socialSettings(ch),lineAffection:23};const s=createGame(c);s.dialogue={speaker:'',text:''};s.affection.anna=22;
 expect(()=>act(s,c,{type:'contact'})).toThrow('23');s.affection.anna=23;expect(act(s,c,{type:'contact'}).contacts).toContain('anna');
});
test('private player and NPC accounts receive reviewable follow requests',()=>{
 const s=createGame(defaultContent),t=s.twitter!;t.playerPrivate=true;twitterState(s,defaultContent).accounts.kazuhiko.private=true;
 applyTwitterDecision(s,defaultContent,'anna',decision('follow','kazuhiko'));expect(t.requests.kazuhiko.anna).toBe(true);expect(t.following.anna.kazuhiko).not.toBe(true);
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('accept','anna'));expect(t.requests.kazuhiko.anna).toBe(false);expect(t.following.anna.kazuhiko).toBe(true);
 applyTwitterDecision(s,defaultContent,'anna',decision('follow','komari'));expect(t.requests.komari.anna).toBe(true);expect(t.following.anna.komari).not.toBe(true);
 applyTwitterDecision(s,defaultContent,'komari',decision('accept','anna'));expect(t.requests.komari.anna).toBe(false);expect(t.following.anna.komari).toBe(true);
 applyTwitterDecision(s,defaultContent,'kaju',decision('follow','komari'));expect(t.requests.komari.kaju).toBe(true);applyTwitterDecision(s,defaultContent,'komari',decision('decline','kaju'));expect(t.following.kaju.komari).not.toBe(true);
});

test('hashtags are parsed and visible engagement produces ranked trends',()=>{
 const s=createGame(defaultContent),t=s.twitter!,older=applyTwitterDecision(s,defaultContent,'kaju',decision('post','','#美食記錄 今天的點心'),1)!,newer=applyTwitterDecision(s,defaultContent,'anna',decision('post','','#美食記錄 #豊橋散步'),2)!;
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('like',newer.id));
 expect(twitterHashtags('測試 #美食記錄 #豊橋散步 #美食記錄')).toEqual(['美食記錄','豊橋散步']);expect(twitterTrends(t)[0]).toMatchObject({tag:'美食記錄',posts:2,authors:2});expect(older.id).toBeTruthy();
});

test('private follow waits for owner acceptance and enforces player affection threshold',()=>{
 const c=structuredClone(defaultContent),ch=c.characters.find(x=>x.id==='anna')!;ch.social={...socialSettings(ch),twitterPrivate:true,twitterAffection:30};const s=createGame(c);
 applyTwitterDecision(s,c,'kazuhiko',decision('follow','anna'));expect(s.twitter?.requests.anna.kazuhiko).toBe(true);expect(s.twitter?.following.kazuhiko.anna).not.toBe(true);
 expect(()=>applyTwitterDecision(s,c,'anna',decision('accept','kazuhiko'))).toThrow('門檻');s.affection.anna=30;applyTwitterDecision(s,c,'anna',decision('accept','kazuhiko'));expect(s.twitter?.following.kazuhiko.anna).toBe(true);
 applyTwitterDecision(s,c,'kazuhiko',decision('unfollow','anna'));expect(s.twitter?.following.kazuhiko.anna).toBe(false);
});
test('Twitter block removes both follows and requests; unblock never restores them',()=>{
 const s=createGame(defaultContent),t=s.twitter!;
 applyTwitterDecision(s,defaultContent,'anna',decision('follow','kazuhiko'));
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('follow','anna'));
 (t.requests.anna??={}).kazuhiko=true;(t.requests.kazuhiko??={}).anna=true;
 applyTwitterDecision(s,defaultContent,'anna',decision('block','kazuhiko'));
 expect(t.blocks?.anna.kazuhiko).toBe(true);expect(t.following.anna.kazuhiko).toBe(false);expect(t.following.kazuhiko.anna).toBe(false);
 expect(t.requests.anna.kazuhiko).toBe(false);expect(t.requests.kazuhiko.anna).toBe(false);
 expect(()=>applyTwitterDecision(s,defaultContent,'kazuhiko',decision('follow','anna'))).toThrow('封鎖');
 applyTwitterDecision(s,defaultContent,'anna',decision('unblock','kazuhiko'));
 expect(t.blocks?.anna.kazuhiko).toBe(false);expect(t.following.anna.kazuhiko).toBe(false);expect(t.following.kazuhiko.anna).toBe(false);
});
test('a character Twitter reaction can change player affection without another LLM call',async()=>{
 setup();await write('content',defaultContent);await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'mock'});
 const s=createGame(defaultContent),root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','今天很開心'))!,reply=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',root.id,'替妳開心！'))!;
 s.twitter!.jobs={reaction:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:Object.keys(s.twitter!.posts),status:'scheduled',trigger:{kind:'reply',source:'kazuhiko',postId:reply.id,text:reply.text}}};await write('game:'+owner,s);
 let calls=0;globalThis.fetch=(async()=>{calls++;return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({...decision('idle'),affectionDelta:2})}}]}}]});}) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'reaction');const saved=await read<GameState>('game:'+owner,s);
 expect(calls).toBe(1);expect(saved.affection.anna).toBe((s.affection.anna??0)+2);
});
test('one character decision executes an ordered follow then reply plan',async()=>{
 setup();await write('content',defaultContent);await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'mock'});
 const s=createGame(defaultContent),root=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','要不要追蹤我？'))!;
 s.twitter!.jobs={reaction:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:Object.keys(s.twitter!.posts),status:'scheduled',trigger:{kind:'post',source:'kazuhiko',postId:root.id,text:root.text}}};await write('game:'+owner,s);
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body);expect(body.tools[0].function.name).toBe('twitter_action');expect(body.tools[0].function.parameters.properties.then.items.required).toEqual(['action','target','text']);expect(body.messages[0].content).toContain(prompt('twitter.sequenceSystem'));return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'follow',target:'kazuhiko',text:'',then:[{action:'reply',target:root.id,text:'好，我追蹤你了。'}]})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'reaction');const saved=await read<GameState>('game:'+owner,s),replies=Object.values(saved.twitter!.posts).filter(post=>post.author==='anna'&&post.replyTo===root.id);
 expect(saved.twitter!.following.anna.kazuhiko).toBe(true);expect(replies.map(post=>post.text)).toEqual(['好，我追蹤你了。']);expect(saved.twitter!.jobs!.reaction.status).toBe('done');
});
test('an invalid multi-action plan commits none of its earlier actions',async()=>{
 setup();await write('content',defaultContent);await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'mock'});
 const s=createGame(defaultContent),root=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','測試'))!;
 s.twitter!.jobs={reaction:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:Object.keys(s.twitter!.posts),status:'scheduled',trigger:{kind:'post',source:'kazuhiko',postId:root.id,text:root.text}}};await write('game:'+owner,s);
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'follow',target:'kazuhiko',text:'',then:[{action:'reply',target:root.id,text:'第一則'},{action:'quote',target:root.id,text:'第二則'}]})}}]}}]})) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'reaction');const saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.following.anna.kazuhiko).not.toBe(true);expect(Object.values(saved.twitter!.posts).some(post=>post.author==='anna')).toBe(false);expect(saved.twitter!.jobs!.reaction.status).toBe('failed');
});
test('private thread bodies cannot leak through public replies or API game snapshots',()=>{
 const s=createGame(defaultContent);const root=applyTwitterDecision(s,defaultContent,'kaju',decision('post','','private'))!;
 const reply=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',root.id,'private reply'))!;
 expect(canReadPost(s.twitter!,'anna',root.id)).toBe(false);expect(canReadPost(s.twitter!,'anna',reply.id)).toBe(false);
 expect(twitterView(s.twitter!,'anna').posts[reply.id]).toBeUndefined();expect(()=>applyTwitterDecision(s,defaultContent,'anna',decision('like',reply.id))).toThrow();
 expect(()=>applyTwitterDecision(s,defaultContent,'kazuhiko',decision('repost',root.id))).toThrow();expect(()=>applyTwitterDecision(s,defaultContent,'kazuhiko',decision('repost',reply.id))).toThrow();
 expect(withoutTwitter({state:s}).state.twitter).toBeUndefined();
});
test('NPC-to-NPC follows and interactions are independent and cannot impersonate another actor',()=>{
 const s=createGame(defaultContent);applyTwitterDecision(s,defaultContent,'anna',decision('follow','kaju'));applyTwitterDecision(s,defaultContent,'kaju',decision('accept','anna'));
 const p=applyTwitterDecision(s,defaultContent,'kaju',decision('post','','今日のおやつ'))!;applyTwitterDecision(s,defaultContent,'anna',decision('like',p.id));applyTwitterDecision(s,defaultContent,'anna',decision('like',p.id));
 expect(p.likes).toEqual({anna:true});expect(s.twitter?.following.anna.kaju).toBe(true);expect(s.twitter?.following.komari?.kaju).not.toBe(true);
 expect(()=>parseTwitterDecision('{"action":"delete_everything"}')).toThrow();
 expect(()=>parseTwitterDecision(JSON.stringify({action:'reply',target:p.id,text:'附圖回覆',image:true}))).toThrow();
});
test('Twitter interactions are merged into character memory for later LINE and scene chat',()=>{
 const s=createGame(defaultContent),root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','今天做了鬆餅。'))!;
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',root.id,'看起來很好吃！'));
 expect(s.memories.anna.recent.some(entry=>entry.channel==='twitter'&&entry.content.includes('看起來很好吃'))).toBe(true);
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('like',root.id));
  expect(s.memories.anna.recent.some(entry=>entry.channel==='twitter'&&entry.social?.eventType==='like'&&entry.social.actorId==='kazuhiko')).toBe(true);
});

test('Twitter memory preserves every account identity across posts, replies, likes and quotes',()=>{
 const s=createGame(defaultContent);
 const root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','arbitrary root content'))!;
 applyTwitterDecision(s,defaultContent,'kaju',decision('like',root.id));
 const reply=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',root.id,'arbitrary reply content'))!;
 const quote=applyTwitterDecision(s,defaultContent,'sosuke',decision('quote',root.id,'arbitrary quote content'))!;
 const events=socialMemoryContext(s.memories.anna,s,'anna');
 expect(events.find(event=>event.postId===root.id&&event.eventType==='post')).toMatchObject({owner:'anna',actorId:'anna',actorName:'八奈見杏菜',postAuthor:'anna'});
 expect(events.find(event=>event.postId===root.id&&event.eventType==='like')).toMatchObject({owner:'anna',actorId:'kaju',actorName:'温水佳樹',postAuthor:'anna'});
 expect(events.find(event=>event.postId===reply.id&&event.eventType==='reply')).toMatchObject({owner:'anna',actorId:'kazuhiko',postAuthor:'kazuhiko',targetId:'anna'});
 expect(events.find(event=>event.postId===quote.id&&event.eventType==='quote')).toMatchObject({owner:'anna',actorId:'sosuke',quotedPostId:root.id,quotedPostAuthor:'anna',quotedPostAuthorName:'八奈見杏菜'});
 expect(conversationMemoryMessages(s.memories.anna,s,'anna').some(message=>message.content.includes('arbitrary'))).toBe(false);
});

test('a private root mention reaches only the explicitly mentioned account',()=>{
 const s=createGame(defaultContent);applyTwitterDecision(s,defaultContent,'kaju',decision('post','','@anna 私人家庭訊息'));
 expect(JSON.stringify(s.memories.anna??{})).toContain('私人家庭訊息');
 expect(JSON.stringify(s.memories.lemon??{})).not.toContain('私人家庭訊息');
});

test('repeating private follow requests does not duplicate memory; public follow clears an old request',()=>{
 const c=structuredClone(defaultContent),s=createGame(c);applyTwitterDecision(s,c,'anna',decision('follow','kaju'));
 const memory=JSON.stringify(s.memories);applyTwitterDecision(s,c,'anna',decision('follow','kaju'));expect(JSON.stringify(s.memories)).toBe(memory);
 const kaju=c.characters.find(ch=>ch.id==='kaju')!;kaju.social={...socialSettings(kaju),twitterPrivate:false};applyTwitterDecision(s,c,'anna',decision('follow','kaju'));
 expect(s.twitter!.following.anna.kaju).toBe(true);expect(s.twitter!.requests.kaju.anna).toBe(false);
});

test('repost distributes to online followers and undo does not queue new NPC work',async()=>{
 setup();const s=createGame(defaultContent),t=s.twitter!,stamp=`${s.date}:${s.phase}`;
 s.met.push('lemon');applyTwitterDecision(s,defaultContent,'anna',decision('follow','kazuhiko'));
 const post=applyTwitterDecision(s,defaultContent,'lemon',decision('post','','公開情報'))!;
 t.online=['anna','lemon'];t.onlineSlot=stamp;t.jobs=Object.fromEntries(t.online.map(actor=>[stamp+':'+actor,{actor,date:s.date,phase:s.phase,due:0,posts:[post.id],status:'done' as const}]));await write('game:'+owner,s);
 globalThis.fetch=(async()=>{throw Error('No LLM needed');}) as unknown as typeof fetch;
 const perform=async(action:string)=>{const response=await twitterApi(request({...decision(action,post.id),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);return read<GameState>('game:'+owner,s);};
 let saved=await perform('repost');expect(Object.values(saved.twitter!.jobs!).filter(job=>job.trigger?.kind==='repost').map(job=>job.actor).sort()).toEqual(['anna','lemon']);
 const count=Object.keys(saved.twitter!.jobs!).length;saved=await perform('repost');expect(Object.keys(saved.twitter!.jobs!)).toHaveLength(count);expect(saved.twitter!.posts[post.id].reposts.kazuhiko).toBe(false);
 saved=await perform('like');const likedCount=Object.keys(saved.twitter!.jobs!).length;saved=await perform('like');expect(Object.keys(saved.twitter!.jobs!)).toHaveLength(likedCount);
});

test('a player may undo a repost after its author switches to private',()=>{
 const c=structuredClone(defaultContent),s=createGame(c),p=applyTwitterDecision(s,c,'anna',decision('post','','公開時的文章'))!;
 applyTwitterDecision(s,c,'kazuhiko',decision('repost',p.id));const anna=c.characters.find(ch=>ch.id==='anna')!;anna.social={...socialSettings(anna),twitterPrivate:true};
 applyTwitterDecision(s,c,'kazuhiko',decision('repost',p.id));expect(p.reposts.kazuhiko).toBe(false);
});
test('quote posts keep their own text and embed a public original without becoming a reply',()=>{
 const s=createGame(defaultContent),original=applyTwitterDecision(s,defaultContent,'anna',decision('post','','新出的甜點看起來很好吃。'))!;
 const quote=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('quote',original.id,'下次經過時想去看看。'))!;
 expect(quote).toMatchObject({author:'kazuhiko',text:'下次經過時想去看看。',quoteTo:original.id});expect(quote.replyTo).toBeUndefined();expect(original.reposts.kazuhiko).toBeUndefined();
 expect(()=>applyTwitterDecision(s,defaultContent,'kazuhiko',decision('quote',original.id,''))).toThrow();
 const c=structuredClone(defaultContent),privateState=createGame(c),kaju=c.characters.find(ch=>ch.id==='kaju')!,privatePost=applyTwitterDecision(privateState,c,'kaju',decision('post','','只給追蹤者看的內容'))!;
 expect(socialSettings(kaju).twitterPrivate).toBe(true);expect(()=>applyTwitterDecision(privateState,c,'kazuhiko',decision('quote',privatePost.id,'引用'))).toThrow('不能轉發');
});

test('finished games do not run pending social jobs or follow-back',async()=>{
 setup();const s=createGame(defaultContent);s.ended=true;s.twitter!.jobs={job:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};await write('game:'+owner,s);
 let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('No LLM');}) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'job');expect(calls).toBe(0);expect((await read<GameState>('game:'+owner,s)).twitter!.jobs!.job.status).toBe('done');
});

test('a player reply schedules the directly addressed author without making every participant pile on',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'mock'});
 const s=createGame(defaultContent),t=s.twitter!,actors=['anna','lemon','mitsuki'],stamp=`${s.date}:${s.phase}`;s.met.push(...actors);
 const root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','大家推薦哪種鬆餅？'))!,budgetKey=`${stamp}:${root.id}`;
 for(const actor of actors.slice(1))applyTwitterDecision(s,defaultContent,actor,decision('reply',root.id,'我也想討論'));
 t.online=actors;t.onlineSlot=stamp;t.npcInteractionLimit=3;t.jobs=Object.fromEntries(actors.map(actor=>[stamp+':'+actor,{actor,date:s.date,phase:s.phase,due:0,posts:Object.keys(t.posts),status:'done' as const}]));
 await write('game:'+owner,s);let calls=0;
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body)),ctx=JSON.parse(body.messages[1].content);
  const d=ctx.request??decision('reply',ctx.trigger.postId,'這是新的想法 '+(++calls));return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(d)}}]}}]});
 }) as typeof fetch;
 const postPlayer=async(text:string)=>{const r=await twitterApi(request({...decision('reply',root.id,text),runId:s.runId,requestId:crypto.randomUUID()}));expect(r.status).toBe(200);const latest=await read<GameState>('game:'+owner,s);return Object.values(latest.twitter!.posts).find(p=>p.author==='kazuhiko'&&p.text===text)!;};
 const drain=async()=>{for(let i=0;i<45;i++){const latest=await read<GameState>('game:'+owner,s),job=Object.entries(latest.twitter!.jobs!).find(([,job])=>job.status==='scheduled');if(!job)return;await runTwitterJob(owner,s.runId,defaultContent,job[0]);}throw Error('Reaction chain failed to settle');};
 const first=await postPlayer('我想聽大家的推薦');await drain();let saved=await read<GameState>('game:'+owner,s);
 expect(Object.values(saved.twitter!.posts).filter(p=>p.replyTo===first.id&&p.author!=='official-toyohashi-police').map(p=>p.author)).toEqual(['anna']);expect(saved.twitter!.npcInteractions?.[budgetKey]??0).toBe(0);
 const second=await postPlayer('那巧克力口味呢？');await drain();saved=await read<GameState>('game:'+owner,s);
 expect(Object.values(saved.twitter!.posts).filter(p=>p.replyTo===second.id&&p.author!=='official-toyohashi-police').map(p=>p.author)).toEqual(['anna']);expect(saved.twitter!.npcInteractions?.[budgetKey]??0).toBe(0);
});

test('private-account replies under a public root reach the root author',()=>{
 const s=createGame(defaultContent),p=applyTwitterDecision(s,defaultContent,'anna',decision('post','','大家在做什麼'))!;
 applyTwitterDecision(s,defaultContent,'kaju',decision('reply',p.id,'私人回覆內容'));
 expect(JSON.stringify(s.memories.anna)).toContain('私人回覆內容');
});

test('followed reposts reveal known public authors but not unmet or private authors',()=>{
 const s=createGame(defaultContent),t=s.twitter!,p=applyTwitterDecision(s,defaultContent,'lemon',decision('post','','訓練日常'))!;
 applyTwitterDecision(s,defaultContent,'anna',decision('repost',p.id));applyTwitterDecision(s,defaultContent,'kazuhiko',decision('follow','anna'));
 const known=new Set(['kazuhiko','anna','lemon']);expect(twitterView(t,'kazuhiko',s.date,s.phase,known).posts[p.id]).toBeDefined();
 known.delete('lemon');expect(twitterView(t,'kazuhiko',s.date,s.phase,known).posts[p.id]).toBeUndefined();known.add('lemon');t.accounts.lemon.private=true;
 expect(twitterView(t,'kazuhiko',s.date,s.phase,known).posts[p.id]).toBeUndefined();
});

test('removed notifications and pending uploads never become new unread activity',()=>{
 const s=createGame(defaultContent),t=s.twitter!;applyTwitterDecision(s,defaultContent,'kazuhiko',decision('follow','anna'));
 const p=applyTwitterDecision(s,defaultContent,'anna',decision('post','','已讀貼文'))!,readKey=twitterNotificationKey(t);expect(twitterHasUnread(t,readKey)).toBe(false);
 delete t.posts[p.id];expect(twitterHasUnread(t,readKey)).toBe(false);
 applyTwitterDecision(s,defaultContent,'anna',{...decision('post','','@kazuhiko 尚未配圖'),image:true});expect(twitterHasUnread(t,readKey)).toBe(false);
 applyTwitterDecision(s,defaultContent,'anna',decision('post','','新文章'));expect(twitterHasUnread(t,readKey)).toBe(true);
});

test('a player can approve an unknown NPC request without meeting or using the LLM',async()=>{
 setup();const s=createGame(defaultContent);s.twitter!.playerPrivate=true;twitterState(s,defaultContent);s.met=s.met.filter(id=>id!=='mitsuki');
 applyTwitterDecision(s,defaultContent,'mitsuki',decision('follow','kazuhiko'));await write('game:'+owner,s);
 globalThis.fetch=(async()=>{throw Error('LLM must not be called');}) as unknown as typeof fetch;
 const response=await twitterApi(request({...decision('accept','mitsuki'),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);
 expect((await read<GameState>('game:'+owner,s)).twitter!.following.mitsuki.kazuhiko).toBe(true);
});

test('deleted reaction targets are skipped without exposing old text to the model',async()=>{
 setup();const s=createGame(defaultContent);s.twitter!.jobs={gone:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled',trigger:{kind:'reply',source:'kazuhiko',postId:'deleted',text:'deleted secret'}}};await write('game:'+owner,s);
 globalThis.fetch=(async()=>{throw Error('LLM must not be called');}) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'gone');expect((await read<GameState>('game:'+owner,s)).twitter!.jobs!.gone.status).toBe('done');
});

test('typing view appears only after a running job has actually selected a reply',()=>{
 const s=createGame(defaultContent),t=s.twitter!,p=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','公開討論'))!;
 t.onlineSlot=`${s.date}:${s.phase}`;t.online=['anna'];t.jobs={
  post:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[p.id],status:'running'},
  like:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[p.id],status:'running',trigger:{kind:'like',source:'kazuhiko',postId:p.id}},
  repost:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[p.id],status:'running',trigger:{kind:'repost',source:'kazuhiko',postId:p.id}},
  reply:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[p.id],status:'running',trigger:{kind:'post',source:'kazuhiko',postId:p.id}},
 };
 const view=()=>twitterView(t,'kazuhiko',s.date,s.phase,new Set(['kazuhiko','anna']));
 expect(view().typing).toEqual([]);t.jobs.reply.replyTarget=p.id;expect(view().typing).toEqual([{actor:'anna',postId:p.id}]);expect(view().jobs).toBeUndefined();
 t.jobs.reply.status='done';expect(view().typing).toEqual([]);t.jobs.reply.status='running';t.jobs.reply.phase=s.phase+1;expect(view().typing).toEqual([]);
 t.jobs.reply.phase=s.phase;t.playerPrivate=true;twitterState(s,defaultContent);expect(view().typing).toEqual([]);
});

test('orphan pending images recover without resubmitting image generation',async()=>{
 setup();const s=createGame(defaultContent),post=applyTwitterDecision(s,defaultContent,'kazuhiko',{...decision('post','','中斷的配圖'),image:true})!;post.imageSession='old-process';s.ended=true;await write('game:'+owner,s);
 globalThis.fetch=(async()=>{throw Error('Must not regenerate');}) as unknown as typeof fetch;
 await twitterApi(new Request('http://localhost:9487/api/twitter',{headers:{cookie:'makeine_player='+owner}}));
 let saved=s;for(let i=0;i<40;i++){saved=await read<GameState>('game:'+owner,s);if(!saved.twitter!.posts[post.id].imagePending)break;await new Promise(resolve=>setTimeout(resolve,5));}
 expect(saved.twitter!.posts[post.id].imagePending).toBe(false);expect(saved.twitter!.posts[post.id].imageStatus).toContain('中斷');expect(saved.twitter!.posts[post.id].image).toBeUndefined();
});
test('Twitter posts can only be deleted by their author and orphaned replies are hidden',()=>{
 const s=createGame(defaultContent),root=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','等等刪掉這則'))!;
 const reply=applyTwitterDecision(s,defaultContent,'anna',decision('reply',root.id,'我有看到'))!;
 const pending=applyTwitterDecision(s,defaultContent,'kazuhiko',{...decision('post','','圖片處理中'),image:true})!;
 expect(()=>applyTwitterDecision(s,defaultContent,'kazuhiko',decision('delete',pending.id))).toThrow('圖片處理完成前');
 pending.imagePending=false;pending.imageStatus='完成';applyTwitterDecision(s,defaultContent,'kazuhiko',decision('delete',pending.id));expect(s.twitter!.posts[pending.id]).toBeUndefined();
 expect(()=>applyTwitterDecision(s,defaultContent,'anna',decision('delete',root.id))).toThrow('自己');
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('delete',root.id));
 expect(s.twitter!.posts[root.id]).toBeUndefined();expect(s.twitter!.posts[reply.id]).toBeDefined();expect(canReadPost(s.twitter!,'kazuhiko',reply.id)).toBe(false);
 expect(twitterView(s.twitter!,'kazuhiko').posts[reply.id]).toBeUndefined();
});
test('slot scheduling samples independently, staggers jobs, and excludes newly emitted posts',()=>{
 const s=createGame(defaultContent);Math.random=()=>0.1;startTwitterSlot(owner,s,defaultContent);const jobs=Object.values(s.twitter!.jobs!),eligible=defaultContent.characters.filter(ch=>ch.id!=='kazuhiko'&&characterAvailable(ch,s,defaultContent)),characterJobs=jobs.filter(job=>!job.actor.startsWith('official-'));expect(characterJobs.length).toBe(eligible.length*2);expect(jobs.length).toBeGreaterThan(characterJobs.length);expect(jobs.every(j=>j.due>Date.now()&&j.posts.length===0)).toBe(true);
 expect(twitterView(s.twitter!,'kazuhiko',s.date,s.phase).online).toEqual(expect.arrayContaining(eligible.map(character=>character.id)));
 const count=jobs.length;startTwitterSlot(owner,s,defaultContent);expect(Object.keys(s.twitter!.jobs!).length).toBe(count);
 const next=createGame(defaultContent);Math.random=()=>0.99;startTwitterSlot(owner,next,defaultContent);const roster=next.twitter?.online??[],fallback=roster.filter(id=>!id.startsWith('official-')),known=fallback.filter(id=>id==='kaju'||next.met.includes(id));expect(fallback).toHaveLength(Math.min(6,eligible.length));expect(roster).toEqual(expect.arrayContaining(twitterPublicAccounts.map(account=>account.id)));expect(known).toHaveLength(Math.min(4,defaultContent.characters.filter(ch=>ch.id!=='kazuhiko'&&characterAvailable(ch,next,defaultContent)&&(ch.id==='kaju'||next.met.includes(ch.id))).length));
});
test('opening Twitter repairs a legacy current slot and exposes a persistent online contact',async()=>{
 setup();Math.random=()=>0.99;const s=createGame(defaultContent);s.runId='online-repair';const stamp=`${s.date}:${s.phase}`;s.twitter!.slots[stamp]=true;delete s.twitter!.online;delete s.twitter!.onlineSlot;await write('game:'+owner,s);
 const response=await twitterApi(new Request('http://localhost:9487/api/twitter',{headers:{cookie:'makeine_player='+owner}})),body=await response.json();
 expect(response.status).toBe(200);expect(body.twitter.online.some((id:string)=>id==='kaju'||s.met.includes(id))).toBe(true);expect(body.twitter.onlineCount).toBeGreaterThanOrEqual(6);const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.onlineSlot).toBe(stamp);expect(saved.twitter!.online?.some(id=>id==='kaju'||s.met.includes(id))).toBe(true);
});
test('repairing a current slot brings every public account online and catches up a missed direct mention',()=>{
 const s=createGame(defaultContent),stamp=`${s.date}:${s.phase}`,official=twitterPublicAccounts.find(account=>account.handle==='toyohashi_city')!;
 s.twitter!.slots[stamp]=true;s.twitter!.onlineSlot=stamp;s.twitter!.online=['anna'];s.twitter!.jobs={[stamp+':anna']:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};
 const mention=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','',`@${official.handle} direct message`))!;
 startTwitterSlot(owner,s,defaultContent);
 expect(s.twitter!.online).toEqual(expect.arrayContaining(twitterPublicAccounts.map(account=>account.id)));
 expect(Object.values(s.twitter!.jobs!).some(job=>job.actor===official.id&&job.trigger?.kind==='catchup'&&job.trigger.postId===mention.id)).toBe(true);
});
test('opening Twitter restores an empty current roster without resubmitting completed jobs',async()=>{
 setup();Math.random=()=>0.99;const s=createGame(defaultContent);s.runId='empty-online';startTwitterSlot(owner,s,defaultContent);
 const roster=[...s.twitter!.online!];for(const job of Object.values(s.twitter!.jobs!))job.status='done';
 const jobs=structuredClone(s.twitter!.jobs);s.twitter!.online=[];await write('game:'+owner,s);
 const get=()=>twitterApi(new Request('http://localhost:9487/api/twitter',{headers:{cookie:'makeine_player='+owner}}));
 const response=await get(),body=await response.json();expect(response.status).toBe(200);
 expect(body.twitter.online).toEqual(roster.filter(id=>id==='kaju'||s.met.includes(id)||id.startsWith('official-')));
 const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.jobs).toEqual(jobs);expect(saved.twitter!.online?.slice().sort()).toEqual(roster.slice().sort());
 await get();expect((await read<GameState>('game:'+owner,s)).twitter!.jobs).toEqual(jobs);
});
test('offline thread participants catch up after coming online and old threads resurface only after new activity',()=>{
 const s=createGame(defaultContent),root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','以前のパンケーキの話'),100)!;
 const reply=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',root.id,'今度作ってみよう'),200)!;
 Math.random=()=>0.1;const catchups=()=>Object.values(s.twitter!.jobs??{}).filter(job=>job.actor==='anna'&&job.trigger?.kind==='catchup');
 startTwitterSlot(owner,s,defaultContent);expect(catchups()).toHaveLength(1);expect(catchups()[0].trigger?.postId).toBe(reply.id);
 s.phase=1;startTwitterSlot(owner,s,defaultContent);expect(catchups()).toHaveLength(1);
 const revived=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',reply.id,'翻到舊文，真的做成功了'),300)!;
 s.phase=2;startTwitterSlot(owner,s,defaultContent);expect(catchups()).toHaveLength(2);expect(catchups().at(-1)?.trigger?.postId).toBe(revived.id);
});
test('a failed offline mention remains unread and is retried the next time the character is online',async()=>{
 setup();Math.random=()=>.1;const s=createGame(defaultContent);s.runId='catchup-retry';const mention=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','',`@tamaki 請回覆我`))!;startTwitterSlot(owner,s,defaultContent);
 const first=Object.entries(s.twitter!.jobs!).find(([,job])=>job.actor==='tamaki'&&job.trigger?.kind==='catchup'&&job.trigger.postId===mention.id)!;await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async()=>Response.json({choices:[{finish_reason:'length',message:{tool_calls:[]}}]})) as unknown as typeof fetch;await runTwitterJob(owner,s.runId,defaultContent,first[0]);let saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.jobs![first[0]].status).toBe('failed');expect(saved.twitter!.threadSeen?.tamaki?.[mention.id]??0).toBeLessThan(mention.created);
 // Emulate the premature acknowledgement stored by older builds and verify
 // that migration-on-scheduling reopens it instead of losing the mention.
 ((saved.twitter!.threadSeen??={}).tamaki??={})[mention.id]=mention.created;startTwitterSlot(owner,saved,defaultContent);
 const retry=[first[0],saved.twitter!.jobs![first[0]]] as const;expect(retry[1]).toMatchObject({status:'scheduled',retryCount:1});await write('game:'+owner,saved);
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body);expect(body.messages[0].content).toContain(prompt('twitter.catchupSystem'));return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'reply',target:mention.id,text:'現在看到了。'})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,retry[0]);saved=await read<GameState>('game:'+owner,s);expect(Object.values(saved.twitter!.posts).some(post=>post.author==='tamaki'&&post.replyTo===mention.id&&post.text==='現在看到了。')).toBe(true);expect(saved.twitter!.threadSeen!.tamaki[mention.id]).toBe(mention.created);
});
test('slot discovery is independent of posting and establishes public and private NPC follows',async()=>{
 setup();Math.random=()=>0.1;const s=createGame(defaultContent);s.runId='discovery-network';startTwitterSlot(owner,s,defaultContent);
 const stamp=`${s.date}:${s.phase}`,ids=['anna','komari'].map(actor=>`${stamp}:discovery:${actor}`);
 expect(ids.every(id=>s.twitter!.jobs![id]?.trigger?.kind==='discovery')).toBe(true);
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 let step=0;globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),ctx=JSON.parse(body.messages.at(-1).content);
  expect(body.tools[0].function.parameters.properties.action.enum).toEqual(['follow','accept','decline','unblock','idle']);
  expect(ctx.trigger.kind).toBe('discovery');const d=step++===0?decision('follow','komari'):decision('accept','anna');
  if(d.action==='follow'){expect(ctx.followCandidates.some((x:any)=>x.id==='komari'&&x.private)).toBe(true);expect(ctx.followCandidates.some((x:any)=>x.id==='kazuhiko')).toBe(true);}
  else expect(ctx.receivedFollowRequests.anna).toBe(true);
  return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(d)}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,ids[0]);let saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.requests.komari.anna).toBe(true);expect(saved.twitter!.following.anna.komari).not.toBe(true);
 await runTwitterJob(owner,s.runId,defaultContent,ids[1]);saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.following.anna.komari).toBe(true);
 expect(saved.twitter!.jobs![stamp+':anna'].status).toBe('scheduled');
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('follow','lemon'))}}]}}]})) as unknown as typeof fetch;
 const publicId=stamp+':discovery:mitsuki';await runTwitterJob(owner,s.runId,defaultContent,publicId);saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.following.mitsuki.lemon).toBe(true);
});
test('NPC discovery keeps relevant official accounts prominent even after interacting with them',async()=>{
 setup();const s=createGame(defaultContent),official=twitterPublicAccounts.find(account=>account.id==='official-library')!;s.runId='official-follow-discovery';const root=applyTwitterDecision(s,defaultContent,official.id,decision('post','','本と地域文化について紹介します。'))!;applyTwitterDecision(s,defaultContent,'anna',decision('reply',root.id,'気になります！'));
 s.twitter!.jobs={discovery:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:Object.keys(s.twitter!.posts),status:'scheduled',trigger:{kind:'discovery',source:'anna'}}};await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);expect(context.officialFollowCandidates.some((candidate:any)=>candidate.id===official.id&&candidate.publicAccount)).toBe(true);expect(context.followCandidates.some((candidate:any)=>candidate.id===official.id)).toBe(true);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('follow',official.id))}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'discovery');const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.following.anna[official.id]).toBe(true);
});
test('an online NPC can send a follow request to the private player account',async()=>{
 setup();const s=createGame(defaultContent);s.runId='private-player-discovery';s.twitter!.playerPrivate=true;twitterState(s,defaultContent);s.twitter!.jobs={discovery:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled',trigger:{kind:'discovery',source:'anna'}}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content),player=context.followCandidates.find((candidate:any)=>candidate.id==='kazuhiko');expect(player?.private).toBe(true);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('follow','kazuhiko'))}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'discovery');const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.requests.kazuhiko.anna).toBe(true);expect(saved.twitter!.following.anna.kazuhiko).not.toBe(true);
});
test('NPC jobs suppress repeated replies across slots but can answer a new comment',async()=>{
 setup();const s=createGame(defaultContent);s.runId='repeat-reply';const root=applyTwitterDecision(s,defaultContent,'lemon',decision('post','','今天練跑'))!;
 const first=applyTwitterDecision(s,defaultContent,'mitsuki',decision('reply',root.id,'記得喝水'))!;s.phase=2;
 s.twitter!.jobs={repeat:{actor:'mitsuki',date:s.date,phase:s.phase,due:0,posts:[root.id,first.id],status:'scheduled'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 let target=root.id;globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('reply',target,'天氣熱，要多喝水'))}}]}}]})) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'repeat');let saved=await read<GameState>('game:'+owner,s);
 expect(Object.values(saved.twitter!.posts).filter(p=>p.author==='mitsuki'&&p.replyTo===root.id)).toHaveLength(1);
 const fresh=applyTwitterDecision(saved,defaultContent,'kazuhiko',decision('reply',first.id,'你平常跑多少？'))!;target=fresh.id;
 saved.twitter!.jobs!.fresh={actor:'mitsuki',date:s.date,phase:s.phase,due:0,posts:Object.keys(saved.twitter!.posts),status:'scheduled',trigger:{kind:'reply',source:'kazuhiko',postId:fresh.id}};await write('game:'+owner,saved);
 await runTwitterJob(owner,s.runId,defaultContent,'fresh');saved=await read<GameState>('game:'+owner,s);expect(Object.values(saved.twitter!.posts).filter(p=>p.author==='mitsuki'&&p.replyTo===fresh.id)).toHaveLength(1);
});
test('overlapping jobs for one NPC wait and read the committed reply before continuing',async()=>{
 setup();const s=createGame(defaultContent);s.runId='serial-npc';const root=applyTwitterDecision(s,defaultContent,'lemon',decision('post','','今天練跑'))!;
 s.twitter!.jobs=Object.fromEntries(['one','two'].map(id=>[id,{actor:'mitsuki',date:s.date,phase:s.phase,due:0,posts:[root.id],status:'scheduled',trigger:{kind:'reply',source:'lemon',postId:root.id}}]));
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 let release!:()=>void,entered!:()=>void,calls=0;const gate=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
 globalThis.fetch=(async(_url:any,init:any)=>{calls++;if(calls===1){entered();await gate;}else {const ctx=JSON.parse(JSON.parse(init.body).messages.at(-1).content);expect(ctx.posts.some((p:any)=>p.author==='mitsuki'&&p.replyTo===root.id)).toBe(true);}
  return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('reply',root.id,'多喝水'))}}]}}]});}) as typeof fetch;
 const first=runTwitterJob(owner,s.runId,defaultContent,'one');await started;
 try{await runTwitterJob(owner,s.runId,defaultContent,'two');expect(calls).toBe(1);expect((await read<GameState>('game:'+owner,s)).twitter!.jobs!.two.status).toBe('scheduled');}finally{release();await first;}
 await runTwitterJob(owner,s.runId,defaultContent,'two');const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.jobs!.two.status).toBe('done');expect(Object.values(saved.twitter!.posts).filter(p=>p.author==='mitsuki')).toHaveLength(1);
});
test('default Twitter bios describe personality instead of relationship labels',()=>{
 const karen=defaultContent.characters.find(character=>character.id==='karen')!;
 expect(socialSettings(karen).twitterBio).not.toContain('交往');expect(socialSettings(karen).twitterBio).not.toContain('好友');expect(socialSettings(karen).twitterCover).toBe('/assets/twitter-covers/karen.jpg');
 const custom=structuredClone(karen);custom.social={...socialSettings(custom),twitterBio:'今天也要開心！',twitterCover:'/assets/authored/custom.jpg'};expect(socialSettings(custom).twitterBio).toBe('今天也要開心！');expect(socialSettings(custom).twitterCover).toBe('/assets/authored/custom.jpg');
});
test('unmet NPCs post in the background and old posts appear only after meeting and following',()=>{
 const s=createGame(defaultContent),post=applyTwitterDecision(s,defaultContent,'lemon',decision('post','','朝練が終わった！'))!;
 const view=()=>twitterView(s.twitter!,'kazuhiko',s.date,s.phase,new Set([...s.met,'kaju','kazuhiko']));
 expect(view().posts[post.id]).toBeUndefined();s.met.push('lemon');expect(view().posts[post.id]).toBeUndefined();
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('follow','lemon'));expect(view().posts[post.id]?.text).toBe('朝練が終わった！');
});
test('NPC reaction chains share the configured per-slot cap',async()=>{
 setup();const s=createGame(defaultContent);s.runId='npc-chain';s.twitter!.npcInteractionLimit=1;
 const root=applyTwitterDecision(s,defaultContent,'sosuke',decision('post','','部活が終わった。'))!,stamp=`${s.date}:${s.phase}:`;
 s.twitter!.onlineSlot=`${s.date}:${s.phase}`;s.twitter!.online=['anna','sosuke'];
 s.twitter!.jobs={[stamp+'anna']:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled',trigger:{kind:'post',source:'sosuke',postId:root.id}},[stamp+'sosuke']:{actor:'sosuke',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 let calls=0;globalThis.fetch=(async(_url:any,init:any)=>{calls++;const body=JSON.parse(init.body),raw=body.messages.at(-1).content,context=JSON.parse(typeof raw==='string'?raw:raw[0].text),target=context.trigger?.postId??root.id;return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'reply',target,text:calls===1?'お疲れさま。':'ありがとう。',image:false})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,stamp+'anna');let saved=await read<GameState>('game:'+owner,s);const reaction=Object.entries(saved.twitter!.jobs!).find(([id])=>id.includes('reaction:sosuke'))!;expect(reaction).toBeDefined();
 await runTwitterJob(owner,s.runId,defaultContent,reaction[0]);saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.npcInteractions?.[`${s.date}:${s.phase}:${root.id}`]).toBe(1);expect(Object.values(saved.twitter!.jobs!).filter(job=>job.actor==='sosuke'&&job.trigger)).toHaveLength(1);expect(Object.values(saved.twitter!.jobs!).some(job=>job.actor==='official-toyohashi-police'&&job.trigger?.kind==='patrol')).toBe(true);expect(calls).toBe(2);
});
test('NPC interaction caps are isolated per root Twitter thread',async()=>{
 setup();const s=createGame(defaultContent);s.runId='per-thread-cap';s.twitter!.npcInteractionLimit=1;const slot=`${s.date}:${s.phase}`,actor='anna',source='sosuke';
 const first=applyTwitterDecision(s,defaultContent,source,decision('post','','第一條討論'))!,second=applyTwitterDecision(s,defaultContent,source,decision('post','','第二條討論'))!;
 s.twitter!.onlineSlot=slot;s.twitter!.online=[actor,source];s.twitter!.npcInteractions={[`${slot}:${first.id}`]:1};s.twitter!.jobs={
  [`${slot}:${actor}`]:{actor,date:s.date,phase:s.phase,due:0,posts:[],status:'done'},
  first:{actor,date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled',trigger:{kind:'post',source,postId:first.id}},
  second:{actor,date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled',trigger:{kind:'post',source,postId:second.id}},
 };
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const context=JSON.parse(JSON.parse(init.body).messages.at(-1).content),target=context.trigger.postId;return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('like',target))}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'first');await runTwitterJob(owner,s.runId,defaultContent,'second');const saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.posts[first.id].likes.anna).not.toBe(true);expect(saved.twitter!.posts[second.id].likes.anna).toBe(true);expect(saved.twitter!.npcInteractions?.[`${slot}:${first.id}`]).toBe(1);expect(saved.twitter!.npcInteractions?.[`${slot}:${second.id}`]).toBe(1);
});
test('old-thread catch-up and publishing do not spend the live NPC interaction limit',async()=>{
 setup();const s=createGame(defaultContent);s.runId='npc-old-thread';const stamp=`${s.date}:${s.phase}:`;
 const old=applyTwitterDecision(s,defaultContent,'sosuke',decision('post','','前の時段の話題'))!;old.phase=s.phase===0?1:s.phase-1;old.date=s.phase===0?'2026-07-16':s.date;
 s.twitter!.onlineSlot=`${s.date}:${s.phase}`;s.twitter!.online=['anna','sosuke'];s.twitter!.jobs={
  [stamp+'anna']:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[old.id],status:'scheduled'},
  [stamp+'sosuke']:{actor:'sosuke',date:s.date,phase:s.phase,due:0,posts:[old.id],status:'scheduled'},
 };
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});let call=0;
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(call++===0?{action:'reply',target:old.id,text:'今看到舊文。',image:false}:{action:'post',target:'',text:'本時段的新貼文。',image:false})}}]}}]})) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,stamp+'anna');await runTwitterJob(owner,s.runId,defaultContent,stamp+'sosuke');const saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.npcInteractions?.[`${s.date}:${s.phase}:${old.id}`]).toBeUndefined();expect(Object.values(saved.twitter!.posts).some(post=>post.text==='本時段的新貼文。')).toBe(true);
});
test('likes and reposts spend only the live cap, and pre-login posts remain eligible at zero',async()=>{
 setup();const s=createGame(defaultContent);s.runId='engagement-cap';const stamp=`${s.date}:${s.phase}`;
 const old=applyTwitterDecision(s,defaultContent,'sosuke',decision('post','','上線之前'))!,fresh=applyTwitterDecision(s,defaultContent,'sosuke',decision('post','','上線之後'))!;
 s.twitter!.onlineSlot=stamp;s.twitter!.online=['anna','sosuke'];s.twitter!.npcInteractionLimit=1;
 s.twitter!.jobs={[stamp+':anna']:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[old.id],status:'done'}};
 for(const id of ['like','repost','old'])s.twitter!.jobs[id]={actor:'anna',date:s.date,phase:s.phase,due:0,posts:[old.id,fresh.id],status:'scheduled',trigger:{kind:'post',source:'sosuke',postId:id==='old'?old.id:fresh.id}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});let step=0;
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify([decision('like',fresh.id),decision('repost',fresh.id),decision('repost',old.id)][step++])}}]}}]})) as unknown as typeof fetch;
 for(const id of ['like','repost','old'])await runTwitterJob(owner,s.runId,defaultContent,id);
 const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.posts[fresh.id].likes.anna).toBe(true);expect(saved.twitter!.posts[fresh.id].reposts.anna).not.toBe(true);expect(saved.twitter!.posts[old.id].reposts.anna).toBe(true);expect(saved.twitter!.npcInteractions![`${stamp}:${fresh.id}`]).toBe(1);
});
test('known public commenters remain visible without following every participant',()=>{
 const s=createGame(defaultContent);s.twitter!.following.kazuhiko.lemon=true;
 const root=applyTwitterDecision(s,defaultContent,'lemon',decision('post','','練跑'))!,reply=applyTwitterDecision(s,defaultContent,'mitsuki',decision('reply',root.id,'多喝水'))!;
 const view=twitterView(s.twitter!,'kazuhiko',s.date,s.phase,new Set(['lemon','mitsuki','kazuhiko']));expect(view.posts[reply.id]).toBeDefined();
});
test('an online NPC follows back new followers after its publishing job has finished',async()=>{
 setup();const c=structuredClone(defaultContent),anna=c.characters.find(ch=>ch.id==='anna')!;anna.social={...socialSettings(anna),twitterFollowBack:true};
 const s=createGame(c);s.runId='live-followback';s.met.push('anna');const stamp=`${s.date}:${s.phase}`;
 s.twitter!.jobs={[stamp+':anna']:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};
 await write('content',c);await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 const response=await twitterApi(request({...decision('follow','anna'),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);
 let saved=await read<GameState>('game:'+owner,s);const reaction=Object.entries(saved.twitter!.jobs!).find(([,j])=>j.trigger?.kind==='follow')!;expect(reaction).toBeDefined();
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('idle'))}}]}}]})) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,c,reaction[0]);saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.following.anna.kazuhiko).toBe(true);
});
test('Twitter NPC interaction limit can be saved from game settings',async()=>{
 setup();const s=createGame(defaultContent);s.runId='npc-limit';await write('game:'+owner,s);
 const response=await twitterApi(request({runId:s.runId,npcInteractionLimit:7},'PATCH'));expect(response.status).toBe(200);
 expect((await read<GameState>('game:'+owner,s)).twitter!.npcInteractionLimit).toBe(7);
});
test('player privacy persists and makes new NPC follows wait for approval',async()=>{
 setup();const s=createGame(defaultContent);s.runId='player-private';await write('game:'+owner,s);
 const response=await twitterApi(request({runId:s.runId,playerPrivate:true},'PATCH'));expect(response.status).toBe(200);
 const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.playerPrivate).toBe(true);expect(twitterState(saved,defaultContent).accounts.kazuhiko.private).toBe(true);
 applyTwitterDecision(saved,defaultContent,'anna',decision('follow','kazuhiko'));expect(saved.twitter!.requests.kazuhiko.anna).toBe(true);expect(saved.twitter!.following.anna.kazuhiko).not.toBe(true);
});
test('Twitter notification marker covers followed posts, mentions, replies, likes, reposts, requests and notices',()=>{
 const s=createGame(defaultContent),t=s.twitter!,before=twitterNotificationKey(t);
 const own=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','hello'))!,friend=applyTwitterDecision(s,defaultContent,'kaju',decision('post','','daily'))!;
 applyTwitterDecision(s,defaultContent,'kaju',decision('reply',own.id,'@kazuhiko reply'));applyTwitterDecision(s,defaultContent,'kaju',decision('like',own.id));applyTwitterDecision(s,defaultContent,'kaju',decision('repost',own.id));
 (t.requests.kazuhiko??={}).anna=true;t.notices.notice={text:'notice',created:1,postId:friend.id};
 const key=twitterNotificationKey(t);expect(key).not.toBe(before);for(const kind of ['friend:','mention:','reply:','like:','repost:','request:','notice:'])expect(key).toContain(kind);
 t.notices.scheduler={text:'internal failure',created:2};expect(twitterNotificationTokens(t)).not.toContain('notice:scheduler');
});
test('player repost and undo are immediate and never call the LLM',async()=>{
 setup();const s=createGame(defaultContent);s.runId='instant-repost';const post=applyTwitterDecision(s,defaultContent,'anna',decision('post','','public post'))!;await write('game:'+owner,s);
 let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('LLM must not be called');}) as unknown as typeof fetch;
 for(let index=0;index<2;index++){const response=await twitterApi(request({...decision('repost',post.id),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);}
 const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.posts[post.id].reposts.kazuhiko).toBe(false);expect(calls).toBe(0);
});
test('an eligible close follow request cannot be randomly declined by the NPC model',async()=>{
 setup();const c=structuredClone(defaultContent),anna=c.characters.find(character=>character.id==='anna')!;anna.social={...socialSettings(anna),twitterPrivate:true,twitterAffection:20};
 const s=createGame(c);s.runId='accept-close';s.affection.anna=80;(s.twitter!.requests.anna??={}).kazuhiko=true;s.twitter!.jobs={test:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};
 await write('content',c);await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);expect(context.receivedFollowRequests.kazuhiko).toBe(true);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'decline',target:'kazuhiko',text:'',image:false})}}]}}]});}) as typeof fetch;
  await runTwitterJob(owner,s.runId,c,'test');const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.following.kazuhiko.anna).toBe(true);expect(saved.twitter!.notices&&Object.values(saved.twitter!.notices).some(notice=>notice.accountId==='anna')).toBe(true);
});
test('player interactions bypass the NPC chain cap',async()=>{
 setup();const s=createGame(defaultContent);s.runId='player-unlimited';s.met.push('anna');s.twitter!.npcInteractionLimit=0;const base=`${s.date}:${s.phase}:anna`;
 s.twitter!.jobs={[base]:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(context.request)}}]}}]});}) as typeof fetch;
 for(const text of ['@anna 第一則','@anna 第二則'])expect((await twitterApi(request({...decision('post','',text),runId:s.runId,requestId:crypto.randomUUID()}))).status).toBe(200);
 const saved=await read<GameState>('game:'+owner,s);expect(Object.values(saved.twitter!.jobs!).filter(job=>job.trigger?.source==='kazuhiko'&&job.actor==='anna')).toHaveLength(2);expect(Object.values(saved.twitter!.jobs!).filter(job=>job.trigger?.source==='kazuhiko'&&job.actor==='official-toyohashi-police')).toHaveLength(2);expect(Object.values(saved.twitter!.npcInteractions??{}).reduce((sum,value)=>sum+value,0)).toBe(0);
});
test('a player reply wakes the online direct parent instead of every thread participant',async()=>{
 setup();const s=createGame(defaultContent);s.runId='group-thread';const root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','一起討論吧'))!,second=applyTwitterDecision(s,defaultContent,'sosuke',decision('reply',root.id,'我先說'))!,third=applyTwitterDecision(s,defaultContent,'karen',decision('reply',second.id,'我也加入'))!,stamp=s.date+':'+s.phase+':';
 s.twitter!.jobs={};for(const actor of ['anna','sosuke','karen'])s.twitter!.jobs[stamp+actor]={actor,date:s.date,phase:s.phase,due:0,posts:[],status:'done'};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(context.request)}}]}}]});}) as typeof fetch;
 const response=await twitterApi(request({...decision('reply',third.id,'大家覺得呢？'),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);
 const saved=await read<GameState>('game:'+owner,s),actors=Object.values(saved.twitter!.jobs!).filter(job=>job.trigger?.source==='kazuhiko').map(job=>job.actor);expect(actors).toEqual(['karen','official-toyohashi-police']);
});
test('online NPC reaction jobs can like and repost another character post',async()=>{
 setup();const s=createGame(defaultContent);s.runId='npc-engagement';const post=applyTwitterDecision(s,defaultContent,'anna',decision('post','','文化祭準備中'))!;
 s.twitter!.jobs={like:{actor:'sosuke',date:s.date,phase:s.phase,due:0,posts:[post.id],status:'scheduled',trigger:{kind:'post',source:'anna',postId:post.id}},repost:{actor:'karen',date:s.date,phase:s.phase,due:0,posts:[post.id],status:'scheduled',trigger:{kind:'post',source:'anna',postId:post.id}}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});let calls=0;
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:++calls===1?'like':'repost',target:post.id,text:'',image:false})}}]}}]})) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'like');await runTwitterJob(owner,s.runId,defaultContent,'repost');const saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.posts[post.id].likes.sosuke).toBe(true);expect(saved.twitter!.posts[post.id].reposts.karen).toBe(true);
});
test('saved activity levels change actual slot admission and older social settings default to medium',()=>{
 const c=structuredClone(defaultContent),ch=c.characters.find(ch=>ch.id==='anna')!;
 ch.social={lineAffection:23,twitterHandle:'anna_test',twitterPrivate:true,twitterAffection:30};
 expect(socialSettings(ch)).toMatchObject({twitterActivity:'medium',twitterFollowBack:false,lineAffection:23,twitterPrivate:true});
 const admitted=(level:'low'|'medium'|'high',draw:number)=>{
  ch.social={...socialSettings(ch),twitterActivity:level};const saved=validateContent(JSON.parse(JSON.stringify(c)));
  expect(saved.characters.find(ch=>ch.id==='anna')!.social!.twitterActivity).toBe(level);
  Math.random=()=>draw;return draw<twitterOnlineProbability(saved.characters.find(character=>character.id==='anna')!);
 };
 expect(admitted('low',0.4)).toBe(false);expect(admitted('medium',0.4)).toBe(true);
 expect(admitted('medium',0.65)).toBe(false);expect(admitted('high',0.65)).toBe(true);
 (ch.social as any).twitterActivity='always';expect(()=>validateContent(c)).toThrow('上線頻率');
 ch.social={...socialSettings(ch),twitterActivity:'medium',twitterFollowBack:true};expect(validateContent(c).characters.find(character=>character.id==='anna')!.social!.twitterFollowBack).toBe(true);
 (ch.social as any).twitterFollowBack='yes';expect(()=>validateContent(c)).toThrow('主動回追');
});
test('autonomous NPC decisions receive explicit follow candidates and can follow one',async()=>{
 setup();const s=createGame(defaultContent);s.runId='autonomous-follow';s.twitter!.jobs={test:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),raw=body.messages.at(-1).content,context=JSON.parse(typeof raw==='string'?raw:raw[0].text);expect(body.messages[0].content).toContain('followCandidates');expect(context.followCandidates.some((candidate:any)=>candidate.id==='lemon')).toBe(true);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'follow',target:'lemon',text:'',image:false})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'test');const saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.following.anna.lemon).toBe(true);expect(Object.values(saved.twitter!.follows??{}).some(event=>event.follower==='anna'&&event.target==='lemon')).toBe(true);
});
test('autonomous Twitter writing can retrieve supplemental knowledge',async()=>{
 setup();saveKnowledgeFiles([{path:'local-food/KNOWLEDGE.md',text:'---\nname: local-food\ndescription: 豐橋飲食知識\n---\n菜飯是當地飲食文化之一。'}]);const s=createGame(defaultContent);s.runId='twitter-knowledge';s.twitter!.jobs={test:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});let calls=0;
 globalThis.fetch=(async(_url:any,init:any)=>{calls++;const body=JSON.parse(init.body),tool=body.tools[0].function.name;if(tool==='read_knowledge')return Response.json({choices:[{message:{tool_calls:[{function:{name:'read_knowledge',arguments:JSON.stringify({path:'local-food'})}}]}}]});expect(body.messages[0].content).toContain('菜飯是當地飲食文化之一。');return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('idle'))}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'test');expect(calls).toBe(2);
});
test('autonomous Twitter writing can request Web Search when game search is enabled',async()=>{
 setup();await saveSearchSettings({enabled:true,knowledgeEnabled:false,provider:'brave',key:'brave-secret'});const s=createGame(defaultContent);s.runId='twitter-web-search';s.twitter!.jobs={test:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});let modelCalls=0,searchCalls=0;
 globalThis.fetch=(async(url:any,init?:RequestInit)=>{
  if(String(url).includes('api.search.brave.com')){searchCalls++;expect((init!.headers as Record<string,string>)['X-Subscription-Token']).toBe('brave-secret');return Response.json({web:{results:[{title:'豐橋活動',url:'https://example.org/event',description:'今天有經過查證的在地活動。'}]}});}
  modelCalls++;const body=JSON.parse(String(init?.body));const tool=body.tools[0].function.name;
  if(tool==='web_search')return Response.json({choices:[{message:{tool_calls:[{function:{name:'web_search',arguments:JSON.stringify({query:'豐橋 今天 活動'})}}]}}]});
  expect(body.messages[0].content).toContain('今天有經過查證的在地活動。');return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('idle'))}}]}}]});
 }) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'test');expect(modelCalls).toBe(2);expect(searchCalls).toBe(1);
});
test('an online character with follow-back enabled follows public followers and requests private ones',async()=>{
 setup();const c=structuredClone(defaultContent),anna=c.characters.find(character=>character.id==='anna')!;anna.social={...socialSettings(anna),twitterPrivate:false,twitterFollowBack:true};
 const s=createGame(c);s.runId='follow-back';applyTwitterDecision(s,c,'kazuhiko',decision('follow','anna'));applyTwitterDecision(s,c,'kaju',decision('follow','anna'));
 s.twitter!.jobs={test:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};
 await write('content',c);await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('idle'))}}]}}]})) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,c,'test');const saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.following.anna.kazuhiko).toBe(true);expect(saved.twitter!.requests.kaju.anna).toBe(true);expect(saved.twitter!.following.anna.kaju).not.toBe(true);expect(Object.values(saved.twitter!.follows??{}).filter(event=>event.target==='anna').every(event=>event.handled)).toBe(true);
});
test('Twitter POST requires tool call, persists once on retry, and keeps scene revision stable',async()=>{
 setup();const s=createGame(defaultContent);s.runId='test-run';await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 let calls=0;globalThis.fetch=(async(_url:any,init:any)=>{calls++;const b=JSON.parse(init.body),input=JSON.parse(b.messages.at(-1).content);expect(typeof input.roll).toBe('number');return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(input.request)}}]}}]});}) as typeof fetch;
 const body={...decision('post','','今天的風很舒服。'),runId:s.runId,requestId:crypto.randomUUID()};
 const first=await twitterApi(request(body));expect(first.status).toBe(200);const second=await twitterApi(request(body));expect(second.status).toBe(200);expect(calls).toBe(1);
 const saved=await read<GameState>('game:'+owner,s);expect(Object.values(saved.twitter!.posts)).toHaveLength(1);expect(saved.sceneRevision).toBe(s.revision);
});
test('player reply validation omits every image capability from the LLM payload',async()=>{
 setup();const s=createGame(defaultContent);s.runId='reply-payload';const root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','今天讀完一本書。'))!;await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);expect(body.tools).toHaveLength(1);expect(body.tools[0].function.name).toBe('twitter_action');expect(body.tools[0].function.parameters.properties.image).toBeUndefined();expect(body.tools[0].function.parameters.required).not.toContain('image');expect(context.request).toEqual({action:'reply',target:root.id,text:'讀完的感想如何？'});expect(JSON.stringify(body)).not.toContain('不得附圖');return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(context.request)}}]}}]});}) as typeof fetch;
 const response=await twitterApi(request({...decision('reply',root.id,'讀完的感想如何？'),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);const saved=await read<GameState>('game:'+owner,s),reply=Object.values(saved.twitter!.posts).find(post=>post.author==='kazuhiko'&&post.replyTo===root.id);expect(reply?.image).toBeUndefined();
});
test('online mentioned characters receive an immediate reaction job with relationship memory',async()=>{
 setup();const s=createGame(defaultContent);s.runId='online-reaction';s.met.push('anna');s.twitter!.jobs={[`${s.date}:${s.phase}:anna`]:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};
 s.memories.anna={summary:'和彥是會分享日常的朋友。',facts:['最近常聊天'],recent:[],turns:3};await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),raw=body.messages.at(-1).content,context=JSON.parse(typeof raw==='string'?raw:raw[0].text);if(context.request)return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(context.request)}}]}}]});expect(context.trigger).toMatchObject({kind:'post',source:'kazuhiko'});expect(context.memory.summary).toContain('朋友');return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'reply',target:context.trigger.postId,text:'我有看到喔。',image:false})}}]}}]});}) as typeof fetch;
 const response=await twitterApi(request({...decision('post','','@anna 今天要不要一起吃點心？'),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);expect((await response.json()).twitter.online).toContain('anna');
 const queued=await read<GameState>('game:'+owner,s),entry=Object.entries(queued.twitter!.jobs!).find(([,job])=>job.trigger?.source==='kazuhiko')!;expect(entry).toBeDefined();await runTwitterJob(owner,s.runId,defaultContent,entry[0]);
 const saved=await read<GameState>('game:'+owner,s);expect(Object.values(saved.twitter!.posts).some(p=>p.author==='anna'&&p.text==='我有看到喔。')).toBe(true);
});
test('public accounts stay online and receive direct mentions without an activity roll or publishing job',async()=>{
 setup();const s=createGame(defaultContent);s.runId='persistent-public-account';const stamp=`${s.date}:${s.phase}`,official=twitterPublicAccounts.find(account=>account.handle==='toyohashi_city')!;
 s.twitter!.onlineSlot=stamp;s.twitter!.online=[];s.twitter!.jobs={};await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(context.request)}}]}}]});}) as typeof fetch;
 const response=await twitterApi(request({...decision('post','',`@${official.handle} direct public message`),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);
 const body=await response.json(),saved=await read<GameState>('game:'+owner,s),reaction=Object.values(saved.twitter!.jobs!).find(job=>job.actor===official.id&&job.trigger?.source==='kazuhiko');
 expect(body.twitter.online).toContain(official.id);expect(reaction?.trigger).toMatchObject({kind:'post',source:'kazuhiko'});expect(saved.twitter!.jobs![stamp+':'+official.id]).toBeUndefined();
});
test('a Twitter post can make a LINE contact continue privately instead of replying publicly',async()=>{
 setup();const s=createGame(defaultContent);s.runId='twitter-private-line';s.met.push('anna');s.contacts.push('anna');s.twitter!.jobs={[`${s.date}:${s.phase}:anna`]:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);if(context.request)return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(context.request)}}]}}]});expect(context.privateLineAvailable).toBe(true);expect(body.tools.map((entry:any)=>entry.function.name)).toContain('send_twitter_private_line');return Response.json({choices:[{message:{tool_calls:[{function:{name:'send_twitter_private_line',arguments:JSON.stringify({text:'這件事不適合公開說，你還好嗎？'})}}]}}]});}) as typeof fetch;
 const response=await twitterApi(request({...decision('post','','@anna 最近遇到一件不方便公開說的事。'),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);
 const queued=await read<GameState>('game:'+owner,s),entry=Object.entries(queued.twitter!.jobs!).find(([,job])=>job.actor==='anna'&&job.trigger?.source==='kazuhiko')!;await runTwitterJob(owner,s.runId,defaultContent,entry[0]);
 const saved=await read<GameState>('game:'+owner,s);expect(saved.messages.anna.at(-1)).toMatchObject({from:'anna',text:'這件事不適合公開說，你還好嗎？'});expect(Object.values(saved.twitter!.posts).some(post=>post.author==='anna'&&post.replyTo)).toBe(false);
});
test('an online valued LINE contact can ask why the player unfollowed',async()=>{
 setup();const s=createGame(defaultContent);s.runId='unfollow-line';s.met.push('anna');s.contacts.push('anna');s.affection.anna=40;s.twitter!.following.kazuhiko.anna=true;s.twitter!.jobs={[`${s.date}:${s.phase}:anna`]:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'}};s.memories.anna={summary:'把和彥當成重要朋友。',facts:['彼此信任'],recent:[],turns:4};await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),tool=body.tools[0].function.name;if(tool==='twitter_action'){const context=JSON.parse(body.messages.at(-1).content);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(context.request)}}]}}]});}expect(tool).toBe('send_unfollow_line');expect(body.messages[0].content).toContain('重要');return Response.json({choices:[{message:{tool_calls:[{function:{name:'send_unfollow_line',arguments:JSON.stringify({send:true,text:'為什麼突然取消追蹤我？是我做了什麼嗎？',image:false})}}]}}]});}) as typeof fetch;
 const response=await twitterApi(request({...decision('unfollow','anna'),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);
 let saved=s;for(let i=0;i<100;i++){saved=await read<GameState>('game:'+owner,s);if(saved.messages.anna?.length)break;await Bun.sleep(2);}expect(saved.messages.anna.at(-1)?.text).toContain('取消追蹤');expect(Object.values(saved.twitter!.unfollows??{}).every(event=>event.handled)).toBe(true);
});
test('a wrong LLM action or stale run cannot change Twitter state',async()=>{
 setup();const s=createGame(defaultContent);s.runId='new';await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('idle'))}}]}}]})) as unknown as typeof fetch;
 const body={...decision('post','','hello'),runId:s.runId,requestId:crypto.randomUUID()};expect((await twitterApi(request(body))).status).toBe(400);expect((await twitterApi(request({...body,runId:'old'}))).status).toBe(400);expect(Object.keys((await read<GameState>('game:'+owner,s)).twitter!.posts)).toHaveLength(0);
});
test('a durable job reads only its eligible snapshot and commits a post exactly once',async()=>{
 setup();const s=createGame(defaultContent);s.runId='run';s.twitter!.jobs={test:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};const privatePost=applyTwitterDecision(s,defaultContent,'kaju',decision('post','','secret'))!;
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});let calls=0;
 globalThis.fetch=(async(_url:any,init:any)=>{calls++;expect(JSON.parse(init.body).messages.at(-1).content).not.toContain(privatePost.id);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('post','','お昼ごはん！'))}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'test');await runTwitterJob(owner,s.runId,defaultContent,'test');const saved=await read<GameState>('game:'+owner,s);expect(calls).toBe(1);expect(saved.twitter!.jobs!.test.status).toBe('done');expect(Object.values(saved.twitter!.posts).filter(p=>p.author==='anna')).toHaveLength(1);
});
test('Twitter chooses a reply using text only, then sends only the selected post image',async()=>{
 setup();const s=createGame(defaultContent);s.runId='vision';
 const root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','看看今天的天空'))!,reply=applyTwitterDecision(s,defaultContent,'sosuke',decision('reply',root.id,'補一張照片'))!,nested=applyTwitterDecision(s,defaultContent,'anna',decision('reply',reply.id,'這是另一個角度'))!;
 root.image=reply.image=nested.image='/api/media/feed.png';s.twitter!.jobs={test:{actor:'komari',date:s.date,phase:s.phase,due:0,posts:[reply.id],status:'scheduled',trigger:{kind:'reply',source:'anna',postId:reply.id}}};
 await assets().put('feed.png',new Uint8Array([1,2,3]).buffer,{httpMetadata:{contentType:'image/png'}});await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'vision-model',key:'test'});
 let calls=0;globalThis.fetch=(async(_url:any,init:any)=>{calls++;const body=JSON.parse(init.body),user=body.messages.at(-1).content;if(calls===1){expect(typeof user).toBe('string');const context=JSON.parse(user),ids=context.posts.map((post:any)=>post.id);expect(context.calendar).toMatchObject({date:s.date,schoolOpen:true});expect(ids).toEqual(expect.arrayContaining([root.id,reply.id,nested.id]));expect(context.posts.every((post:any)=>post.hasImage===true&&post.image===undefined)).toBe(true);expect(user).not.toContain('/api/media/');expect(user).not.toContain('data:image');return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('reply',reply.id,'先看圖再回覆'))}}]}}]});}expect(Array.isArray(user)).toBe(true);expect(body.tools).toHaveLength(1);expect(body.tools[0].function.parameters.properties.image).toBeUndefined();expect(user.filter((part:any)=>part.type==='image_url'&&part.image_url.url==='data:image/png;base64,AQID')).toHaveLength(1);const context=JSON.parse(user[0].text);expect(context.selectedPost.id).toBe(reply.id);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'reply',target:reply.id,text:'圖中的角度很好看'})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'test');expect(calls).toBe(2);const saved=await read<GameState>('game:'+owner,s);expect(Object.values(saved.twitter!.posts).some(post=>post.author==='komari'&&post.replyTo===reply.id&&post.text==='圖中的角度很好看')).toBe(true);
});
test('LINE/story updates preserve concurrently added Twitter posts',()=>{
 const old=createGame(defaultContent),scene=structuredClone(old),social=structuredClone(old);scene.dialogue.text='next scene';applyTwitterDecision(social,defaultContent,'anna',decision('post','','hello'));
 const merged=mergeConcurrentState(old,scene,social);expect(merged.dialogue.text).toBe('next scene');expect(Object.values(merged.twitter!.posts)).toHaveLength(1);
});
test('pending images are unreadable to NPCs and publish reactions only after attachment',async()=>{
 setup();const s=createGame(defaultContent);s.runId='pending-upload';s.twitter!.jobs={[`${s.date}:${s.phase}:anna`]:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'done'},browse:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});await write('stable-diffusion',{enabled:true,modelFamily:'Pony',url:'https://sd.example',checkpoint:'pony.safetensors'});
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>started=r);
 globalThis.fetch=(async(url:any,init:any)=>{
  if(String(url).endsWith('/loras'))return Response.json([]);
  if(String(url).endsWith('/txt2img')){started();await gate;return Response.json({images:['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uoAAAAASUVORK5CYII=']});}
  const body=JSON.parse(init.body),tool=body.tools[0].function.name,raw=body.messages.at(-1).content,ctx=JSON.parse(typeof raw==='string'?raw:raw[0].text);
  if(tool==='twitter_image_post'){expect(body.tools).toHaveLength(1);expect(body.tools[0].function.parameters.properties.image).toBeUndefined();return Response.json({choices:[{message:{tool_calls:[{function:{name:tool,arguments:JSON.stringify({text:ctx.request.text})}}]}}]});}
  if(tool!=='twitter_action')return Response.json({choices:[{message:{tool_calls:[{function:{name:tool,arguments:JSON.stringify({prompt:'pancakes, plate, no humans',negative_prompt:'person',caption:'鬆餅',...(tool==='twitter_image'?{loras:[]}:{})})}}]}}]});
  if(!ctx.request&&!ctx.trigger)expect(JSON.stringify(ctx)).not.toContain('還沒完成的鬆餅');
  if(ctx.trigger){expect(typeof raw).toBe('string');expect(raw).not.toContain('data:image');}
  return Response.json({choices:[{message:{tool_calls:[{function:{name:tool,arguments:JSON.stringify(ctx.request??(ctx.trigger?decision('like',ctx.trigger.postId):decision('idle')))}}]}}]});
 }) as typeof fetch;
 const response=await twitterApi(request({...decision('post','','@anna 還沒完成的鬆餅'),image:true,runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);await entered;
 let saved=await read<GameState>('game:'+owner,s),post=Object.values(saved.twitter!.posts)[0];
  try{expect(post.imagePending).toBe(true);expect(twitterView(saved.twitter!,'anna').posts[post.id]).toBeUndefined();expect(JSON.stringify(saved.memories.anna??{})).not.toContain('還沒完成的鬆餅');
  expect(()=>applyTwitterDecision(saved,defaultContent,'anna',decision('like',post.id))).toThrow();expect(Object.values(saved.twitter!.jobs!).some(j=>j.trigger?.postId===post.id)).toBe(false);
  await runTwitterJob(owner,s.runId,defaultContent,'browse');
 }finally{release();}
 for(let i=0;i<100;i++){saved=await read<GameState>('game:'+owner,s);if(saved.twitter!.posts[post.id].image)break;await Bun.sleep(5);}
 post=saved.twitter!.posts[post.id];expect(post.image).toBeDefined();expect(post.imagePending).toBe(false);expect(twitterView(saved.twitter!,'anna').posts[post.id]).toBeDefined();
  const reactions=Object.entries(saved.twitter!.jobs!).filter(([,j])=>j.trigger?.postId===post.id);expect(reactions.map(([,job])=>job.actor)).toEqual(expect.arrayContaining(['anna','official-toyohashi-police']));const annaReaction=reactions.find(([,job])=>job.actor==='anna')!;await runTwitterJob(owner,s.runId,defaultContent,annaReaction[0]);expect((await read<GameState>('game:'+owner,s)).twitter!.posts[post.id].likes.anna).toBe(true);
});
test('failed optional SD image keeps the Twitter text post and marks the image failure',async()=>{
 setup();const s=createGame(defaultContent);s.runId='images';await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 await write('stable-diffusion',{enabled:true,modelFamily:'Pony',url:'https://sd.example',checkpoint:'pony.safetensors'});
 globalThis.fetch=(async(url:any,init:any)=>{
  if(String(url).endsWith('/loras'))return Response.json([]);
  if(String(url).endsWith('/txt2img'))return Response.json({error:'test SD failure'},{status:503});
  const body=JSON.parse(init.body),name=body.tools[0].function.name;
  const args=name==='twitter_action'?JSON.parse(body.messages.at(-1).content).request:name==='twitter_image_post'?{text:JSON.parse(body.messages.at(-1).content).request.text}:{prompt:'a cup of tea',negative_prompt:'blurry',caption:'一杯茶',loras:[]};
  return Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:JSON.stringify(args)}}]}}]});
 }) as typeof fetch;
 const r=await twitterApi(request({...decision('post','','今天喝茶。'),image:true,runId:s.runId,requestId:crypto.randomUUID()}));expect(r.status).toBe(200);
 let saved=s;
 for(let attempt=0;attempt<100;attempt++){saved=await read<GameState>('game:'+owner,s);if(Object.values(saved.twitter!.posts)[0]?.imageStatus?.includes('失敗'))break;await new Promise(resolve=>setTimeout(resolve,2));}
 const post=Object.values(saved.twitter!.posts)[0];expect(post.text).toBe('今天喝茶。');expect(post.imageStatus).toContain('失敗');expect(post.image).toBeUndefined();
});
test('NPC replies cannot generate or attach images',async()=>{
 setup();const s=createGame(defaultContent);s.runId='reply-image';const root=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','今天的天空'))!;s.twitter!.jobs={test:{actor:'anna',date:s.date,phase:s.phase,due:0,posts:[root.id],status:'scheduled'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'vision-model',key:'test'});await write('stable-diffusion',{enabled:true,modelFamily:'Illustrious',url:'https://sd.example',checkpoint:'model.safetensors'});
 globalThis.fetch=(async(url:any,init:any)=>{
  if(String(url).endsWith('/sdapi/v1/loras'))return Response.json([{name:'anna',path:'C:/webui/models/Lora/Illustrious/anna.safetensors'}]);
  if(String(url).endsWith('/sdapi/v1/txt2img'))return Response.json({images:['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uoAAAAASUVORK5CYII=']});
  const body=JSON.parse(init.body),tool=body.tools[0].function.name;
  expect(tool).toBe('twitter_action');return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'reply',target:root.id,text:'雲看起來很漂亮。',image:false})}}]}}]});
 }) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'test');const saved=await read<GameState>('game:'+owner,s),reply=Object.values(saved.twitter!.posts).find(p=>p.replyTo===root.id)!;
 expect(reply.text).toBe('雲看起來很漂亮。');expect(reply.image).toBeUndefined();expect(reply.imageStatus).toBeUndefined();
});
test('Twitter lets an unsupported character request a person-free object image',async()=>{
 setup();const s=createGame(defaultContent);s.runId='unsupported-image';s.twitter!.jobs={test:{actor:'mitsuki',date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled'}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});await write('stable-diffusion',{enabled:true,modelFamily:'Pony',url:'https://sd.example',checkpoint:'pony.safetensors'});
 let calls=0;globalThis.fetch=(async(_url:any,init:any)=>{calls++;const body=JSON.parse(init.body);expect(body.tools.map((tool:any)=>tool.function.name)).toEqual(['twitter_action','twitter_image_post']);expect(body.tools[0].function.parameters.properties.image).toBeUndefined();expect(body.tools[1].function.parameters.properties).toEqual({text:expect.any(Object)});return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'post',target:'',text:'讀完一本書。'})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'test');
 const saved=await read<GameState>('game:'+owner,s),post=Object.values(saved.twitter!.posts).find(p=>p.author==='mitsuki')!;
 expect(calls).toBe(1);expect(post.image).toBeUndefined();expect(post.imageStatus).toBeUndefined();
});

test('verified public accounts are always public, followable, and never follow back',()=>{
 const s=createGame(defaultContent),t=twitterState(s,defaultContent),official=twitterPublicAccounts[0];
 expect(t.accounts[official.id]).toEqual({private:false,handle:official.handle,verified:true,publicAccount:true});
 applyTwitterDecision(s,defaultContent,'kazuhiko',decision('follow',official.id));
 expect(t.following.kazuhiko[official.id]).toBe(true);
 expect(()=>applyTwitterDecision(s,defaultContent,official.id,decision('follow','kazuhiko'))).toThrow('不會追蹤或回追');
 t.accounts[official.id].private=true;
 expect(twitterState(s,defaultContent).accounts[official.id].private).toBe(false);
});

test('pilgrimage shops use distinct verified accounts without bundled profile artwork',()=>{
 const expected=['official-seibunkan','official-uno-uno','official-bon-senga','official-murata-takoyaki','official-housendo-kalmia','official-yamasa-west','official-coffee-canele','official-gusto-hashira','official-miyako-udon'];
 for(const id of expected){const account=twitterPublicAccounts.find(item=>item.id===id);expect(account).toBeDefined();expect(account!.avatar).toBe('');expect(account!.cover??'').toBe('');}
 const gusto=twitterPublicAccounts.find(item=>item.id==='official-gusto-hashira');expect(gusto).toMatchObject({name:'ガスト 豊橋橋良店',handle:'gusto_hashira',sourceUrl:'https://store-info.skylark.co.jp/gusto/map/011654/'});
 expect(new Set(twitterPublicAccounts.map(item=>item.id)).size).toBe(twitterPublicAccounts.length);expect(new Set(twitterPublicAccounts.map(item=>item.handle)).size).toBe(twitterPublicAccounts.length);
});

test('public account profiles and voice prompts stay in-world',()=>{
 for(const account of twitterPublicAccounts){
  expect(account.bio).not.toMatch(/作品|聖地|巡礼|巡禮|アニメ|マップ[①-㉓]/);
  expect(account.prompt).not.toMatch(/架空作品|作品の聖地|聖地巡礼/);
 }
 expect(twitterPublicAccounts.find(account=>account.id==='official-tsuwabuki')?.sourceUrl).toBeUndefined();
 expect(twitterPublicAccounts.find(account=>account.id==='official-miyako-udon')?.sourceUrl).toBeUndefined();
});

test('Higashi Aichi Shimbun has no bundled artwork and uses the preceding editorial window',()=>{
 const news=twitterPublicAccounts.find(account=>account.id==='official-higashiaichi-news');
 expect(news).toMatchObject({name:'東愛知新聞社',handle:'Higasiaichinews',editorial:'regional-news',sourceUrl:'https://x.com/Higasiaichinews'});
 expect(news!.avatar).toBe('');
 expect(news!.cover??'').toBe('');
 expect(twitterNewsSourceWindow('2026-07-18',0)).toEqual({date:'2026-07-17',phase:2});
 expect(twitterNewsSourceWindow('2026-07-18',1)).toEqual({date:'2026-07-18',phase:0});
 expect(twitterNewsSourceWindow('2026-07-18',2)).toEqual({date:'2026-07-18',phase:1});
});

test('Higashi Aichi Shimbun reviews every public root post in the source window and publishes a uniform zero-to-three report batch',async()=>{
 setup();Math.random=()=>.99;const s=createGame(defaultContent);s.runId='regional-news';s.date='2026-07-18';s.phase=0;
 const publicPost=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','昨夜、駅前で珍しい虹を見た。'))!,official=twitterPublicAccounts.find(account=>account.id==='official-library')!,officialPost=applyTwitterDecision(s,defaultContent,official.id,decision('post','','夜の図書館イベントが終了しました。'))!,privatePost=applyTwitterDecision(s,defaultContent,'kaju',decision('post','','私人貼文'))!,reply=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',officialPost.id,'楽しかったです。'))!;
 for(const [created,post] of [publicPost,officialPost,privatePost,reply].entries()){post.date='2026-07-17';post.phase=2;post.created=created+1;}
 const candidates=twitterNewsCandidates(twitterState(s,defaultContent),s.date,s.phase);expect(candidates.map(post=>post.id)).toEqual([officialPost.id,publicPost.id]);
 startTwitterSlot(owner,s,defaultContent);const jobId=`${s.date}:${s.phase}:official-higashiaichi-news`,job=s.twitter!.jobs![jobId];
 expect(job).toMatchObject({actor:'official-higashiaichi-news',status:'scheduled',trigger:{kind:'news-digest'}});expect(job.posts).toEqual([officialPost.id,publicPost.id]);
 const laterPublic=applyTwitterDecision(s,defaultContent,'official-seibunkan',decision('post','','書店からのお知らせ'))!;laterPublic.date='2026-07-17';laterPublic.phase=2;laterPublic.created=5;
 s.twitter!.jobs!['previous-public-job']={actor:'official-seibunkan',date:'2026-07-17',phase:2,due:0,posts:[],status:'scheduled'};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 let requestBody:any;globalThis.fetch=(async(_url:any,init:any)=>{requestBody=JSON.parse(init.body);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_news_batch',arguments:JSON.stringify({articles:[{headline:'夜の図書館に異変？イベント終了後に利用者が語った一言',body:'豊橋市中央図書館は昨夜の催しが終了したと投稿し、参加者から好意的な反応が寄せられた。',sourcePostIds:[officialPost.id]},{headline:'駅前の夜空に珍客！市民が見つけた意外な光景',body:'市民アカウントが昨夜、駅前で珍しい虹を見たと投稿した。',sourcePostIds:[publicPost.id]}]})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,jobId);
 const deferred=await read<GameState>('game:'+owner,s);expect(deferred.twitter!.jobs![jobId].retryCount).toBe(1);expect(requestBody).toBeUndefined();
 deferred.twitter!.jobs!['previous-public-job'].status='done';await write('game:'+owner,deferred);
 await runTwitterJob(owner,s.runId,defaultContent,jobId);const saved=await read<GameState>('game:'+owner,s),reports=Object.values(saved.twitter!.posts).filter(post=>post.author==='official-higashiaichi-news');
 const context=JSON.parse(requestBody.messages.at(-1).content);expect(requestBody.tools.map((tool:any)=>tool.function.name)).toEqual(['twitter_news_batch']);expect(requestBody.messages[0].content).toContain(prompt('twitter.newsDigestSystem'));expect(context.sourceWindow).toEqual({date:'2026-07-17',phase:2});expect(context.sourcePosts).toHaveLength(3);expect(context.sourcePosts.map((post:any)=>post.id)).toEqual(expect.arrayContaining([officialPost.id,publicPost.id,laterPublic.id]));expect(saved.twitter!.jobs![jobId].error).toBeUndefined();expect(reports).toHaveLength(2);expect(reports.every(post=>post.date==='2026-07-18'&&post.phase===0&&/^【.+】\n.+\n#東愛知新聞$/s.test(post.text))).toBe(true);expect(saved.twitter!.jobs![jobId].status).toBe('done');
});

test('Toyohashi City Hall is scheduled to quote a related public account with its own caption',async()=>{
 setup();Math.random=()=>.99;const s=createGame(defaultContent);s.runId='municipal-curation';const city=twitterPublicAccounts.find(account=>account.id==='official-toyohashi-city')!,library=twitterPublicAccounts.find(account=>account.id==='official-library')!;
 const source=applyTwitterDecision(s,defaultContent,library.id,decision('post','','豐橋の讀書を楽しむ常設コーナーをご紹介します。'))!;startTwitterSlot(owner,s,defaultContent);
 const jobId=`${s.date}:${s.phase}:${city.id}`;expect(s.twitter!.jobs![jobId]).toMatchObject({actor:city.id,status:'scheduled'});await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);expect(body.tools[0].function.parameters.properties.action.enum).toEqual(['post','quote','unblock','idle']);expect(body.messages[0].content).toContain(prompt('twitter.municipalCurationSystem'));expect(context.municipalShareCandidates).toEqual([expect.objectContaining({postId:source.id,authorId:library.id})]);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'quote',target:source.id,text:'讀書を通じて豐橋の新しい魅力に触れてみませんか。'})}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,jobId);const saved=await read<GameState>('game:'+owner,s),quote=Object.values(saved.twitter!.posts).find(post=>post.author===city.id&&post.quoteTo===source.id);
 expect(quote?.text).toBe('讀書を通じて豐橋の新しい魅力に触れてみませんか。');expect(saved.twitter!.jobs![jobId].status).toBe('done');
});

test('Toyohashi City Hall cannot use municipal curation to quote player or character posts',async()=>{
 setup();const s=createGame(defaultContent);s.runId='municipal-curation-scope';const city=twitterPublicAccounts.find(account=>account.id==='official-toyohashi-city')!,source=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('post','','個人的公開貼文'))!;
 s.twitter!.jobs={curation:{actor:city.id,date:s.date,phase:s.phase,due:0,posts:[source.id],status:'scheduled'}};await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'quote',target:source.id,text:'市役所配文'})}}]}}]})) as unknown as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'curation');const saved=await read<GameState>('game:'+owner,s);
 expect(saved.twitter!.jobs!.curation.status).toBe('failed');expect(Object.values(saved.twitter!.posts).some(post=>post.author===city.id&&post.quoteTo===source.id)).toBe(false);
});

test('Toyohashi Police is a verified public patrol account without bundled artwork',()=>{
 const police=twitterPublicAccounts.find(account=>account.id==='official-toyohashi-police');expect(police).toMatchObject({name:'豊橋警察署',handle:'toyohashi_pol',patrol:'public-safety'});
 expect(police!.avatar).toBe('');
 expect(police!.cover??'').toBe('');
 const t=twitterState(createGame(defaultContent),defaultContent);expect(t.accounts[police!.id]).toMatchObject({private:false,verified:true,publicAccount:true});
});

test('police patrol is queued for public roots and every reply level but not private roots',async()=>{
 setup();Math.random=()=>1;const s=createGame(defaultContent);s.runId='police-patrol-scope';await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages.at(-1).content);return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(input.request)}}]}}]});}) as typeof fetch;
 const publish=async(text:string,target='')=>{const action=target?'reply':'post',response=await twitterApi(request({...decision(action,target,text),runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);const view=await response.json();return Object.values((view as any).twitter.posts).find((post:any)=>post.author==='kazuhiko'&&post.text===text) as any;};
 const publicRoot=await publish('公開主貼文');const publicReply=await publish('公開串第一層',publicRoot.id);await publish('公開串第二層',publicReply.id);
 let saved=await read<GameState>('game:'+owner,s);saved.twitter!.playerPrivate=true;twitterState(saved,defaultContent);await write('game:'+owner,saved);await publish('私人主貼文');
 saved=await read<GameState>('game:'+owner,s);const patrols=Object.values(saved.twitter!.jobs??{}).filter(job=>job.actor==='official-toyohashi-police'&&job.trigger?.kind==='patrol');
 expect(patrols.map(job=>job.trigger?.text)).toEqual(expect.arrayContaining(['公開主貼文','公開串第一層','公開串第二層']));expect(patrols.some(job=>job.trigger?.text==='私人主貼文')).toBe(false);
});

test('police patrol can reply to a dangerous public-thread event and may idle on harmless content',async()=>{
 setup();const s=createGame(defaultContent);s.runId='police-patrol-decision';const police=twitterPublicAccounts.find(account=>account.patrol==='public-safety')!;
 const root=applyTwitterDecision(s,defaultContent,'anna',decision('post','','公開主貼文'))!,reply=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',root.id,'具體危險內容'))!;
 s.twitter!.jobs={patrol:{actor:police.id,date:s.date,phase:s.phase,due:0,posts:[root.id,reply.id],status:'scheduled',trigger:{kind:'patrol',source:'kazuhiko',postId:reply.id,text:reply.text}}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});await write('stable-diffusion',{enabled:true,modelFamily:'Pony',url:'https://sd.example',checkpoint:'pony.safetensors'});
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body);expect(body.tools.map((tool:any)=>tool.function.name)).toEqual(['twitter_action']);expect(body.tools[0].function.parameters.properties.action.enum).toEqual(['reply','idle']);expect(body.messages[0].content).toContain(prompt('twitter.policePatrolSystem'));expect(body.messages[0].content).not.toContain(prompt('twitter.officialEngagementSystem'));return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('reply',reply.id,'危險行為請立即停止。'))}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'patrol');const saved=await read<GameState>('game:'+owner,s),answer=Object.values(saved.twitter!.posts).find(post=>post.author===police.id&&post.replyTo===reply.id);
 expect(answer?.text).toBe('危險行為請立即停止。');expect(saved.twitter!.jobs!.patrol.status).toBe('done');
});

test('police autonomous posts are limited to one of each topic per day, including old untagged posts',async()=>{
 setup();const s=createGame(defaultContent);s.runId='police-daily-topics';const actor='official-toyohashi-police';
 const older=applyTwitterDecision(s,defaultContent,actor,decision('post','','熱中症を防ぐため、こまめな水分補給を。'))!;
 const job=(advisoryTopic:string)=>({actor,date:s.date,phase:s.phase,due:0,posts:[],status:'scheduled' as const,advisoryTopic});
 s.twitter!.jobs={repeat:job('heat'),newTopic:job('drunk_driving'),offTopic:job('fire')};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 const seen:string[]=[];
 globalThis.fetch=(async(_url:any,init:any)=>{const body=JSON.parse(init.body),context=JSON.parse(body.messages.at(-1).content);seen.push(context.advisoryTopic);expect(body.messages[0].content).toContain(prompt('twitter.policeAdvisorySlot',{topic:context.advisoryTopic}));const text=context.advisoryTopic==='heat'?'熱中症予防のため水分補給を。':'飲酒運転は絶対にやめましょう。';return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify(decision('post','',text))}}]}}]});}) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'repeat');await runTwitterJob(owner,s.runId,defaultContent,'newTopic');await runTwitterJob(owner,s.runId,defaultContent,'offTopic');
 const saved=await read<GameState>('game:'+owner,s),posts=Object.values(saved.twitter!.posts).filter(post=>post.author===actor);
 expect(seen).toEqual(['heat','drunk_driving','fire']);expect(posts).toHaveLength(2);
 expect(posts.find(post=>post.id===older.id)?.advisoryTopic).toBeUndefined();
 expect(posts.find(post=>post.id!==older.id)?.advisoryTopic).toBe('drunk_driving');
 expect(saved.twitter!.jobs!.repeat.status).toBe('done');expect(saved.twitter!.jobs!.newTopic.status).toBe('done');expect(saved.twitter!.jobs!.offTopic.status).toBe('done');
});

test('a directly engaged public account is given a focused community-response decision',async()=>{
 setup();const s=createGame(defaultContent);s.runId='official-engagement';const official=twitterPublicAccounts[0];
 const root=applyTwitterDecision(s,defaultContent,official.id,decision('post','','General public information'))!;
 const reply=applyTwitterDecision(s,defaultContent,'kazuhiko',decision('reply',root.id,'A direct response requiring acknowledgement'))!;
 s.twitter!.jobs={engagement:{actor:official.id,date:s.date,phase:s.phase,due:0,posts:[root.id,reply.id],status:'scheduled',trigger:{kind:'reply',source:'kazuhiko',postId:reply.id,text:reply.text}}};
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});
 globalThis.fetch=(async(_url:any,init:any)=>{
  const body=JSON.parse(init.body);
  expect(body.temperature).toBe(0.55);
  expect(body.tools[0].function.parameters.properties.action.enum).toEqual(['reply','like','block']);
  expect(body.messages[0].content).toContain(prompt('twitter.officialEngagementSystem'));
  return Response.json({choices:[{message:{tool_calls:[{function:{name:'twitter_action',arguments:JSON.stringify({action:'like',target:reply.id,text:''})}}]}}]});
 }) as typeof fetch;
 await runTwitterJob(owner,s.runId,defaultContent,'engagement');
 const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.posts[reply.id].likes[official.id]).toBe(true);expect(saved.twitter!.jobs!.engagement.status).toBe('done');
});

test('retrying a failed player image updates the same post without scheduling another reaction',async()=>{
 setup();const s=createGame(defaultContent);s.runId='retry-image';const post=applyTwitterDecision(s,defaultContent,'kazuhiko',{...decision('post','','重新配這張圖'),image:true},123)!;
 post.imagePending=false;post.imageStatus='配圖失敗或中斷，文字貼文已保留';delete post.imageSession;
 await write('game:'+owner,s);await write('api-settings',{url:'https://model.example/v1',model:'test',key:'test'});await write('stable-diffusion',{enabled:true,modelFamily:'Pony',url:'https://sd.example',checkpoint:'pony.safetensors'});
 globalThis.fetch=(async(url:any,init:any)=>{
  if(String(url).endsWith('/loras'))return Response.json([]);
  if(String(url).endsWith('/txt2img'))return Response.json({images:['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uoAAAAASUVORK5CYII=']});
  const body=JSON.parse(init.body);expect(body.tools.some((tool:any)=>tool.function.name==='generate_scene_image')).toBe(true);
  return Response.json({choices:[{message:{tool_calls:[{function:{name:'generate_scene_image',arguments:JSON.stringify({prompt:'quiet seaside landscape, blue sky, waves',negative_prompt:'people, person, blurry',caption:'海邊風景'})}}]}}]});
 }) as typeof fetch;
 const response=await twitterApi(request({action:'retry-image',target:post.id,text:'',image:false,runId:s.runId,requestId:crypto.randomUUID()}));expect(response.status).toBe(200);
 let saved=s;for(let attempt=0;attempt<100;attempt++){saved=await read<GameState>('game:'+owner,s);if(saved.twitter!.posts[post.id]?.image)break;await Bun.sleep(3);}
 const updated=saved.twitter!.posts[post.id];expect(Object.keys(saved.twitter!.posts)).toEqual([post.id]);expect(updated.image).toMatch(/^\/api\/media\//);expect(updated.created).toBe(123);expect(Object.values(saved.twitter!.jobs??{}).filter(job=>job.trigger?.postId===post.id)).toHaveLength(0);
});
