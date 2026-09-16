import {test,expect,afterEach} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeRuntime} from '../server/runtime';
import {generateImage,imageEndpoint,requestImage,imageSettings,saveImageSettings,parseImagePlan,parseObjectImagePlan,parseSceneImagePlan} from '../server/stable-diffusion';
import {defaultContent} from '../core/content';
import {createGame} from '../core/engine';
import {write} from '../server/repository';
import {converse} from '../server/chat';
import {startImageJob,imageJob,imageJobResult} from '../server/image-jobs';
import {imageDimensions} from '../core/image-size';
import {visualNovelPositive,visualNovelNegative,imageArtDirection} from '../server/image-art-direction';
import {sdProfiles,modelDefaults} from '../core/sd-profiles';
import {composeImagePrompts} from '../server/image-art-direction';
import {filterModelLoras} from '../server/stable-diffusion';
import {lineImagePolicy} from '../server/line-image-policy';
import {allCharacterNames,getCharacterOutfits,handleGetCharacterTags} from '../server/character-tags';
import {characterTagCatalog} from '../server/character-tag-catalog';
import {prompt} from '../server/prompt';
function setFetch(handler:typeof fetch){globalThis.fetch=(async(input:any,init:any)=>{if(String(input).endsWith('/sdapi/v1/loras'))return Response.json([{name:'character model',path:'C:/webui/models/Lora/Illustrious/character model.safetensors'}]);if(init?.body){try{const b=JSON.parse(init.body);if(b.max_tokens===300)return Response.json({choices:[{message:{content:'No specialized skills needed for this scene.'}}]});}catch{}}return handler(input,init);}) as typeof fetch;}
const originalFetch=globalThis.fetch;let close:(()=>void)|undefined,dir='';
test('automatic illustration spaces decisions across distinct beats and preserves cadence on reload',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',automatic:true,url:'https://sd.example',key:''});
 let calls=0;
 setFetch((async()=>{calls++;return Response.json({choices:[{message:{content:'No special visual moment.'}}]});}) as unknown as typeof fetch);
 let s=createGame(defaultContent);delete s.dialogue.cg;
 await requestImage(s,defaultContent,'automatic');expect(calls).toBe(1);
 await requestImage(s,defaultContent,'automatic');expect(calls).toBe(1);
 s=JSON.parse(JSON.stringify(s));
 for(let i=0;i<3;i++){s.dialogue.text='Beat '+i;await requestImage(s,defaultContent,'automatic');}
 expect(calls).toBe(1);
 s.dialogue.text='A later turning point';await requestImage(s,defaultContent,'automatic');expect(calls).toBe(2);
 await requestImage(s,defaultContent,'line');expect(calls).toBe(3);
 await requestImage(s,defaultContent,'manual');expect(calls).toBe(4);
});
test('automatic illustration reuses existing CG without calling any provider',async()=>{
 setup();await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',automatic:true,url:'https://sd.example',key:''});
 setFetch((()=>{throw Error('must not fetch');}) as unknown as typeof fetch);
 const s=createGame(defaultContent);s.dialogue.cg='/api/media/existing.png';
 expect(await requestImage(s,defaultContent,'automatic')).toEqual({});
 expect(s.dialogue.cg).toBe('/api/media/existing.png');
});
afterEach(()=>{globalThis.fetch=originalFetch;close?.();close=undefined;if(dir)rmSync(dir,{recursive:true,force:true});dir='';});
function setup(){dir=mkdtempSync(join(tmpdir(),'makein-sd-'));close=initializeRuntime({dataDir:dir,port:9487,env:{}});}
test('sampling defaults fill missing legacy fields and custom hires settings persist',async()=>{
 setup();
 expect(await imageSettings()).toMatchObject({sampler:'Euler a',scheduler:'Automatic',steps:25,cfg:5,hiresFix:true,upscaler:'R-ESRGAN 4x+ Anime6B',upscaleBy:2,hiresSteps:0,denoising:0.7});
 await write('stable-diffusion',{sampler:'Euler a',steps:30});
 expect(await imageSettings()).toMatchObject({sampler:'Euler a',steps:25,scheduler:'Automatic',hiresFix:true});
 const custom={...await imageSettings(),scheduler:'Exponential',hiresFix:false,upscaleBy:1.5,hiresSteps:8,denoising:0.3};
 await saveImageSettings(custom);
 expect(await imageSettings()).toMatchObject({scheduler:'Exponential',hiresFix:false,upscaleBy:1.5,hiresSteps:8,denoising:0.3});
 for(const invalid of [{upscaleBy:0},{hiresSteps:1.5},{denoising:1.1},{hiresFix:'true'}])await expect(saveImageSettings({...custom,...invalid})).rejects.toThrow();
});
test('sampling and hires settings reach SD and disabling hires omits its options',async()=>{
 setup();
 let body:any;
 setFetch((async(_input:any,init:any)=>{body=JSON.parse(init.body);return Response.json({images:['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uoAAAAASUVORK5CYII=']});}) as unknown as typeof fetch);
 const settings={...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example'};
 const plan={prompt:'garden',negative_prompt:'blurry',caption:'garden',loras:[]};
 await generateImage(plan,settings);
 expect(body.prompt).toBe(`${visualNovelPositive}, garden, BREAK, depth of field, volumetric lighting`);
 expect(body.negative_prompt).toBe(`${visualNovelNegative}, blurry`);
 expect(body).toMatchObject({sampler_name:'Euler a',scheduler:'Automatic',steps:25,cfg_scale:5,enable_hr:true,hr_upscaler:'R-ESRGAN 4x+ Anime6B',hr_scale:2,hr_second_pass_steps:0,denoising_strength:0.7});
 await generateImage(plan,{...settings,hiresFix:false});
 expect(body.enable_hr).toBe(false);expect(body.hr_scale).toBeUndefined();expect(body.hr_upscaler).toBeUndefined();
});
test('story and LINE use the selected preset in opposite orientations',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',automatic:true,width:768,height:1024,url:'https://sd.example',key:''});
 const dimensions:{width:number;height:number}[]=[];
 setFetch((async(input:any,init:any)=>{
  if(String(input).startsWith('https://sd.example')){const body=JSON.parse(init.body);dimensions.push({width:body.width,height:body.height});return new Response('',{status:503});}
  const body=JSON.parse(init.body),context=JSON.parse(body.messages[1].content),direction=body.messages[0].content;
  if(body.tools[0].function.name==='load_skills')return Response.json({choices:[{message:{content:'none'}}]});
  expect(direction).toContain(imageArtDirection(context.mode,'Illustrious'));
  expect(direction).toContain(prompt(context.mode==='line'?'image.artDirection.line':'image.artDirection.story'));
  return Response.json({choices:[{message:{tool_calls:[{function:{name:'generate_image',arguments:JSON.stringify({prompt:'garden',negative_prompt:'blurry',caption:'garden',loras:[]})}}]}}]});
 }) as unknown as typeof fetch);
 const viewport={width:1912,height:848};
 for(const mode of ['manual','automatic','line'] as const){const state=createGame(defaultContent);delete state.dialogue.cg;await requestImage(state,defaultContent,mode,'','kaju',undefined);}
 expect(dimensions).toEqual([imageDimensions('small'),imageDimensions('small',false),imageDimensions('small',true)]);
});
test('configurable local, remote and prefixed endpoints',()=>{
 expect(imageEndpoint('http://localhost:9999/')).toBe('http://localhost:9999/sdapi/v1/txt2img');
 expect(imageEndpoint('https://example.com/proxy/sdapi/v1/txt2img')).toBe('https://example.com/proxy/sdapi/v1/txt2img');
 expect(()=>imageEndpoint('file:///tmp')).toThrow();
});
test('disabled default does not call LLM or SD',async()=>{setup();setFetch((()=>{throw Error('must not fetch');}) as unknown as typeof fetch);expect((await imageSettings()).enabled).toBe(false);expect(await requestImage(createGame(defaultContent),defaultContent,'manual')).toEqual({});});
test('tool arguments reject malformed LoRA and prompt injection syntax',()=>{
 expect(()=>parseImagePlan(JSON.stringify({prompt:'scene',negative_prompt:'bad',caption:'photo',loras:[{name:'x:1> injected',weight:1}]}))).toThrow();
 expect(()=>parseImagePlan('{}')).toThrow();
});
test('missing SD API reports 404 and the required startup flag',async()=>{
 setup();setFetch((async()=>new Response('',{status:404})) as unknown as typeof fetch);
 await expect(generateImage({prompt:'garden',negative_prompt:'blurry',caption:'garden',loras:[]},{...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'http://127.0.0.1:7860'})).rejects.toThrow('HTTP 404');
 await expect(generateImage({prompt:'garden',negative_prompt:'blurry',caption:'garden',loras:[]},{...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'http://127.0.0.1:7860'})).rejects.toThrow('--api');
});
test('LINE refusal makes no SD request; failure remains optional',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example',key:''});
 let calls=0;setFetch((async()=>{calls++;return Response.json({choices:[{message:{content:'目前不想拍照片。'}}]});}) as unknown as typeof fetch);
 const s=createGame(defaultContent);expect((await requestImage(s,defaultContent,'line','分享今天的樣子','kaju')).decision).toBe('目前不想拍照片。');expect(calls).toBe(1);
 setFetch((async()=>{throw Error('unavailable');}) as unknown as typeof fetch);
 expect((await requestImage(s,defaultContent,'manual')).notice).toBeDefined();expect(s.revision).toBe(0);
});
test('object image plans reject people and LoRA while enforcing person negatives',()=>{
 expect(()=>parseObjectImagePlan(JSON.stringify({prompt:'pancakes, plate',negative_prompt:'comic',caption:'鬆餅',loras:[]}))).toThrow('LoRA');
 expect(()=>parseObjectImagePlan(JSON.stringify({prompt:'1girl, pancakes',negative_prompt:'comic',caption:'鬆餅'}))).toThrow('人物');
 const plan=parseObjectImagePlan(JSON.stringify({prompt:'pancakes, plate, maple syrup',negative_prompt:'comic',caption:'鬆餅'}));
 expect(plan.loras).toEqual([]);expect(plan.negative_prompt).toContain('person');expect(plan.prompt).not.toContain('girl');
 expect(plan.objectOnly).toBe(true);expect(plan.imageKind).toBe('object');expect(plan.prompt).toStartWith('pancakes, plate, maple syrup');expect(plan.prompt).toContain('accurate object');
 for(const tag of ['(1girl:1.2)','3girls','blue_hair','looking_at_viewer','human reflection','手指','female portrait'])expect(()=>parseObjectImagePlan(JSON.stringify({prompt:`cake, ${tag}`,negative_prompt:'blurry',caption:'蛋糕'}))).toThrow('人物');
 expect(parseObjectImagePlan(JSON.stringify({prompt:'no humans, exam paper, school bag, books, trophy, medal',negative_prompt:'blurry',caption:'物品'})).prompt).toContain('exam paper');
});
test('scene image plans are person-free, characterless and distinct from object images',()=>{
 expect(()=>parseSceneImagePlan(JSON.stringify({prompt:'1girl at a beach',negative_prompt:'blurry',caption:'海邊'}))).toThrow('人物');
 expect(()=>parseSceneImagePlan(JSON.stringify({prompt:'quiet beach at sunset',negative_prompt:'blurry',caption:'海邊',loras:[]}))).toThrow('LoRA');
 const plan=parseSceneImagePlan(JSON.stringify({prompt:'quiet beach at sunset, waves',negative_prompt:'blurry',caption:'海邊'}));
 expect(plan.loras).toEqual([]);expect(plan.objectOnly).toBe(true);expect(plan.imageKind).toBe('scene');expect(plan.prompt).toStartWith('quiet beach at sunset, waves');expect(plan.prompt).toContain('coherent architecture');expect(plan.prompt).not.toContain('still life');expect(plan.negative_prompt).toContain('human reflection');
});
test('LINE exposes separate person-free object and scene tools for a character without LoRA-backed tags',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example',key:''});
 let checked=false;setFetch((async(_input:any,init:any)=>{const body=JSON.parse(init.body);if(body.tools?.some((x:any)=>x.function.name==='load_skills'))return Response.json({choices:[{message:{content:'none'}}]});checked=true;expect(body.tools.map((x:any)=>x.function.name)).toEqual(['generate_object_image','generate_scene_image']);return Response.json({choices:[{message:{content:'現在沒有想分享的物品照。'}}]});}) as unknown as typeof fetch);
 const result=await requestImage(createGame(defaultContent),defaultContent,'line','傳張照片','mitsuki');
 expect(result.decision).toBe('現在沒有想分享的物品照。');expect(checked).toBe(true);
});
test('proactive LINE may generate a people-free lifestyle image without character LoRA',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example',key:''});
 let planCalls=0,sdCalls=0;
 setFetch((async(input:any,init:any)=>{
  if(String(input).startsWith('https://sd.example')){
   sdCalls++;const body=JSON.parse(init.body);expect(body.prompt).toContain('strawberry cake');expect(body.prompt).not.toContain('<lora:');
   expect(body.prompt).toContain('still life, object focus');expect(body.prompt).toContain('accurate object, coherent shape');
   for(const tag of ['person','1girl','1boy','face','hair','body','hands','human reflection'])expect(body.negative_prompt).toContain(tag);
   return Response.json({images:['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uoAAAAASUVORK5CYII=']});
  }
  planCalls++;const body=JSON.parse(init.body);
  expect(body.tools.map((x:any)=>x.function.name)).toEqual(['generate_object_image','generate_scene_image']);
  expect(body.messages[0].content).toContain(prompt('image.characterlessLine'));
  const context=JSON.parse(body.messages[1].content);expect(context.sceneOnly).toBe(true);expect(context.character).toBeUndefined();
  return Response.json({choices:[{message:{tool_calls:[{id:'image',function:{name:'generate_object_image',arguments:JSON.stringify({prompt:'strawberry cake, dessert plate, cafe table',negative_prompt:'comic',caption:'今天吃到的蛋糕'})}}]}}]});
 }) as unknown as typeof fetch);
 const result=await requestImage(createGame(defaultContent),defaultContent,'line','今天的草莓蛋糕很好吃','mitsuki',undefined,undefined,{allowCharacterlessLine:true,proactiveLine:true});
 expect(result.url).toMatch(/^\/api\/media\/.+\.png$/);expect(result.caption).toBe('今天吃到的蛋糕');expect(planCalls).toBe(1);expect(sdCalls).toBe(1);
});
test('one model turn cannot trigger more than one paid image generation',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example',key:''});
 let sdCalls=0;
 setFetch((async(input:any)=>{
  if(String(input).startsWith('https://sd.example')){sdCalls++;return new Response('',{status:503});}
  const plan=(caption:string)=>({prompt:'garden portrait',negative_prompt:'blurry',caption,loras:[{name:'character model',weight:.8}]});
  return Response.json({choices:[{message:{tool_calls:[
   {id:'first',function:{name:'generate_image',arguments:JSON.stringify(plan('first'))}},
   {id:'second',function:{name:'generate_image',arguments:JSON.stringify(plan('second'))}},
  ]}}]});
 }) as unknown as typeof fetch);
 const result=await requestImage(createGame(defaultContent),defaultContent,'line','send a photo','kaju');
 expect(sdCalls).toBe(0);expect(result.notice).toBeDefined();
});
test('LINE evaluates the latest message without forcing another image after a previous photo',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example',key:''});
 const s=createGame(defaultContent);
 s.messages.kaju=[{id:'old-photo',phase:s.phase,from:'kaju',text:'照片傳給你了。',date:s.date,image:'/api/media/old.png'}];
 let calls=0;
 setFetch((async(input:any,init:any)=>{
  calls++;expect(String(input)).toStartWith('https://llm.example');
  const body=JSON.parse(init.body),context=JSON.parse(body.messages[1].content);
  expect(body.tool_choice).toBe('auto');
  expect(body.messages[0].content).toContain(lineImagePolicy());
  expect(body.messages[0].content).not.toContain('關係好時通常願意分享普通自拍');
  expect(context.text).toBe('妳是甚麼呀佳樹？');
  expect(context.messages[0].image).toBe('/api/media/old.png');
  return Response.json({choices:[{message:{content:'身分問題，只回文字，不需要新圖片。'}}]});
 }) as unknown as typeof fetch);
 const result=await requestImage(s,defaultContent,'line','妳是甚麼呀佳樹？','kaju');
 expect(result.url).toBeUndefined();expect(result.decision).toContain('只回文字');expect(calls).toBe(1);
});
test('LLM-selected prompts and LoRA reach remote SD; image persists',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example/prefix',key:'secret'});
 let calls=0;setFetch((async(input:any,init:any)=>{calls++;if(calls===1)return Response.json({choices:[{message:{tool_calls:[{function:{name:'generate_image',arguments:JSON.stringify({prompt:'garden selfie',negative_prompt:'blurry',caption:'庭院',loras:[{name:'character model',weight:0.8}]})}}]}}]});
 expect(String(input)).toBe('https://sd.example/prefix/sdapi/v1/txt2img');expect(init.headers.Authorization).toBe('Bearer secret');expect(JSON.parse(init.body).prompt).toContain('<lora:character model:0.8>');
 return Response.json({images:['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5uoAAAAASUVORK5CYII=']});}) as unknown as typeof fetch);
 const result=await requestImage(createGame(defaultContent),defaultContent,'manual');expect(result.url).toMatch(/^\/api\/media\/.+\.png$/);expect(calls).toBe(2);
});
test('failed photo generation still commits LINE text and preserves scene',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example',key:''});
 setFetch((async(input:any,init:any)=>{
  if(String(input).startsWith('https://sd.example'))return new Response('',{status:503});
  const body=JSON.parse(init.body);
  if(body.tools[0].function.name==='generate_image')return Response.json({choices:[{message:{tool_calls:[{function:{name:'generate_image',arguments:JSON.stringify({prompt:'selfie',negative_prompt:'blurry',caption:'照片',loras:[]})}}]}}]});
  expect(body.messages[0].content).toContain('圖片生成未完成');
  return Response.json({choices:[{message:{tool_calls:[{function:{name:'present_character_reply',arguments:JSON.stringify({needs_narration:false,needs_thought:false,speech:'晚點再傳給你。',narration:'',thought:null})}}]}}]});
 }) as unknown as typeof fetch);
 const s=createGame(defaultContent);s.met.push('kaju');s.contacts.push('kaju');
 const result=await converse(s,defaultContent,'kaju','讓我看看今天的樣子','line');
 expect(result.state.revision).toBe(s.revision+1);expect(result.state.messages.kaju.at(-1)?.text).toBe('晚點再傳給你。');expect(result.state.messages.kaju.at(-1)?.image).toBeUndefined();expect(result.state.dialogue).toEqual(s.dialogue);expect(result.notice).toBeDefined();
});
test('background image job survives caller disconnect and deduplicates until SD finishes',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),enabled:true,checkpoint:'test-model.safetensors',url:'https://sd.example',key:''});
 const owner=crypto.randomUUID(),s=createGame(defaultContent);await write('game:'+owner,s);
 let finish!:(r:Response)=>void,started!:()=>void;
 const reached=new Promise<void>(resolve=>{started=resolve;});let sdCalls=0;
 setFetch((async(input:any,init:any)=>{
  if(String(input).startsWith('https://sd.example')){sdCalls++;expect(init.signal).toBeUndefined();expect(init.timeout).toBe(false);started();return await new Promise<Response>(resolve=>{finish=resolve;});}
  return Response.json({choices:[{message:{tool_calls:[{function:{name:'generate_image',arguments:JSON.stringify({prompt:'garden',negative_prompt:'blurry',caption:'garden',loras:[]})}}]}}]});
 }) as unknown as typeof fetch);
 startImageJob(owner,s,defaultContent);await reached;
 startImageJob(owner,s,defaultContent);expect(imageJob(owner)?.pending).toBe(true);expect(sdCalls).toBe(1);
 finish(Response.json({error:'NansException'},{status:500}));
 for(let i=0;i<100&&imageJob(owner)?.pending;i++)await new Promise(resolve=>setTimeout(resolve,2));
 const result=await imageJobResult(owner);expect(result.imagePending).toBe(false);expect(result.notice).toContain('NaN');expect(result.state).toEqual(s);
});

