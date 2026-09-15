import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from '../server/http';
import {write,read} from '../server/repository';
import {createGame} from '../core/engine';
import {defaultContent} from '../core/content';
import {applyTwitterDecision} from '../server/twitter';
import type {GameState} from '../core/types';
import {runTwitterJob} from '../server/twitter';

test('new story resets active history and restores every default mutual follow through HTTP',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'twitter-reset-')),app=startServer({dataDir:dir,clientDir:dir,port:0,env:{},version:'test'});
 try{
  const owner='c'.repeat(64),s=createGame(defaultContent);s.runId='old-story';s.date='2027-02-20';s.phase=2;s.location='station';s.character='lemon';s.affection={anna:99};s.met=['anna','kaju','lemon'];s.contacts=['kaju','lemon'];s.completed=['old-event'];s.flags=['old-flag'];s.gallery=['old-cg'];s.log=[{date:s.date,speaker:'旁白',text:'old-log'}];s.ended=true;s.ending='love:anna';s.route='anna';s.storyIllustration={scene:'old-scene',remaining:0,recent:[]};s.seenEndings=['old-ending'];s.memories.anna={summary:'old-memory',facts:[],recent:[],turns:1};s.messages.anna=[{from:'anna',text:'old-message',date:s.date}];
  s.twitter!.following={kazuhiko:{anna:true}};s.twitter!.playerPrivate=true;s.twitter!.npcInteractions={old:9};s.twitter!.requests={anna:{kazuhiko:true}};
  applyTwitterDecision(s,defaultContent,'anna',{action:'post',target:'',text:'old-post',image:false});
  s.twitter!.jobs={old:{actor:'anna',date:s.date,phase:s.phase,posts:[],due:0,status:'scheduled'}};
  await write('image-job:'+owner,{pending:false,status:'succeeded',url:'/api/media/old-story.png',created:1});
  await write('game:'+owner,s);const base=`http://127.0.0.1:${app.server.port}`,headers={cookie:'makeine_player='+owner,origin:base,'Content-Type':'application/json'};
  const response=await fetch(base+'/api/game',{method:'POST',headers,body:JSON.stringify({type:'new',runId:s.runId,revision:s.revision})});expect(response.status).toBe(200);
  const body=await response.json(),next=body.state;expect(next.runId).not.toBe(s.runId);expect(next.date).toBe(defaultContent.settings.startDate);expect(next.phase).toBe(1);expect(next.location).toBe('cafe');expect(next.character).toBe('anna');expect(next.affection).toEqual({});expect(next.met).toEqual(['anna','kaju']);expect(next.contacts).toEqual(['kaju']);expect(next.completed).toEqual([]);expect(next.flags).not.toContain('old-flag');expect(next.gallery).toEqual([]);expect(next.log.some((entry:any)=>entry.text==='old-log')).toBe(false);expect(next.ended).toBe(false);expect(next.ending).toBe('');expect(next.route).toBe('');expect(next.storyIllustration).toBeUndefined();expect(next.seenEndings).toEqual([]);expect(next.messages.anna).toBeUndefined();expect(JSON.stringify(next.memories)).not.toContain('old-memory');expect(body.twitterReadKey).toBe('');expect(await read('image-job:'+owner,null)).toBeNull();
  const view=await fetch(base+'/api/twitter',{headers}).then(r=>r.json());expect(view.twitter.posts).toEqual({});expect(view.twitter.requests.anna?.kazuhiko).not.toBe(true);expect(view.twitter.accounts.kazuhiko.private).toBe(false);
  const groups=[['kaju','kazuhiko'],['asami','kaju'],['anna','sosuke'],['sosuke','karen'],['tamaki','koto','komari'],['mitsuki','chihaya'],['lemon','mitsuki'],['amanatsu','konuki'],['hibari','tiara']];
  for(const group of groups)for(const from of group)for(const to of group)if(from!==to)expect(view.twitter.following[from]?.[to]).toBe(true);
  expect(view.twitter.online.length).toBeGreaterThan(0);await runTwitterJob(owner,s.runId,defaultContent,'old');
  const saved=await read<GameState>('game:'+owner,s);expect(saved.twitter!.posts).toEqual({});expect(saved.twitter!.jobs!.old).toBeUndefined();expect(saved.twitter!.npcInteractions).toBeUndefined();
 }finally{await app.stop();rmSync(dir,{recursive:true,force:true});}
});

