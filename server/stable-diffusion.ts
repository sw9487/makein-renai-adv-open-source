import {visibleScene} from './character-context';
import {getCharacterOutfits,getCharacterTagsTool,handleGetCharacterTags} from './character-tags';
import {admitStoryIllustration,rememberStoryIllustration} from './story-illustration';
import {importantMemoryView} from './memory-view';
import {calendarPromptContext} from '../core/calendar';
import {ToolRegistry} from './tool-registry';
import {modelFetch,ModelError} from './model-runtime';
import {trackImage} from './image-history';
import {queuedImage,imageByteLimit} from './image-queue';
import {imageDimensions,type ImageSizePreset} from '../core/image-size';
import {apiFetch} from './api-fetch';
import {apiSettings,validateApiUrl,read,write,bindings} from './repository';
import {assets} from './runtime';
import type {Content,GameState} from '../core/types';
import {sdProfiles,modelDefaults,type ModelFamily} from '../core/sd-profiles';
import {composeImagePrompts,imageArtDirection} from './image-art-direction';
import {lineImagePolicy} from './line-image-policy';
import {skillMenu,loadSkillContent,loadSkillsTool,type SkillCategory} from './image-tag-skills';
import {prompt} from './prompt';
class ImageFailure extends Error {}

export type ImageSettings={modelFamily:ModelFamily;clipSkip:number;enabled:boolean;automatic:boolean;url:string;key:string;checkpoint:string;guide:string;sizePreset:ImageSizePreset;width:number;height:number;steps:number;cfg:number;sampler:string;scheduler:string;hiresFix:boolean;upscaler:string;upscaleBy:number;hiresSteps:number;denoising:number};
export async function imageSettings():Promise<ImageSettings>{
 const saved=await read<Partial<ImageSettings>>('stable-diffusion',{});
 const modelFamily=saved.modelFamily==='Pony'?'Pony':'Illustrious';
 const base={enabled:bindings.SD_ENABLED==='true',automatic:bindings.SD_AUTO_STORY==='true',url:bindings.SD_API_URL??'',key:bindings.SD_API_KEY??'',checkpoint:'',sizePreset:'small' as const,...imageDimensions('small')};
 const settings:ImageSettings={...base,...modelDefaults(modelFamily),...saved,...(!saved.modelFamily?modelDefaults(modelFamily):{}),modelFamily};
 // Older saved guides predate Shikiya. Add her model-specific reference without
 // resetting custom character instructions, checkpoints or sampling parameters.
 const shikiya=sdProfiles[modelFamily].guide.split(/\r?\n---\r?\n/).find(section=>section.trim().startsWith('志喜屋 夢子：'));
 if(settings.guide.trim()&&shikiya&&!/志喜屋\s*夢子|shikiya\s+yumeko|yumeko\s+shikiya/i.test(settings.guide))settings.guide=settings.guide.trimEnd()+'\n\n---\n\n'+shikiya.trim();
 return settings;
}
export function imageEndpoint(value:string){
 const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('生圖網址須為 HTTP 或 HTTPS，不含帳密、查詢或片段。');
 const base=value.replace(/\/+$/,'');return base.endsWith('/sdapi/v1/txt2img')?base:base+'/sdapi/v1/txt2img';
}
export async function saveImageSettings(input:Record<string,unknown>){
 const old=await imageSettings(),next={...old};
 if(input.modelFamily!=='Illustrious'&&input.modelFamily!=='Pony')throw Error('請選擇 Illustrious 或 Pony。');
 next.modelFamily=input.modelFamily;
 if(input.modelFamily!==old.modelFamily&&input.guide===old.guide)input={...input,...modelDefaults(input.modelFamily)};
 for(const k of ['enabled','automatic','hiresFix'] as const){if(typeof input[k]!=='boolean')throw Error('開關格式錯誤。');next[k]=input[k];}
 for(const k of ['url','checkpoint','guide','sampler','scheduler','upscaler'] as const){if(typeof input[k]!=='string'||input[k].length>(k==='guide'?24000:500))throw Error('生圖設定格式錯誤。');next[k]=input[k].trim();}
 if(typeof input.key!=='string'||input.key.length>2000)throw Error('金鑰格式錯誤。');
 next.key=input.clearKey===true?'':input.key.trim()||old.key;
 for(const [k,min,max] of [['clipSkip',1,2],['steps',1,60],['cfg',1,20],['upscaleBy',1,4],['hiresSteps',0,60],['denoising',0,1]] as const){const v=input[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||((k==='steps'||k==='hiresSteps'||k==='clipSkip')&&!Number.isInteger(v)))throw Error(`${k} 超出範圍。`);next[k]=v;}
 if(!['large','medium','small'].includes(String(input.sizePreset)))throw Error('請選擇大、中或小圖片尺寸。');
 next.sizePreset=input.sizePreset as ImageSizePreset;
 Object.assign(next,imageDimensions(next.sizePreset));
 if(next.enabled&&!next.url)throw Error('啟用生圖時必須填寫 Stable Diffusion 服務網址。');
 if(next.enabled&&!next.checkpoint)throw Error('請填寫所選模型的完整 checkpoint 名稱，避免沿用另一種模型。');
 if(next.enabled&&(!next.sampler||!next.scheduler||!next.guide))throw Error('啟用生圖時，Sampler、Scheduler 與模型／LoRA 指南為必填。');
 if(next.enabled&&next.hiresFix&&!next.upscaler)throw Error('開啟 Hires.fix 時必須填寫 Upscaler。');
 if(next.enabled||next.url)imageEndpoint(next.url);
 await write('stable-diffusion',next);
}
export type ImagePlan={prompt:string;negative_prompt:string;caption:string;loras:{name:string;weight:number}[];objectOnly?:boolean;imageKind?:'object'|'scene'};
export function parseImagePlan(raw:string):ImagePlan{
 const p=JSON.parse(raw);
 for(const key of ['prompt','negative_prompt','caption'])if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>6000)throw Error('AI 生圖提示格式錯誤。');
 if(!Array.isArray(p.loras)||p.loras.length>6||p.loras.some((l:any)=>typeof l.name!=='string'||!l.name.trim()||l.name.length>200||/[<>:\r\n]/.test(l.name)||typeof l.weight!=='number'||!Number.isFinite(l.weight)||l.weight<0||l.weight>1.5))throw Error('AI LoRA 格式錯誤。');
 if(/<lora:/i.test(p.prompt))throw Error('LoRA 請透過工具的 loras 欄位指定。');
 return p;
}
const tool={type:'function',function:{name:'generate_image',get description(){return prompt('image.tool');},parameters:{type:'object',properties:{prompt:{type:'string',get description(){return prompt('image.prompt');}},negative_prompt:{type:'string',get description(){return prompt('image.negative');}},caption:{type:'string'},loras:{type:'array',items:{type:'object',properties:{name:{type:'string'},weight:{type:'number'}},required:['name','weight'],additionalProperties:false}}},required:['prompt','negative_prompt','caption','loras'],additionalProperties:false}}};
export const objectImageTool={type:'function',function:{name:'generate_object_image',get description(){return prompt('image.objectTool');},parameters:{type:'object',properties:{prompt:{type:'string',get description(){return prompt('image.objectPrompt');}},negative_prompt:{type:'string',get description(){return prompt('image.objectNegative');}},caption:{type:'string'}},required:['prompt','negative_prompt','caption'],additionalProperties:false}}};
export const sceneImageTool={type:'function',function:{name:'generate_scene_image',get description(){return prompt('image.sceneTool');},parameters:{type:'object',properties:{prompt:{type:'string',get description(){return prompt('image.scenePrompt');}},negative_prompt:{type:'string',get description(){return prompt('image.sceneNegative');}},caption:{type:'string'}},required:['prompt','negative_prompt','caption'],additionalProperties:false}}};
// Normalize underscores and weighted tags before checking; e.g. (1girl:1.2)
// and blue_hair previously slipped through the narrow tag boundary check.
const personPrompt=/\b(?:\d+\s*(?:girls?|boys?|people)|girls?|boys?|women|woman|men|man|female|male|persons?|people|humans?|characters?|portraits?|selfies?|faces?|heads?|bodies|body|hands?|fingers?|arms?|legs?|feet|foot|skin|hair|eyes?|breasts?|cleavage|thighs?|looking at viewer|upper body|full body)\b|人物|角色|人像|肖像|自拍|女孩|男孩|女性|男性|少女|少年|髮|发色|頭髮|头发|眼睛|手指|肌膚|肌肤/i;
export const objectImageNegative='(person, people, human:1.3), 1girl, 1boy, multiple girls, multiple boys, girl, boy, woman, man, female, male, character, portrait, selfie, face, head, hair, eyes, body, upper body, full body, skin, arms, hands, fingers, legs, feet, human silhouette, person in background, human reflection';
function enforceObjectImagePlan(plan:ImagePlan):ImagePlan{
 if(plan.loras.length||/<(?:lora|lyco|hypernet):/i.test(plan.prompt))throw Error('純物件圖片工具不可指定 LoRA。');
 const subject=plan.prompt.replace(/\bno[ _]+humans?\b/gi,'').replace(/_/g,' ');
 if(personPrompt.test(subject))throw Error('純物件圖片工具的 prompt 不可包含人物、肖像、自拍或身體標籤。');
 const tags=subject.split(',').map(tag=>tag.trim()).filter(tag=>tag&&!/^(still life|object focus|accurate object|coherent shape|detailed texture|clean composition)$/i.test(tag));
 return {...plan,objectOnly:true,imageKind:'object',prompt:[...tags,'still life','object focus','accurate object','coherent shape','detailed texture','clean composition'].join(', '),negative_prompt:plan.negative_prompt.includes(objectImageNegative)?plan.negative_prompt:plan.negative_prompt+', '+objectImageNegative};
}
export function parseObjectImagePlan(raw:string):ImagePlan{
 const value=JSON.parse(raw);if(value&&('loras' in value))throw Error('純物件圖片工具不可指定 LoRA。');
 const plan=parseImagePlan(JSON.stringify({...value,loras:[]}));
 return enforceObjectImagePlan(plan);
}
export function parseSceneImagePlan(raw:string):ImagePlan{
 const value=JSON.parse(raw);if(value&&('loras' in value))throw Error('場景圖片工具不可指定 LoRA。');
 const plan=parseImagePlan(JSON.stringify({...value,loras:[]}));
 if(/<(?:lora|lyco|hypernet):/i.test(plan.prompt))throw Error('場景圖片工具不可指定 LoRA。');
 const subject=plan.prompt.replace(/\bno[ _]+humans?\b/gi,'').replace(/_/g,' ');
 if(personPrompt.test(subject))throw Error(prompt('image.scenePersonError'));
 const tags=subject.split(',').map(tag=>tag.trim()).filter(tag=>tag&&!/^(scenery|environment focus|wide shot|establishing shot|coherent architecture|detailed background|atmospheric perspective)$/i.test(tag));
 return {...plan,objectOnly:true,imageKind:'scene',prompt:[...tags,'scenery','environment focus','wide shot','establishing shot','coherent architecture','detailed background','atmospheric perspective'].join(', '),negative_prompt:plan.negative_prompt.includes(objectImageNegative)?plan.negative_prompt:plan.negative_prompt+', '+objectImageNegative};
}
export type ImageResult={url?:string;caption?:string;notice?:string;decision?:string};