test('model selection migrates legacy defaults and switches character triggers',async()=>{
 setup();await write('stable-diffusion',{guide:'old Illustrious only guide',cfg:9});
 expect(await imageSettings()).toMatchObject({modelFamily:'Illustrious',cfg:5,guide:sdProfiles.Illustrious.guide});
 const old=await imageSettings();
 await saveImageSettings({...old,modelFamily:'Pony',checkpoint:'pony.safetensors'});
 expect(await imageSettings()).toMatchObject({...modelDefaults('Pony'),modelFamily:'Pony'});
 expect((await imageSettings()).guide).toContain('karen himemiya');
 expect((await imageSettings()).guide).not.toContain('mkhekaren');
 for(const change of [{modelFamily:'other'},{clipSkip:1.5},{enabled:true,url:''},{enabled:true,checkpoint:''},{enabled:true,sampler:''},{enabled:true,scheduler:''},{enabled:true,guide:''},{enabled:true,hiresFix:true,upscaler:''}])await expect(saveImageSettings({...await imageSettings(),...change})).rejects.toThrow();
});
test('Pony uses its own quality tags and excludes guessed Illustrious quality',()=>{
 const result=composeImagePrompts({prompt:'masterpiece, score_9, 1girl, karen himemiya',negative_prompt:'score_4, comic'},'Pony');
 expect(result.prompt).toBe(sdProfiles.Pony.positive+', 1girl, karen himemiya');
 expect(result.negative_prompt).toBe(sdProfiles.Pony.negative+', comic');
 expect(composeImagePrompts({prompt:'score_9, 1girl',negative_prompt:'score_6, comic'},'Illustrious').prompt).not.toContain('score_');
 const ponyObject=composeImagePrompts({prompt:'strawberry cake, white plate',negative_prompt:'blurry',imageKind:'object'},'Pony');
 expect(ponyObject.prompt).toStartWith('score_9, score_8_up, score_7_up, source_anime, still life, object focus');expect(ponyObject.prompt).not.toContain('masterpiece');expect(ponyObject.negative_prompt).toContain('malformed object');
 const illustriousScene=composeImagePrompts({prompt:'quiet beach, sunset',negative_prompt:'blurry',imageKind:'scene'},'Illustrious');
 expect(illustriousScene.prompt).toContain('scenery, environment focus, wide shot');expect(illustriousScene.prompt).not.toContain('score_');expect(illustriousScene.negative_prompt).toContain('malformed architecture');
});