test('real HTTP router persists privacy and NPC limit and enforces private follow requests',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'twitter-http-')),app=startServer({dataDir:dir,clientDir:dir,port:0,env:{},version:'test'});
 try{
  const owner='b'.repeat(64),s=createGame(defaultContent);s.runId='http-twitter';await write('game:'+owner,s);
  const base=`http://127.0.0.1:${app.server.port}`,headers={cookie:'makeine_player='+owner,origin:base,'Content-Type':'application/json'};
  const patch=await fetch(base+'/api/twitter',{method:'PATCH',headers,body:JSON.stringify({runId:s.runId,playerPrivate:true,npcInteractionLimit:0})});
  expect(patch.status).toBe(200);const body=await patch.json();expect(body.twitter.accounts.kazuhiko.private).toBe(true);expect(body.twitter.npcInteractionLimit).toBe(0);expect(body.notice).toBeUndefined();
  const saved=await read<GameState>('game:'+owner,s);applyTwitterDecision(saved,defaultContent,'anna',{action:'follow',target:'kazuhiko',text:'',image:false});await write('game:'+owner,saved);
  expect(saved.twitter!.following.anna.kazuhiko).not.toBe(true);expect(saved.twitter!.requests.kazuhiko.anna).toBe(true);
  const accept=await fetch(base+'/api/twitter',{method:'POST',headers,body:JSON.stringify({runId:s.runId,requestId:crypto.randomUUID(),action:'accept',target:'anna',text:'',image:false})});
  expect(accept.status).toBe(200);const accepted=await accept.json();expect(accepted.twitter.following.anna.kazuhiko).toBe(true);expect(accepted.notice).toBeUndefined();
  const publicResponse=await fetch(base+'/api/twitter',{method:'PATCH',headers,body:JSON.stringify({runId:s.runId,playerPrivate:false,npcInteractionLimit:7})});expect(publicResponse.status).toBe(200);const publicBody=await publicResponse.json();expect(publicBody.twitter.accounts.kazuhiko.private).toBe(false);expect(publicBody.notice).toBeUndefined();
  expect((await read<GameState>('game:'+owner,s)).twitter!.npcInteractionLimit).toBe(7);
  const invalid=await fetch(base+'/api/twitter',{method:'PATCH',headers,body:JSON.stringify({runId:s.runId,npcInteractionLimit:-1})});expect(invalid.status).toBe(400);
 }finally{await app.stop();rmSync(dir,{recursive:true,force:true});}
});

test('player can follow Higashi Aichi Shimbun as a verified public account over HTTP',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'twitter-news-follow-')),app=startServer({dataDir:dir,clientDir:dir,port:0,env:{},version:'test'});
 try{
  const player='d'.repeat(64),state=createGame(defaultContent);state.runId='news-follow';await write('game:'+player,state);
  const base=`http://127.0.0.1:${app.server.port}`,headers={cookie:'makeine_player='+player,origin:base,'Content-Type':'application/json'};
  const initial=await fetch(base+'/api/twitter',{headers}).then(response=>response.json());
  expect(initial.twitter.accounts['official-higashiaichi-news']).toMatchObject({private:false,verified:true,publicAccount:true});
  const response=await fetch(base+'/api/twitter',{method:'POST',headers,body:JSON.stringify({runId:state.runId,requestId:crypto.randomUUID(),action:'follow',target:'official-higashiaichi-news',text:'',image:false})});
  expect(response.status).toBe(200);const result=await response.json();expect(result.twitter.following.kazuhiko['official-higashiaichi-news']).toBe(true);
  const reloaded=await fetch(base+'/api/twitter',{headers}).then(reply=>reply.json());expect(reloaded.twitter.following.kazuhiko['official-higashiaichi-news']).toBe(true);
 }finally{await app.stop();rmSync(dir,{recursive:true,force:true});}
});
