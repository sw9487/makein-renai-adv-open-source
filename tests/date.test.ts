import {test,expect} from 'bun:test';
import {mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultContent} from '../core/content';
import {createGame} from '../core/engine';
import {answerDateInvitation,confirmDateInvitation,createDateInvitation,createDateInvitationMessage} from '../server/date-invitation';
import {initializeRuntime} from '../server/runtime';
import {addOfficialPlaces,officialPlaces,officialPlacesPackId,repairOfficialPlaceIds} from '../core/official-places';
import {upgradeStories} from '../core/story';

test('official Twitter locations are editable encounter places with local generated backgrounds',()=>{
 expect(defaultContent.storyPacks).toContain(officialPlacesPackId);
 for(const expected of officialPlaces){const place=defaultContent.places.find(item=>item.id===expected.id);expect(place).toBeDefined();expect(place!.background).toBe(expected.background);expect(Object.keys(place!.weights).length).toBeGreaterThan(0);}
 const edited=structuredClone(defaultContent);edited.places=edited.places.filter(place=>place.id!==officialPlaces[0].id);expect(upgradeStories(edited).places.some(place=>place.id===officialPlaces[0].id)).toBe(false);
});

test('a game location never reuses a Twitter cover and every generated location file exists',()=>{
 for(const place of officialPlaces){
  expect(place.background.startsWith('/assets/places-official/')).toBe(true);
  expect(existsSync(join(import.meta.dir,'../web/public',place.background))).toBe(true);
 }
 const old=structuredClone(defaultContent),place=old.places.find(item=>item.id==='uno-uno')!;
 old.storyPacks=old.storyPacks?.filter(id=>id!==officialPlacesPackId);
 place.background='/assets/twitter-official/covers/uno-uno.jpg';
 const asset=old.assets.find(item=>item.id==='scene-uno-uno')!;asset.url=place.background;
 const upgraded=addOfficialPlaces(old);
 expect(upgraded.places.find(item=>item.id==='uno-uno')?.background).toBe('/assets/places-official/uno-uno.png');
 expect(upgraded.assets.find(item=>item.id==='scene-uno-uno')?.url).toBe('/assets/places-official/uno-uno.png');
});

test('official place v2 migrates the incorrect Gusto name and every persisted reference',()=>{
 const old=structuredClone(defaultContent);old.storyPacks=(old.storyPacks??[]).filter(id=>id!==officialPlacesPackId);old.storyPacks.push('twitter-official-places-v1');
 const gusto=old.places.find(place=>place.id==='gusto-hashira')!;gusto.id='gusto-kaimei';gusto.name='ガスト 豊橋開明店';
 old.events[0].place='gusto-kaimei';
 const upgraded=addOfficialPlaces(old);
 expect(upgraded.places.some(place=>place.id==='gusto-kaimei')).toBe(false);
 expect(upgraded.places.find(place=>place.id==='gusto-hashira')?.name).toBe('ガスト 豊橋橋良店');
 expect(upgraded.events[0].place).toBe('gusto-hashira');
 const state=createGame(upgraded);state.location='gusto-kaimei';state.pendingDateInvitation={character:'kaju',place:'gusto-kaimei',text:'test'};state.pendingDate={character:'kaju',place:'gusto-kaimei',accepted:true};
 expect(repairOfficialPlaceIds(state)).toBe(true);expect(state.location).toBe('gusto-hashira');expect(state.pendingDateInvitation.place).toBe('gusto-hashira');expect(state.pendingDate.place).toBe('gusto-hashira');
});

test('date invitation exposes the sent player message before generating the character reply',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'date-invite-stages-')),port:19532,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'test'}}),original=globalThis.fetch;
 try{
  let calls=0;globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{calls++;const body=JSON.parse(String(init?.body)),name=body.tools[0].function.name;return Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:JSON.stringify(name==='write_date_invitation'?{text:'現在要不要一起去吃點心？'}:{text:'好啊，我很期待！',accepted:true})}}]}}]});},{preconnect:original.preconnect});
  const state=createGame(defaultContent);state.phase=1;state.location='home';state.dialogue={speaker:'系統',text:'自由行動'};
  const sent=await createDateInvitationMessage(state,defaultContent,'kaju','gusto-hashira');
  expect(calls).toBe(1);expect(sent.pendingDateInvitation).toEqual({character:'kaju',place:'gusto-hashira',text:'現在要不要一起去吃點心？'});expect(sent.pendingDate).toBeUndefined();expect(sent.messages.kaju.at(-1)?.from).toBe('player');expect(sent.messages.kaju.at(-1)?.text).toBe('現在要不要一起去吃點心？');
  const answered=await answerDateInvitation(sent,defaultContent);
  expect(calls).toBe(2);expect(answered.pendingDateInvitation).toBeUndefined();expect(answered.pendingDate).toEqual({character:'kaju',place:'gusto-hashira',accepted:true});expect(answered.messages.kaju.at(-1)?.from).toBe('kaju');expect(answered.messages.kaju.at(-1)?.text).toBe('好啊，我很期待！');
 }finally{globalThis.fetch=original;close();}
});

test('date invitation uses two tool calls and waits for player confirmation before transition',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'date-invite-')),port:19531,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'test'}}),original=globalThis.fetch;
 try{
  let calls=0;globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{calls++;const body=JSON.parse(String(init?.body)),name=body.tools[0].function.name;return Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:JSON.stringify(name==='write_date_invitation'?{text:'現在要不要一起去吃點心？'}:{text:'好啊，我很期待！',accepted:true})}}]}}]});},{preconnect:original.preconnect});
  const state=createGame(defaultContent);state.phase=1;state.location='home';state.dialogue={speaker:'旁白',text:'自由時間'};
  const invited=await createDateInvitation(state,defaultContent,'kaju','gusto-hashira');
  expect(calls).toBe(2);expect(invited.location).toBe('home');expect(invited.phase).toBe(1);expect(invited.pendingDate).toEqual({character:'kaju',place:'gusto-hashira',accepted:true});expect(invited.messages.kaju.slice(-2).map(message=>message.text)).toEqual(['現在要不要一起去吃點心？','好啊，我很期待！']);
  const confirmed=confirmDateInvitation(invited,defaultContent);expect(confirmed.pendingDate).toBeUndefined();expect(confirmed.location).toBe('gusto-hashira');expect(confirmed.character).toBe('kaju');expect(confirmed.flags).toContain(`visited:${state.date}:${state.phase}`);
  const declined=confirmDateInvitation({...invited,pendingDate:{...invited.pendingDate!,accepted:false}},defaultContent);expect(declined.phase).toBe(2);expect(declined.location).toBe('home');
 }finally{globalThis.fetch=original;close();}
});