export async function generateImage(plan:ImagePlan,settings:ImageSettings,signal?:AbortSignal,onStatus?:(status:'queued'|'running')=>Promise<void>){
 // Shared by LINE and Twitter; recheck at the final SD boundary as well.
 if(plan.imageKind==='object'||plan.objectOnly&&!plan.imageKind)plan=enforceObjectImagePlan(plan);
 if(!settings.enabled)throw Error('Stable Diffusion 尚未啟用。');
 if(!settings.checkpoint)throw new ImageFailure('請在生圖設定選擇模型類型並填入對應 checkpoint 名稱。');
 return trackImage(plan.caption,async status=>{
 await status('queued');await onStatus?.('queued');
 return queuedImage(imageEndpoint(settings.url),async()=>{
 await status('running');await onStatus?.('running');
 const prompts=composeImagePrompts(plan,settings.modelFamily);
 const scale=settings.hiresFix?settings.upscaleBy:1;
 const byteLimit=imageByteLimit(Math.ceil(settings.width*scale),Math.ceil(settings.height*scale));
 const responseLimit=Math.ceil(byteLimit*4/3)+1024*1024;
 // SD sends no bytes while sampling. Disable Bun's separate 5-minute socket
 // idle timer as well as avoiding an AbortSignal deadline for generation.
 const response=await apiFetch(imageEndpoint(settings.url),{method:'POST',timeout:false,redirect:'error',signal,headers:{'Content-Type':'application/json',...(settings.key?{Authorization:'Bearer '+settings.key}:{})},body:JSON.stringify({prompt:[prompts.prompt,...plan.loras.map(l=>`<lora:${l.name}:${l.weight}>`)].join(', '),negative_prompt:prompts.negative_prompt,width:settings.width,height:settings.height,steps:settings.steps,cfg_scale:settings.cfg,sampler_name:settings.sampler,scheduler:settings.scheduler,enable_hr:settings.hiresFix,...(settings.hiresFix?{hr_upscaler:settings.upscaler,hr_scale:settings.upscaleBy,hr_second_pass_steps:settings.hiresSteps,denoising_strength:settings.denoising}:{}),batch_size:1,n_iter:1,send_images:true,save_images:false,override_settings:{CLIP_stop_at_last_layers:settings.clipSkip,...(settings.checkpoint?{sd_model_checkpoint:settings.checkpoint}:{})},override_settings_restore_afterwards:true})});
 if(response.status===500){const failure=await response.clone().json().catch(()=>null);if(failure?.error==='NansException')throw new ImageFailure('SD 計算產生 NaN：請在 SD 設定啟用 Upcast cross attention layer to float32，或以 --no-half 啟動後重試。');}
 if(!response.ok)throw new ImageFailure(response.status===404?'SD API 回覆 HTTP 404：請確認網址，並以 --api 啟動 Stable Diffusion WebUI。':response.status===401||response.status===403?`SD API 回覆 HTTP ${response.status}：驗證失敗，請確認生圖服務的金鑰或存取權限。`:`SD API 回覆 HTTP ${response.status}，請檢查生圖服務紀錄。`);
 if(!response.body)throw Error('生圖服務未回傳圖片。');
 const reader=response.body.getReader();let total=0;const chunks:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>responseLimit){await reader.cancel();throw new ImageFailure(`SD 回應超過此解析度允許的 ${Math.ceil(responseLimit/1024/1024)} MB，請降低解析度或改用壓縮圖片格式。`);}chunks.push(value);}
 const encoded=JSON.parse(Buffer.concat(chunks).toString('utf8')).images?.[0];
 if(typeof encoded!=='string')throw Error('生圖服務未回傳圖片。');
 const bytes=Buffer.from(encoded.replace(/^data:image\/[a-z]+;base64,/,''),'base64');
 const ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':'';
 if(!ext)throw new ImageFailure('SD 圖片格式無效。');
 if(bytes.length>byteLimit)throw new ImageFailure(`SD 圖片超過此解析度允許的 ${Math.ceil(byteLimit/1024/1024)} MB。`);
 const key=crypto.randomUUID()+'.'+ext;await assets().put(key,Uint8Array.from(bytes).buffer,{httpMetadata:{contentType:ext==='jpg'?'image/jpeg':'image/'+ext}});
 return '/api/media/'+key;
 },signal);
 });
}
export async function requestImage(s:GameState,c:Content,mode:'manual'|'automatic'|'line',text='',id=s.character,signal?:AbortSignal,onStatus?:(status:'queued'|'running')=>Promise<void>,options:{allowCharacterlessLine?:boolean;proactiveLine?:boolean}={}):Promise<ImageResult>{
 let stage='LLM 生圖決策';
 try{
 const settings=await imageSettings();if(!settings.enabled||(mode==='automatic'&&!settings.automatic))return {};
 if(mode==='automatic'&&!admitStoryIllustration(s))return {};
 Object.assign(settings,imageDimensions(settings.sizePreset,mode==='line'));
 const character=c.characters.find(ch=>ch.id===id);
 const characterImageAllowed=!!character&&getCharacterOutfits(character.name,settings.modelFamily).length>0;
 const availableLoras=mode==='line'&&!characterImageAllowed?[]:await modelLoras(settings,signal);
  const ai=await apiSettings();if(!ai.url||!ai.model||!ai.key)throw Error('請先設定 LLM，才能使用生圖功能。');
  const base=ai.url.replace(/\/+$/,''),endpoint=base.endsWith('/chat/completions')?base:base+(new URL(base).pathname==='/'?'/v1':'')+'/chat/completions';
  const sceneOnly=mode==='line'&&!characterImageAllowed;
  const scenePayload=JSON.stringify({mode,recentStoryIllustrations:mode==='automatic'?s.storyIllustration?.recent:undefined,imageSize:{width:settings.width,height:settings.height},composition:prompt(mode==='line'?'image.composition.line':'image.composition.story'),date:s.date,phase:s.phase,calendar:calendarPromptContext(s.date),place:mode!=='line'||s.character===id?c.places.find(p=>p.id===s.location)?.name:undefined,character:sceneOnly?undefined:character,affection:s.affection[id]??0,route:mode==='line'?(s.route===id?id:undefined):s.route,memory:s.memories[id]?{summary:s.memories[id].summary,facts:s.memories[id].facts,important:importantMemoryView(s.memories[id],text||s.dialogue.text),recent:s.memories[id].recent}:undefined,messages:mode==='line'?s.messages[id]?.slice(-20):undefined,scene:mode==='line'?visibleScene(s,id):s.dialogue,text,sceneOnly});
  // --- Pass 1: Skill selection (lightweight ~300 chars menu) ---
  let selectedSkills:SkillCategory[]=[];
  const pass1Resp=await modelFetch(endpoint,{method:'POST',redirect:'error',signal:signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,stream:false,max_tokens:300,tools:[loadSkillsTool],tool_choice:'auto',parallel_tool_calls:false,messages:[{role:'system',content:prompt('image.unlock')+'\n'+prompt('image.skillSelector')+'\n'+skillMenu()},{role:'user',content:scenePayload}]})});
  if(pass1Resp.ok){const p1msg=(await pass1Resp.json()).choices?.[0]?.message;const p1calls=p1msg?.tool_calls;if(p1calls?.length&&p1calls[0].function?.name==='load_skills'){try{const parsed=JSON.parse(p1calls[0].function.arguments);if(Array.isArray(parsed.categories))selectedSkills=parsed.categories.filter((c:string)=>['violent','bloody','grotesque'].includes(c)) as SkillCategory[];}catch{}}}
  const skillBlock=loadSkillContent(selectedSkills);
  // --- Pass 2: Image generation (character-aware and strictly person-free tools) ---
  const registry=new ToolRegistry();
  registry.register({schema:tool,parse:parseImagePlan,execute:async plan=>{if(plan.loras.some(l=>!availableLoras.some(a=>a.name===l.name)))throw new ImageFailure('LoRA 不屬於所選模型資料夾，請刷新 WebUI LoRA 清單。');return {url:await generateImage(plan,settings,signal,onStatus),caption:plan.caption};},validateResult:result=>{if(!result.url.startsWith('/api/media/'))throw Error('圖片工具結果無效。');}},settings.enabled&&characterImageAllowed);
  registry.register({schema:objectImageTool,parse:parseObjectImagePlan,execute:async plan=>({url:await generateImage(plan,settings,signal,onStatus),caption:plan.caption}),validateResult:result=>{if(!result.url.startsWith('/api/media/'))throw Error('圖片工具結果無效。');}},settings.enabled&&mode==='line');
  registry.register({schema:sceneImageTool,parse:parseSceneImagePlan,execute:async plan=>({url:await generateImage(plan,settings,signal,onStatus),caption:plan.caption}),validateResult:result=>{if(!result.url.startsWith('/api/media/'))throw Error('場景圖片工具結果無效。');}},settings.enabled&&mode==='line');
  const pass2Tools=[...(characterImageAllowed?[getCharacterTagsTool]:[]),...registry.schemas()];
  const linePolicy=options.proactiveLine?prompt('image.proactiveLine'):lineImagePolicy();
  const pass2System=prompt('image.unlock')+prompt('image.decision')+(mode==='line'?linePolicy:prompt(mode==='manual'?'image.mode.manual':'image.mode.automatic'))+prompt('image.workflow',{model:settings.modelFamily,loras:JSON.stringify(sceneOnly?[]:availableLoras)})+'\n\n'+imageArtDirection(mode,settings.modelFamily)+'\n\n'+(mode==='line'?linePolicy+'\n\n'+prompt('image.objectChoice')+'\n\n'+prompt('image.sceneChoice'):'')+(sceneOnly?'\n\n'+prompt('image.characterlessLine'):'')+skillBlock;
  const pass2Messages:any[]=[{role:'system',content:pass2System},{role:'user',content:scenePayload}];
  let p2result!:{url:string;caption:string};
  for(let turn=0;turn<4;turn++){
   const resp2=await modelFetch(endpoint,{method:'POST',redirect:'error',signal:signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,stream:false,max_tokens:2200,tools:pass2Tools,tool_choice:'auto',parallel_tool_calls:false,messages:pass2Messages})});
   if(!resp2.ok)throw new ImageFailure('LLM 生圖決策回覆 HTTP '+resp2.status+'，請檢查 LLM 服務設定。');

   const resp2data=await resp2.json();const msg2=resp2data.choices?.[0]?.message;const calls2=msg2?.tool_calls;
   if(!calls2?.length){if(mode==='manual'&&turn===0)throw Error('LLM 未呼叫生圖工具。');return {decision:typeof msg2?.content==='string'?msg2.content.slice(0,1000):'本回合不傳送圖片。'};}
   // Some OpenAI-compatible providers ignore parallel_tool_calls:false. Never
   // pay for several SD generations from one model turn and then silently keep
   // only the last image.
   const generationCalls=calls2.filter((call:any)=>['generate_image','generate_object_image','generate_scene_image'].includes(call.function?.name));
   if(generationCalls.length>1)throw new ImageFailure(prompt('image.duplicateGeneration'));
   pass2Messages.push({role:'assistant',content:msg2.content??null,tool_calls:calls2});
   const toolResults:any[]=[];
   for(const call of calls2){
    if(call.function?.name==='get_character_tags'){
     let ctArgs:{character:string;outfit:string}={character:'',outfit:''};try{ctArgs=JSON.parse(call.function.arguments);}catch{}
     toolResults.push({role:'tool',tool_call_id:call.id,content:handleGetCharacterTags(ctArgs,settings.modelFamily)});
    } else if(call.function?.name==='generate_image'||call.function?.name==='generate_object_image'||call.function?.name==='generate_scene_image'){
     stage='Stable Diffusion 生圖';
     p2result=await registry.execute(call.function.name,call.function.arguments) as {url:string;caption:string};
     toolResults.push({role:'tool',tool_call_id:call.id,content:'OK'});
    }
   }
   pass2Messages.push(...toolResults);
   if(p2result)break;
  }
  if(!p2result){if(mode==='manual')throw Error('LLM 未呼叫生圖工具。');return {decision:'本回合不傳送圖片。'};}
  if(mode!=='line')rememberStoryIllustration(s,p2result.caption);
  return p2result;

 }catch(error){const reason=error instanceof ImageFailure?error.message:error instanceof Error&&error.name==='TimeoutError'?`${stage}逾時，請稍後重試或調整逾時設定。`:signal?.aborted?'圖片請求已取消。':error instanceof ModelError?error.message:`${stage}連線失敗或回應格式無效，請檢查該服務。`;return {notice:`圖片生成未完成：${reason}遊戲可繼續。`};}
}
export async function illustrateScene(s:GameState,c:Content,manual=false,signal?:AbortSignal,onStatus?:(status:'queued'|'running')=>Promise<void>){const result=await requestImage(s,c,manual?'manual':'automatic','',s.character,signal,onStatus);if(result.url)s.dialogue.cg=result.url;return result;}

export function filterModelLoras(data:unknown,family:ModelFamily):{name:string;path:string}[]{
 if(!Array.isArray(data))throw new ImageFailure('SD LoRA 清單格式無效。');
 const selected=data.filter(l=>typeof l?.name==='string'&&typeof l?.path==='string'&&!/[<>:\r\n]/.test(l.name)&&l.path.replace(/\\/g,'/').toLowerCase().includes('/lora/'+family.toLowerCase()+'/'));
 if(selected.some(l=>data.some(other=>other!==l&&other.name===l.name&&other.path!==l.path)))throw new ImageFailure('不同資料夾有同名 LoRA，請加上模型類型前綴重新命名並刷新 WebUI 清單。');
 return selected.map(l=>({name:l.name,path:l.path}));
}
async function modelLoras(settings:ImageSettings,signal?:AbortSignal){
 const response=await apiFetch(imageEndpoint(settings.url).replace(/txt2img$/,'loras'),{signal,redirect:'error',headers:settings.key?{Authorization:'Bearer '+settings.key}:{}});
 if(!response.ok)throw new ImageFailure('無法讀取 SD LoRA 清單，請確認 /sdapi/v1/loras 與模型資料夾。');
 return filterModelLoras(await response.json(),settings.modelFamily);
}
