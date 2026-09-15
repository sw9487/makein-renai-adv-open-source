import { test,expect } from 'bun:test';
import { mkdtempSync,rmSync,existsSync,readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultContent } from '../core/content';
import { createGame,act } from '../core/engine';
import { roleLabel,schoolLabel } from '../core/timeline';
import { parseCharacterReply } from '../server/character-tool';
import { initializeRuntime } from '../server/runtime';
import { converse } from '../server/chat';
import { validateContent } from '../server/validation';
import { upgradeStories } from '../core/story';
import {repairPortraits} from '../core/roster';
import {twitterState} from '../core/twitter';
import { localizeImages } from '../server/localize-images';
import {prompt} from '../server/prompt';
const response=(value:unknown)=>({choices:[{message:{tool_calls:[{type:'function',function:{name:'present_character_reply',arguments:JSON.stringify(value)}}]}}]});

test('tool separates speech and optional inner thoughts; malformed prose is rejected',()=>{
 const reply={speech:'謝謝你等我。',narration:'她收起筆記。',thought:'原來他還記得。'};
 expect(parseCharacterReply(response(reply))).toEqual(reply);
 expect(parseCharacterReply(response(reply),true)).toEqual({speech:reply.speech,narration:'',thought:null});
 expect(parseCharacterReply({choices:[{message:{content:'她說：「謝謝。」'}}]})).toEqual({speech:'她說：「謝謝。」',narration:'',thought:null});
 expect(()=>parseCharacterReply({choices:[{message:{}}]})).toThrow('工具');
 expect(()=>parseCharacterReply(response({...reply,thought:45}))).toThrow();
 expect(()=>parseCharacterReply(response({...reply,speech:''}))).toThrow();
});

test('character reply tool accepts only configured expression names',()=>{
 const base={speech:'I understand.',narration:'',thought:null};
 expect(parseCharacterReply(response({...base,expression:'shy'})).expression).toBe('shy');
 expect(parseCharacterReply(response(base)).expression).toBeUndefined();
 expect(()=>parseCharacterReply(response({...base,expression:'furious'}))).toThrow();
});

test('unchanged saved portraits receive bundled expressions without replacing custom sprites',()=>{
 const saved=structuredClone(defaultContent);
 const anna=saved.characters.find(ch=>ch.id==='anna')!;
 const normal=anna.sprites.normal;
 anna.sprites={normal};
 expect(repairPortraits(saved).characters.find(ch=>ch.id==='anna')?.sprites.crying).toBeDefined();
 anna.sprites={normal,crying:'/assets/authored/custom.png'};
 expect(repairPortraits(saved).characters.find(ch=>ch.id==='anna')?.sprites.crying).toBe('/assets/authored/custom.png');
 anna.sprites={normal:'/assets/authored/custom.png'};
 expect(repairPortraits(saved).characters.find(ch=>ch.id==='anna')?.sprites.happy).toBeUndefined();
});

test('face-to-face reply exposes only available sprites and saves the selected expression',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'makein-expression-test-'));
 const close=initializeRuntime({dataDir:dir,port:19490,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const originalFetch=globalThis.fetch;
 let request:any;
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{
  request=JSON.parse(String(init?.body));
  return Response.json(response({speech:'That makes me happy!',narration:'',thought:null,expression:'happy'}));
 }) as unknown as typeof fetch;
 try{
  const content=structuredClone(defaultContent);
  const anna=content.characters.find(ch=>ch.id==='anna')!;
  anna.sprites={normal:anna.sprites.normal,happy:'/assets/authored/00000000-0000-4000-8000-000000000021.png'};
  const state=createGame(content);
  state.date='2027-07-01';state.phase=1;state.character='anna';state.met.push('anna');delete state.dialogue.choices;
  const result=await converse(state,content,'anna','Good news!','talk');
  expect(request.tools[0].function.parameters.properties.expression.enum).toEqual(['normal','happy']);
  expect(result.state.dialogue.expression).toBe('happy');
  expect(result.state.dialogue.script?.slice().reverse().find(line=>line.kind==='speech'&&line.speaker===anna.name)?.expression).toBe('happy');
  expect(result.state.dialogue.kind).toBe('chat');
 }finally{globalThis.fetch=originalFetch;close();if(resolve(dir).startsWith(resolve(tmpdir())))rmSync(dir,{recursive:true,force:true});}
});