test('existing guides gain Shikiya for the selected model without resetting custom settings',async()=>{
 setup();
 for(const modelFamily of ['Illustrious','Pony'] as const){
  const oldGuide=sdProfiles[modelFamily].guide.split(/\r?\n---\r?\n/).filter(section=>!section.includes('志喜屋 夢子：')).join('\n---\n')+'\nCustom character instructions';
  await write('stable-diffusion',{modelFamily,guide:oldGuide,cfg:7,checkpoint:'custom.safetensors'});
  const settings=await imageSettings();
  expect(settings.guide).toStartWith(oldGuide);
  expect(settings.guide).toContain(modelFamily==='Illustrious'?'Shikiya Yumeko,white hair':'yumeko shikiya, long hair, brown hair');
  expect(settings.guide).not.toContain(modelFamily==='Illustrious'?'yumeko shikiya, long hair, brown hair':'Shikiya Yumeko,white hair');
  expect(settings).toMatchObject({cfg:7,checkpoint:'custom.safetensors'});
  await saveImageSettings(settings);
  expect((await imageSettings()).guide).toBe(settings.guide);
 }
});
test('LoRA catalog filters Windows and Unix folders without mixing families',()=>{
 const items=[{name:'pony',path:'C:\\webui\\models\\Lora\\Pony\\character\\pony.safetensors'},{name:'illu',path:'/webui/models/Lora/Illustrious/illu.safetensors'},{name:'wrong',path:'/webui/models/Lora/PonyOther/wrong.safetensors'}];
 expect(filterModelLoras(items,'Pony').map(l=>l.name)).toEqual(['pony']);
 expect(filterModelLoras(items,'Illustrious').map(l=>l.name)).toEqual(['illu']);
});
test('typed character tag catalog covers every character and model without reading Markdown',()=>{
 for(const family of ['Illustrious','Pony'] as const){
  expect(allCharacterNames(family)).toEqual(['温水 佳樹','八奈見 杏菜','小鞠 知花','焼塩 檸檬','朝雲 千早','姫宮 華恋','馬剃 天愛星','温水 和彦','志喜屋 夢子']);
  for(const name of allCharacterNames(family))expect(getCharacterOutfits(name,family).length).toBeGreaterThan(0);
 }
 for(let i=0;i<characterTagCatalog.Illustrious.length;i++)expect(characterTagCatalog.Illustrious[i]).not.toBe(characterTagCatalog.Pony[i]);
 expect(handleGetCharacterTags({character:'志喜屋夢子',outfit:'半袖制服'},'Pony')).toContain('yumeko shikiya');
 expect(handleGetCharacterTags({character:'yumeko_shikiya_anime_v2-soralz',outfit:'school uniform'},'Pony')).toContain('school uniform');
 expect(handleGetCharacterTags({character:'溫水佳樹',outfit:'私服'},'Illustrious')).toContain('kaju-casual1');
});
test('Pony request carries its character guide, sampling and checkpoint overrides',async()=>{
 setup();await write('api-settings',{url:'https://llm.example/v1',key:'test',model:'test'});
 await saveImageSettings({...await imageSettings(),...modelDefaults('Pony'),modelFamily:'Pony',enabled:true,url:'https://sd.example',checkpoint:'zuki.safetensors'});
 let generated=false;
 setFetch((async(input:any,init:any)=>{
  const body=JSON.parse(init.body);
  if(String(input).startsWith('https://llm.example')){
   if(body.tools[0].function.name==='load_skills')return Response.json({choices:[{message:{content:'none'}}]});
   expect(body.messages[0].content).toContain(imageArtDirection('manual','Pony'));expect(body.messages[0].content).not.toContain('basori_cnr');
   const lastMsg=body.messages[body.messages.length-1];
   if(lastMsg?.role==='tool')return Response.json({choices:[{message:{tool_calls:[{id:'c2',function:{name:'generate_image',arguments:JSON.stringify({prompt:'1girl, tiara basori',negative_prompt:'comic',caption:'photo',loras:[]})}}]}}]});
   return Response.json({choices:[{message:{tool_calls:[{id:'c1',function:{name:'get_character_tags',arguments:JSON.stringify({character:'\u99ac\u5264 \u5929\u611b\u661f',outfit:'\u5236\u670d'})}}]}}]});
  }
  generated=true;expect(body).toMatchObject({steps:30,cfg_scale:6,hr_scale:1.5,denoising_strength:0.45,override_settings:{CLIP_stop_at_last_layers:2,sd_model_checkpoint:'zuki.safetensors'}});
  expect(body.prompt).toStartWith(sdProfiles.Pony.positive);expect(body.negative_prompt).toStartWith(sdProfiles.Pony.negative);
  return new Response('',{status:503});
 }) as typeof fetch);
 await requestImage(createGame(defaultContent),defaultContent,'manual');expect(generated).toBe(true);
});
