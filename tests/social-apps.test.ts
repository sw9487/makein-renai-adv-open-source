import {expect,test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGame,act} from '../core/engine';
import {defaultContent} from '../core/content';
import {socialAppEnabled} from '../core/social-apps';
import {startTwitterSlot} from '../server/twitter';
import {startProactiveLine} from '../server/proactive-line';
import {startServer} from '../server/http';
import {read,write} from '../server/repository';
import type {GameState} from '../core/types';

test('social apps default on for new and older saves, but disabled LINE cannot be exchanged',()=>{
 const state=createGame(defaultContent);
 expect(socialAppEnabled(state,'line')).toBe(true);
 expect(socialAppEnabled(state,'twitter')).toBe(true);
 delete state.socialApps;
 expect(socialAppEnabled(state,'line')).toBe(true);
 state.socialApps={line:false,twitter:false};
 state.character='anna';state.met.push('anna');state.affection.anna=100;state.dialogue.choices=undefined;
 expect(()=>act(state,defaultContent,{type:'contact'})).toThrow('LINE 已停用。');
 const before=Object.keys(state.twitter?.jobs??{}).length;
 startTwitterSlot('test',state,defaultContent);
 expect(Object.keys(state.twitter?.jobs??{})).toHaveLength(before);
 startProactiveLine('test',state,defaultContent)(false);
 expect(state.flags.some(flag=>flag.startsWith('proactive-line:'))).toBe(false);
});

test('game settings stop both social APIs and survive a new story',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'social-switch-'));
 const app=startServer({dataDir:directory,clientDir:directory,port:0,env:{},version:'test'});
 try{
  const owner='e'.repeat(64),initial=createGame(defaultContent);initial.runId='social-switch';
  await write('game:'+owner,initial);
  const base=`http://127.0.0.1:${app.server.port}`;
  const headers={cookie:'makeine_player='+owner,origin:base,'Content-Type':'application/json'};
  const stateOnly=await fetch(base+'/api/game?state-only=1',{headers}).then(response=>response.json());
  expect(stateOnly.state.runId).toBe(initial.runId);
  expect((await read<GameState>('game:'+owner,initial)).twitter?.jobs).toBeUndefined();
  initial.pendingDate={character:'anna',place:'station',accepted:true};await write('game:'+owner,initial);
  const blocked=await fetch(base+'/api/game',{method:'POST',headers,body:JSON.stringify({type:'social-settings',app:'line',enabled:false,revision:initial.revision,runId:initial.runId})});
  expect(blocked.status).toBe(400);
  delete initial.pendingDate;await write('game:'+owner,initial);
  const change=async(appName:'line'|'twitter',enabled:boolean,revision:number)=>{
   const response=await fetch(base+'/api/game',{method:'POST',headers,body:JSON.stringify({type:'social-settings',app:appName,enabled,revision,runId:initial.runId})});
   expect(response.status).toBe(200);return (await response.json()).state as GameState;
  };
  const afterLine=await change('line',false,initial.revision);
  expect(afterLine.socialApps?.line).toBe(false);
  const afterTwitter=await change('twitter',false,initial.revision);
  expect(afterTwitter.socialApps).toEqual({line:false,twitter:false});
  expect((await fetch(base+'/api/twitter',{headers})).status).toBe(403);
  const chat=await fetch(base+'/api/game',{method:'POST',headers,body:JSON.stringify({type:'chat',channel:'line',character:'kaju',text:'Hi',revision:afterTwitter.revision,runId:initial.runId})});
  expect(chat.status).toBe(400);
  const fresh=await fetch(base+'/api/game',{method:'POST',headers,body:JSON.stringify({type:'new',revision:afterTwitter.revision,runId:initial.runId})});
  expect(fresh.status).toBe(200);
  expect((await fresh.json()).state.socialApps).toEqual({line:false,twitter:false});
  expect((await read<GameState>('game:'+owner,initial)).socialApps).toEqual({line:false,twitter:false});
 }finally{await app.stop();rmSync(directory,{recursive:true,force:true});}
});