test('LINE can mark a message read without sending a character reply',async()=>{
 const silent={memoryFacts:[],needs_narration:false,needs_thought:false,speech:'',narration:'',thought:null,affectionDelta:0,twitterPost:null,respond:false,conversationClosed:true};
 expect(parseCharacterReply(response(silent),true)).toMatchObject({speech:'',respond:false,conversationClosed:true});
 expect(()=>parseCharacterReply(response({...silent,speech:'無聲但仍有台詞'}),true)).toThrow('角色工具欄位不正確');
 const dir=mkdtempSync(join(tmpdir(),'makein-line-read-test-'));
 const close=initializeRuntime({dataDir:dir,port:19489,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const originalFetch=globalThis.fetch;
 const requests:any[]=[];
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{requests.push(JSON.parse(String(init?.body)));return Response.json(response(silent));}) as unknown as typeof fetch;
 try{
  const s=createGame(defaultContent);s.date='2027-07-01';s.phase=1;s.met.push('tiara');s.contacts.push('tiara');
  const result=await converse(s,defaultContent,'tiara','那先這樣，晚安。','line');
  expect(result.reply).toBe('');
  expect(result.performance.respond).toBe(false);
  expect(result.state.messages.tiara).toHaveLength(1);
  expect(result.state.messages.tiara[0]).toMatchObject({from:'player',text:'那先這樣，晚安。',conversationClosed:true});
  expect(result.state.messages.tiara[0].readByCharacterAt).toBeNumber();
  expect(result.state.memories.tiara.recent.map(message=>message.role)).toEqual(['user']);
  expect(requests.at(-1).messages[0].content).toContain(prompt('chat.linePacing'));
  expect(requests.at(-1).messages[0].content).not.toContain(prompt('chat.pacing'));
 }finally{globalThis.fetch=originalFetch;close();if(resolve(dir).startsWith(resolve(tmpdir())))rmSync(dir,{recursive:true,force:true});}
});

test('LINE reply can follow the player, publish a post, and send an additional message in one turn',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'makein-line-actions-test-'));
 const close=initializeRuntime({dataDir:dir,port:19491,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const originalFetch=globalThis.fetch;
 let request:any;
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{request=JSON.parse(String(init?.body));return Response.json(response({speech:'我現在追蹤你了。',narration:'',thought:null,respond:true,actions:[{kind:'twitter_follow',target:'kazuhiko',text:''},{kind:'twitter_post',target:'',text:'今天有件開心的事。'},{kind:'line_message',target:'kazuhiko',text:'下次再聊！'}]}));}) as unknown as typeof fetch;
 try{
  const s=createGame(defaultContent);s.date='2027-07-01';s.phase=1;s.met.push('anna');s.contacts.push('anna');
  const t=twitterState(s,defaultContent);t.accounts.kazuhiko.private=false;(t.following.anna??={}).kazuhiko=false;
  const result=await converse(s,defaultContent,'anna','那你會追蹤我嗎？','line');
  expect(request.tools[0].function.parameters.properties.actions.items.properties.kind.enum).toContain('twitter_follow');
  expect(request.tools[0].function.parameters.properties.actions.items.properties.image.type).toBe('boolean');
  expect(request.messages[0].content).toContain('followingPlayer');
  expect(request.messages[0].content).toContain('\"handle\":\"kazuhiko\"');
  expect(request.messages[0].content).toContain('\"mutual\":');
  expect(result.state.twitter?.following.anna.kazuhiko).toBe(true);
  expect(Object.values(result.state.twitter!.posts).some(post=>post.author==='anna'&&post.text==='今天有件開心的事。')).toBe(true);
  expect(result.state.messages.anna.map(message=>message.text)).toEqual(['那你會追蹤我嗎？','我現在追蹤你了。','下次再聊！']);
  expect(t.following.anna.kazuhiko).toBe(false);
 }finally{globalThis.fetch=originalFetch;close();if(resolve(dir).startsWith(resolve(tmpdir())))rmSync(dir,{recursive:true,force:true});}
});

