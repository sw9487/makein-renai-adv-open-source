import {uiText} from '../lib/i18n';
import {sdProfiles,modelDefaults,type ModelFamily} from '../../core/sd-profiles';
import {StableDiffusionHelp} from './stable-diffusion-help';
import {useEffect,useRef,useState} from 'react';
import type {ImageSettings} from '../../server/stable-diffusion';
import {Switch} from './ui/switch';
import {ImageHistoryPanel} from './image-history';
import {notifyEditorSuccess} from './editor-feedback';
type Props={registerSave?:(save:(()=>Promise<void>)|null)=>void;onStatusChange?:(status:{ready:boolean;dirty:boolean;busy:boolean})=>void};
export function StableDiffusionSettings({registerSave,onStatusChange}:Props){
 const [settings,setSettings]=useState<(ImageSettings&{configured:boolean})|null>(null),[key,setKey]=useState(''),[clearKey,setClearKey]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[errors,setErrors]=useState<Record<string,string>>({});
 const baseline=useRef<string|null>(null);
 const snapshot=JSON.stringify({settings,key,clearKey});
 useEffect(()=>{fetch('/api/stable-diffusion').then(r=>r.json()).then(d=>{if(d.error)throw Error(d.error);setSettings(d);setKey(d.key??'');baseline.current=JSON.stringify({settings:d,key:d.key??'',clearKey:false});}).catch(()=>setMessage(uiText("unable_to_read_rendering_settings")));},[]);
 useEffect(()=>{onStatusChange?.({ready:settings!==null&&baseline.current!==null,dirty:baseline.current!==null&&snapshot!==baseline.current,busy});},[snapshot,busy,onStatusChange]);
 async function save(){
  if(!settings||busy)return;
  const next:Record<string,string>={};
  if(settings.enabled){
   if(!settings.url.trim())next.url=uiText("please_enter_the_stable_diffusion_service_url");
   if(!settings.checkpoint.trim())next.checkpoint=uiText("please_enter_the_full_name_of_the_checkpoint_for_the_selected_model");
   if(!settings.sampler.trim())next.sampler=uiText("please_enter_sampler");
   if(!settings.scheduler.trim())next.scheduler=uiText("please_enter_scheduler");
   if(!settings.guide.trim())next.guide=uiText("please_fill_in_the_model_lora_guide");
   if(settings.hiresFix&&!settings.upscaler.trim())next.upscaler=uiText("upscaler_must_be_filled_in_when_opening_hires_fix");
  }
  setErrors(next);
  if(Object.keys(next).length){const first=Object.keys(next)[0];setMessage(uiText("settings_not_saved_yet_please_complete_the_required_fields_marked_in_red"));document.getElementById('sd-'+first)?.focus();return;}
  setBusy(true);
  try{
   const r=await fetch('/api/stable-diffusion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...settings,key,clearKey})});
   const d=await r.json();if(!r.ok)throw Error(d.error);
   setSettings(d);setKey(d.key??'');setClearKey(false);
   baseline.current=JSON.stringify({settings:d,key:d.key??'',clearKey:false});
   const message=uiText("the_drawing_settings_have_been_saved_and_will_take_effect_next_time");setMessage(message);notifyEditorSuccess(message);
  }catch(e){setMessage(e instanceof Error?e.message:uiText("save_failed"));}finally{setBusy(false);}
 }
 useEffect(()=>{registerSave?.(save);return()=>registerSave?.(null);},[registerSave,save]);
 return <section className="service-card"><header><div className="sd-card-heading"><h2>{uiText("technical.stable_diffusion")}</h2><StableDiffusionHelp/></div><p>{uiText("select_the_raw_picture_plug_in_which_is_turned_off_by_default_supports_local_or_online")}</p></header>{settings&&<>
 <label className="permission-card">{uiText("enable_image_generation")} <Switch checked={settings.enabled} onCheckedChange={enabled=>setSettings({...settings,enabled})}/></label>
 <label className="permission-card">{uiText("let_the_llm_choose_story_illustrations")} <Switch checked={settings.automatic} onCheckedChange={automatic=>setSettings({...settings,automatic})}/></label>
 <p className="muted">{uiText("only_illustrate_important_and_non_repetitive_plot_scenes_there_should_be_at_least_three_scenes_between")}</p>
 <p>{uiText("when_automatic_drawing_is_turned_off_the_plot_stage_displays_a_drawing_button_after_enabling_the")}</p>
 <label className={errors.url?'invalid-field':''}>{uiText("service_url")}{settings.enabled&&<span className="required-mark">{uiText("required")}</span>}{uiText("root_url_or_full_sdapi_v1_txt2img")}<input id="sd-url" aria-invalid={!!errors.url} aria-describedby={errors.url?'sd-url-error':undefined} value={settings.url} onChange={e=>{setSettings({...settings,url:e.target.value});setErrors(old=>({...old,url:''}));}} placeholder={uiText("technical.https_your_image_service_example")}/>{errors.url&&<small id="sd-url-error" className="field-error">{errors.url}</small>}</label>
 <label>{uiText("sd.bearerKeyPrefix")}{clearKey?uiText("will_be_cleared_after_saving"):settings.configured?uiText("already_set_leave_blank"):uiText("can_be_left_blank")}）<input type="text" autoComplete="new-password" value={key} onChange={e=>{setKey(e.target.value);setClearKey(false);}}/></label>
 {settings.configured&&<div className="button-row"><button type="button" disabled={busy} onClick={()=>{setClearKey(!clearKey);setKey(clearKey?settings.key:'');}}>{clearKey?uiText("cancel_clear_key"):uiText("clear_saved_keys")}</button>{clearKey&&<span role="status">{uiText("it_will_take_effect_after_clicking_save_drawing_settings")}</span>}</div>}
 <label className={errors.checkpoint?'invalid-field':''}>{uiText("checkpoint_full_name")}{settings.enabled&&<span className="required-mark">{uiText("required")}</span>}{uiText("needs_to_match_selected_model_type")}<input id="sd-checkpoint" aria-invalid={!!errors.checkpoint} aria-describedby={errors.checkpoint?'sd-checkpoint-error':undefined} value={settings.checkpoint} onChange={e=>{setSettings({...settings,checkpoint:e.target.value});setErrors(old=>({...old,checkpoint:''}));}}/>{errors.checkpoint&&<small id="sd-checkpoint-error" className="field-error">{errors.checkpoint}</small>}</label>
 <label>{uiText("model_family")}<select value={settings.modelFamily} onChange={e=>{const modelFamily=e.target.value as ModelFamily;setSettings({...settings,...modelDefaults(modelFamily),modelFamily,checkpoint:''});}}><option value="Pony">{uiText("technical.pony")}</option><option value="Illustrious">{uiText("technical.illustrious")}</option></select></label>
 <p>{uiText("switching_a_model_will_apply_the_character_guide_and_recommended_parameters_of_the_model_and_clear")}</p>
 <p>{uiText("recommended_2")}<a href={sdProfiles[settings.modelFamily].modelUrl} target="_blank" rel="noreferrer">{sdProfiles[settings.modelFamily].label}</a> · <a href={sdProfiles[settings.modelFamily].loraUrl} target="_blank" rel="noreferrer">{uiText("download")} {settings.modelFamily} {uiText("technical.lora_zip")}</a></p>
 <p>{uiText("lora_installation_location")}<code>{uiText("technical.models_lora")}{settings.modelFamily}/</code>{uiText("keep_the_character_subfolder_and_file_name")}</p>
 <button type="button" onClick={()=>setSettings({...settings,...modelDefaults(settings.modelFamily)})}>{uiText("apply_current_model_recommended_parameters_and_guidelines")}</button>
 <details><summary>{uiText("automatically_applied_positive_and_negative_prompt_words")}</summary><p>{sdProfiles[settings.modelFamily].positive}{uiText("scene_tags")} {sdProfiles[settings.modelFamily].suffix}</p><p>{sdProfiles[settings.modelFamily].negative}</p></details>
 <div className="field-grid">
 <label>{uiText("sd.clipSkip")}<input type="number" min={1} max={2} step={1} value={settings.clipSkip} onChange={e=>setSettings({...settings,clipSkip:Number(e.target.value)})}/></label>
 {(['sampler','scheduler'] as const).map(k=><label key={k} className={errors[k]?'invalid-field':''}>{k==='sampler'?'Sampler':'Scheduler'}{settings.enabled&&<span className="required-mark">{uiText("required")}</span>}<input id={'sd-'+k} aria-invalid={!!errors[k]} value={settings[k]} onChange={e=>{setSettings({...settings,[k]:e.target.value});setErrors(old=>({...old,[k]:''}));}}/>{errors[k]&&<small className="field-error">{errors[k]}</small>}</label>)}
 <label>{uiText("sd.samplingSteps")}<input type="number" min={1} max={60} step={1} value={settings.steps} onChange={e=>setSettings({...settings,steps:Number(e.target.value)})}/></label>
 <label>{uiText("technical.cfg")}<input type="number" min={1} max={20} step={0.1} value={settings.cfg} onChange={e=>setSettings({...settings,cfg:Number(e.target.value)})}/></label>
 </div>
 <section className="sd-hires-card" aria-label={uiText("sd.hiresFix")}>
 <label className="sd-hires-heading"><span>{uiText("sd.hiresFix")}</span><Switch checked={settings.hiresFix} aria-controls="sd-hires-fields" aria-expanded={settings.hiresFix} onCheckedChange={hiresFix=>setSettings({...settings,hiresFix})}/></label>
 {settings.hiresFix&&<div className="sd-hires-fields" id="sd-hires-fields">
 <label className={errors.upscaler?'invalid-field':''}>{uiText("sd.upscaler")}<span className="required-mark">{uiText("required")}</span><input id="sd-upscaler" aria-invalid={!!errors.upscaler} value={settings.upscaler} onChange={e=>{setSettings({...settings,upscaler:e.target.value});setErrors(old=>({...old,upscaler:''}));}}/>{errors.upscaler&&<small className="field-error">{errors.upscaler}</small>}</label>
 <div className="field-grid">
 <label>{uiText("sd.upscaleBy")}<input type="number" min={1} max={4} step={0.1} value={settings.upscaleBy} onChange={e=>setSettings({...settings,upscaleBy:Number(e.target.value)})}/></label>
 <label>{uiText("sd.hiresSteps")}<input type="number" min={0} max={60} step={1} value={settings.hiresSteps} onChange={e=>setSettings({...settings,hiresSteps:Number(e.target.value)})}/></label>
 <label>{uiText("sd.denoising")}<input type="number" min={0} max={1} step={0.01} value={settings.denoising} onChange={e=>setSettings({...settings,denoising:Number(e.target.value)})}/></label>
 </div>
 </div>}
 </section>
 <label>{uiText("image_size")}<select value={settings.sizePreset} onChange={e=>setSettings({...settings,sizePreset:e.target.value as ImageSettings['sizePreset']})}><option value="large">{uiText("large_4k_3840_2160")}</option><option value="medium">{uiText("medium_1080p_1920_1080")}</option><option value="small">{uiText("small_768_512")}</option></select></label>
 <p>{uiText("story_pictures_are_fixed_in_horizontal_format_line_pictures_are_fixed_in_vertical_format_use_the")}</p>
 <p>{uiText("manual_image_generation_will_continue_to_wait_for_the_service_to_be_completed_and_cannot_be")}</p>
 <label className={errors.guide?'invalid-field':''}>{uiText("model_lora_guide")}{settings.enabled&&<span className="required-mark">{uiText("required")}</span>}{uiText("the_name_must_be_consistent_with_the_target_service")}<textarea id="sd-guide" aria-invalid={!!errors.guide} rows={14} value={settings.guide} onChange={e=>{setSettings({...settings,guide:e.target.value});setErrors(old=>({...old,guide:''}));}}/>{errors.guide&&<small className="field-error">{errors.guide}</small>}</label>
 </>}<p className={Object.keys(errors).some(k=>errors[k])?'settings-warning':''} role="status">{message}</p><ImageHistoryPanel/></section>;
}