test('private player receives a follow request, and a blocked follow commits no LINE turn',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'makein-private-follow-test-'));
 const close=initializeRuntime({dataDir:dir,port:19492,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(async()=>Response.json(response({speech:'追蹤請求已送出。',narration:'',thought:null,respond:true,actions:[{kind:'twitter_follow',target:'kazuhiko',text:''}]}))) as unknown as typeof fetch;
 try{
  const s=createGame(defaultContent);s.date='2027-07-01';s.phase=1;s.met.push('anna');s.contacts.push('anna');
  const t=twitterState(s,defaultContent);t.playerPrivate=true;(t.following.anna??={}).kazuhiko=false;
  const result=await converse(s,defaultContent,'anna','追蹤我吧。','line');
  expect(result.state.twitter?.requests.kazuhiko.anna).toBe(true);
  expect(result.state.twitter?.following.anna.kazuhiko).toBe(false);
  (t.blocks??={}).kazuhiko={anna:true};
  await expect(converse(s,defaultContent,'anna','追蹤我吧。','line')).rejects.toThrow();
  expect(s.messages.anna).toBeUndefined();
  expect(t.requests.kazuhiko?.anna).toBeFalsy();
 }finally{globalThis.fetch=originalFetch;close();if(resolve(dir).startsWith(resolve(tmpdir())))rmSync(dir,{recursive:true,force:true});}
});

test('face-to-face chat executes several social actions without replacing its scene dialogue',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'makein-talk-actions-test-'));
 const close=initializeRuntime({dataDir:dir,port:19493,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(async()=>Response.json(response({speech:'等會兒我也在 LINE 跟你說。',narration:'',thought:null,actions:[{kind:'twitter_follow',target:'kazuhiko',text:''},{kind:'line_message',target:'kazuhiko',text:'這是另外一則私訊。'}]}))) as unknown as typeof fetch;
 try{
  const s=createGame(defaultContent);s.date='2027-07-01';s.phase=1;s.character='anna';s.met.push('anna');s.contacts.push('anna');delete s.dialogue.choices;
  const t=twitterState(s,defaultContent);t.playerPrivate=false;(t.following.anna??={}).kazuhiko=false;
  const result=await converse(s,defaultContent,'anna','待會 LINE 聯絡吧。','talk');
  expect(result.state.dialogue.text).toBe('等會兒我也在 LINE 跟你說。');
  expect(result.state.twitter?.following.anna.kazuhiko).toBe(true);
  expect(result.state.messages.anna.at(-1)).toMatchObject({from:'anna',text:'這是另外一則私訊。'});
 }finally{globalThis.fetch=originalFetch;close();if(resolve(dir).startsWith(resolve(tmpdir())))rmSync(dir,{recursive:true,force:true});}
});

test('character tool rejects malformed or duplicate ordered actions',()=>{
 const base={speech:'知道了。',narration:'',thought:null};
 expect(()=>parseCharacterReply(response({...base,actions:[{kind:'twitter_follow',target:'kazuhiko',text:'invalid'}]}),true)).toThrow();
 expect(()=>parseCharacterReply(response({...base,actions:[{kind:'twitter_follow',target:'kazuhiko',text:''},{kind:'twitter_follow',target:'kazuhiko',text:''}]}),true)).toThrow();
 expect(()=>parseCharacterReply(response({...base,actions:[{kind:'twitter_post',target:'kazuhiko',text:'invalid'}]}),true)).toThrow();
 expect(parseCharacterReply(response({...base,actions:[{kind:'twitter_post',target:'',text:'photo post',image:true}]}),true).actions?.[0]).toMatchObject({kind:'twitter_post',image:true});
});

test('roles change at club/council handover, not automatically on school promotion',()=>{
 const c=defaultContent,s=createGame(c),ch=(id:string)=>c.characters.find(ch=>ch.id===id)!;
 s.date='2026-10-01';expect(roleLabel(ch('komari'),s,c)).toContain('次期部長');
 s.date='2026-11-01';expect(roleLabel(ch('komari'),s,c)).toBe('文藝部部長（交接期）');
 s.date='2026-11-08';expect(roleLabel(ch('komari'),s,c)).toBe('文藝部副部長');expect(roleLabel(ch('kazuhiko'),s,c)).toBe('文藝部部長');
 s.date='2027-04-01';expect(roleLabel(ch('tiara'),s,c)).toBe('學生會副會長');expect(roleLabel(ch('tamaki'),s,c)).toContain('大學生');
 s.date='2027-07-01';expect(roleLabel(ch('tiara'),s,c)).toBe('學生會會長');expect(roleLabel(ch('hiroto'),s,c)).toBe('學生會副會長');
 s.date='2028-04-01';expect(schoolLabel(ch('kaju'),s,c)).toContain('已畢業');expect(roleLabel(ch('kaju'),s,c)).not.toContain('副會長');
});

test('all built-in stories have context and portable images; custom editor scripts survive migration',()=>{
 for(const e of defaultContent.events){expect(e.text.length).toBeGreaterThan(180);expect(e.script!.length).toBeGreaterThan(2);}
 const c=structuredClone(defaultContent);c.events[0].script=[{kind:'speech',speaker:'八奈見杏菜',text:'我的自訂故事'}];
 expect(validateContent(c).events[0].script).toEqual(c.events[0].script);
 expect(upgradeStories(c).events[0].script).toEqual(c.events[0].script);
 for(const ch of c.characters) for(const url of [ch.avatar,...Object.values(ch.sprites)]) if(url){
  expect(url).toStartWith('/assets/authored/');expect(existsSync(join(import.meta.dir,'../content/assets',url.slice('/assets/authored/'.length)))).toBe(true);
 }
});

test('every built-in character has all packaged transparent PNG expression sprites',async()=>{
 const keys=['normal','happy','angry','sad','surprised','shy','suspicious','crying','enduring','cold','awkward','flustered','flushed','smug','inviting','excited','disdainful','troubled','dazed','faint','breakdown'];
 for(const ch of defaultContent.characters){
  expect(Object.keys(ch.sprites)).toEqual(keys);
  for(const key of keys.slice(1)){
   const path=join(import.meta.dir,'../content/assets',ch.sprites[key].slice('/assets/authored/'.length));
   expect(existsSync(path)).toBe(true);
   const header=new Uint8Array(await Bun.file(path).slice(0,26).arrayBuffer());
   expect(header[25]).toBe(6); // PNG true-colour with alpha
  }
 }
});

test('AI requests use tools and current school identities; LINE and memories never receive private thoughts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'makein-chat-test-'));
 const close=initializeRuntime({dataDir:dir,port:19488,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test-only',AI_MODEL:'mock'}});
 const originalFetch=globalThis.fetch;
 const requests:any[]=[];
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{requests.push(JSON.parse(String(init?.body)));return Response.json(response({speech:'這份申請我看過了。',narration:'她闔上資料夾。',thought:'他願意幫忙，真好。'}));}) as unknown as typeof fetch;
 try{
  const c=defaultContent;let s=act(createGame(c),c,{type:'choose',index:0});s.date='2027-07-01';s.phase=1;s.character='tiara';s.met.push('tiara');s.contacts.push('tiara');
  // Exercise the rare allowed-details path deterministically.
  const {detailPolicy}=await import('../server/chat-detail');
  for(let seed=0;seed<100000;seed++){
   const policy=detailPolicy({...s,seed},'tiara',s.memories.tiara?.turns??0,false);
   if(policy.narration&&policy.thought){s.seed=seed;break;}
  }
  const result=await converse(s,c,'tiara','申請表還有哪裡需要修正？','talk');
  expect(requests[0].tool_choice.function.name).toBe('present_character_reply');
  expect(requests[0].messages[0].content).toContain('學生會會長');
  expect(requests[0].messages[0].content).toContain('石蕗高中2年級');
  expect(result.state.dialogue.text).toBe('這份申請我看過了。');
  expect(result.state.dialogue.thought).toBe('他願意幫忙，真好。');
  const playerName=c.characters.find(ch=>ch.id==='kazuhiko')!.name;
  expect(result.state.dialogue.script).toContainEqual({kind:'speech',speaker:playerName,text:'申請表還有哪裡需要修正？'});
  expect(result.state.dialogue.script).toContainEqual({kind:'speech',speaker:'馬剃天愛星',text:'這份申請我看過了。',expression:'normal'});
  const second=await converse(result.state,c,'tiara','我明天再帶過來。','talk');
  const recess={...second.state,date:'2027-07-05',phase:0};
  const recessChat=await converse(recess,c,'tiara','下課時間聊一下吧。','talk');
  expect(recessChat.state.dialogue.kind).toBe('chat');
  expect(recessChat.state.phase).toBe(0);
  expect(recessChat.state.date).toBe(recess.date);
  await expect(converse({...recess,character:''},c,'tiara','有人在嗎？','talk')).rejects.toThrow('對方目前不在現場。');
  expect(second.state.dialogue.script).toContainEqual({kind:'speech',speaker:playerName,text:'申請表還有哪裡需要修正？'});
  expect(second.state.dialogue.script).toContainEqual({kind:'speech',speaker:playerName,text:'我明天再帶過來。'});
  expect(JSON.stringify(result.state.memories)).not.toContain('他願意幫忙，真好。');
  const line=await converse(result.state,c,'tiara','謝謝妳。','line');
  expect(requests.at(-1).messages[0].content).toContain(prompt('chat.line.present',{place:c.places.find(p=>p.id===result.state.location)?.name}));
  expect(line.state.messages.tiara.at(-1)!.text).toBe('這份申請我看過了。');
  expect(requests.at(-1).messages[0].content).not.toContain('他願意幫忙，真好。');
  await converse({...result.state,character:'anna'},c,'tiara','下次見。','line');
  expect(requests.at(-1).messages[0].content).toContain(prompt('chat.line.remote'));
  expect(requests.at(-1).messages[0].content).toContain('"channel":"line","faceToFace":false');
  for(const phase of [0,1,2]){
   const daytime=structuredClone(result.state);daytime.date='2027-07-05';daytime.phase=phase;
   daytime.dialogue.choices=[{text:'尚未選擇',delta:0,reply:'後續'}];
   const chatted=await converse(daytime,c,'tiara','隨時問候。','line');
   expect(chatted.state.dialogue).toEqual(daytime.dialogue);
   expect(chatted.state.phase).toBe(phase);expect(chatted.state.date).toBe(daytime.date);
   expect(chatted.state.messages.tiara.at(-2)!.text).toBe('隨時問候。');
  }
  const snapshot=JSON.stringify(s);
  const eligible=structuredClone(result.state);
  eligible.memories.tiara.turns=3;eligible.seed=2000;
  const generated={speech:'你想先看哪一份？',narration:'她攤開兩份資料。',thought:null,affectionDelta:2,choices:[{text:'先看申請表。',reply:'她把申請表推到你面前。',delta:2},{text:'先看活動表。',reply:'她翻開活動表。',delta:-1}]};
  globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{
    const request=JSON.parse(String(init?.body));requests.push(request);
    const enabled=request.tools.some((t:any)=>t.function.name==='present_character_choices');
    return Response.json(enabled?{choices:[{message:{tool_calls:[{function:{name:'present_character_choices',arguments:JSON.stringify(generated)}}]}}]}:response({speech:'接著看看這裡。',narration:'她指向表格。',thought:null}));
  }) as unknown as typeof fetch;
  const offered=await converse(eligible,c,'tiara','一起看看資料。','talk');
  expect(requests.at(-1).tools.length).toBe(2);
  expect(offered.state.dialogue.choices?.length).toBe(2);
  expect(offered.state.affection.tiara).toBe((eligible.affection.tiara??0)+2);
  const negativeChoice=offered.state.dialogue.choices!.findIndex(choice=>choice.delta===-1);
  expect(negativeChoice).toBeGreaterThanOrEqual(0);
  expect(act(offered.state,c,{type:'choose',index:negativeChoice}).affection.tiara).toBe(offered.state.affection.tiara-1);
  const chosen=act(offered.state,c,{type:'choose',index:offered.state.dialogue.choices!.findIndex(choice=>choice.text===generated.choices[0].text)});
  expect(chosen.affection.tiara).toBe(offered.state.affection.tiara+2);
  expect(chosen.dialogue.text).toBe(generated.choices[0].reply);
  expect(JSON.stringify(chosen.memories.tiara.recent)).toContain('先看申請表');
  chosen.seed=2000;
  await converse(chosen,c,'tiara','請繼續。','talk');
  expect(requests.at(-1).tools.length).toBe(1);
  const toolResponse={choices:[{message:{tool_calls:[{function:{name:'present_character_choices',arguments:JSON.stringify(generated)}}]}}]};
  expect(()=>parseCharacterReply(toolResponse)).toThrow();
  expect(()=>parseCharacterReply(toolResponse,true,true)).toThrow();
  expect(parseCharacterReply(toolResponse,false,true).choices?.[0].delta).toBe(2);
  globalThis.fetch=(async()=>Response.json({choices:[{message:{content:'混合回應'}}]})) as unknown as typeof fetch;
  const contented=await converse(s,c,'tiara','你好','talk');
  expect(contented.state.dialogue.text).toBe('混合回應');expect(JSON.stringify(s)).toBe(snapshot);
 }finally{globalThis.fetch=originalFetch;close();if(resolve(dir).startsWith(resolve(tmpdir())))rmSync(dir,{recursive:true,force:true});}
});

test('editor image importer copies bytes, deduplicates images and retains attribution links',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'makein-image-test-')),originalFetch=globalThis.fetch;
 let calls=0;
 const image=readFileSync(join(import.meta.dir,'../content/assets',defaultContent.characters[0].sprites.normal.slice('/assets/authored/'.length)));
 globalThis.fetch=(async()=>{calls++;return new Response(image,{headers:{'Content-Type':'image/png'}});}) as unknown as typeof fetch;
 try{
  const c=structuredClone(defaultContent);c.characters[0].sprites.normal='https://example.com/new.png';c.characters[0].avatar='https://example.com/new.png';
  const saved=await localizeImages(c,dir,'/api/media/');
  expect(calls).toBe(1);expect(saved.characters[0].avatar).toBe(saved.characters[0].sprites.normal);expect(saved.characters[0].source).toBe(c.characters[0].source);
  expect(existsSync(join(dir,saved.characters[0].avatar!.split('/').at(-1)!))).toBe(true);
  globalThis.fetch=(async()=>new Response('<html>not an image</html>')) as unknown as typeof fetch;
  await expect(localizeImages(c,dir)).rejects.toThrow('圖片');
 }finally{globalThis.fetch=originalFetch;if(resolve(dir).startsWith(resolve(tmpdir())))rmSync(dir,{recursive:true,force:true});}
});
