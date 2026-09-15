import {uiText} from '../lib/i18n';
import {useEffect,useRef,useState} from 'react';
import {Switch} from './ui/switch';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {notifyEditorSuccess} from './editor-feedback';

type Props={registerSave?:(save:(()=>Promise<void>)|null)=>void;onStatusChange?:(status:{ready:boolean;dirty:boolean;busy:boolean})=>void};
export function SearchSettings({registerSave,onStatusChange}:Props){
 const [enabled,setEnabled]=useState(false);
 const [knowledgeEnabled,setKnowledgeEnabled]=useState(false);
 const [provider,setProvider]=useState('brave');
 const [key,setKey]=useState('');
 const [configured,setConfigured]=useState<Record<string,boolean>>({});
 const [keys,setKeys]=useState<Record<string,string>>({});
 const [message,setMessage]=useState('');
 const [dialog,setDialog]=useState('');
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [keyError,setKeyError]=useState('');
 const baseline=useRef<string|null>(null);
 const snapshot=JSON.stringify({enabled,knowledgeEnabled,provider,key,keys});
 useEffect(()=>{
  fetch('/api/web-search').then(r=>r.json()).then(d=>{
   if(d.error)throw Error(d.error);
   setEnabled(d.enabled);setKnowledgeEnabled(d.knowledgeEnabled);setProvider(d.provider);
   setConfigured(d.configured);setKeys(d.keys??{});setKey(d.keys?.[d.provider]??'');
   baseline.current=JSON.stringify({enabled:d.enabled,knowledgeEnabled:d.knowledgeEnabled,provider:d.provider,key:d.keys?.[d.provider]??'',keys:d.keys??{}});
   setReady(true);
  }).catch(e=>setMessage(String(e)));
 },[]);
 useEffect(()=>{onStatusChange?.({ready,dirty:ready&&snapshot!==baseline.current,busy});},[snapshot,ready,busy,onStatusChange]);
 async function save(){
  if(busy||baseline.current===null)return;
  if((enabled||knowledgeEnabled)&&!key.trim()&&!configured[provider]){
   const warning=uiText("the_setting_has_not_been_saved_please_enter_the_api_key_of_the_selected_search_service");
   setKeyError(uiText("api_key_must_be_filled_in_when_enabling_web_search"));setMessage(warning);
   document.getElementById('web-search-key')?.focus();return;
  }
  setKeyError('');setBusy(true);
  try{
   const r=await fetch('/api/web-search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,knowledgeEnabled,provider,key})});
   const d=await r.json();if(!r.ok){setDialog(d.error);return;}
   setConfigured(d.configured);setKeys(d.keys??{});setKey(d.keys?.[d.provider]??'');
   baseline.current=JSON.stringify({enabled,knowledgeEnabled,provider,key:d.keys?.[d.provider]??'',keys:d.keys??{}});
   const success=uiText("web_search_settings_saved");setMessage(success);notifyEditorSuccess(success);
  }catch{setDialog(uiText("save_failed_please_try_again_later"));}finally{setBusy(false);}
 }
 useEffect(()=>{registerSave?.(save);return()=>registerSave?.(null);},[registerSave,save]);
 return <section className="service-card">
  <header><span className="settings-eyebrow">{uiText("knowledge.connected")}</span><h2>{uiText("technical.web_search")}</h2><p>{uiText("let_ai_consult_network_data_when_needed")}</p></header>
  <label className="permission-card">{uiText("game_reply_allow_on_demand_search")} <Switch checked={enabled} onCheckedChange={setEnabled}/></label>
  <label className="permission-card">{uiText("knowledge_building_allows_finding_reference_materials")} <Switch checked={knowledgeEnabled} onCheckedChange={setKnowledgeEnabled}/></label>
  <p>{uiText("the_two_switches_are_controlled_independently_and_share_the_service_and_key_below_with_game_search")}</p>
  <label>{uiText("search.provider")}<select value={provider} onChange={e=>{setKeys({...keys,[provider]:key});setProvider(e.target.value);setKey(keys[e.target.value]??'');setKeyError('');}}><option value="serpapi">{uiText("technical.serpapi")}</option><option value="brave">{uiText("technical.brave_search")}</option></select></label>
  <label className={keyError?'invalid-field':''}>{uiText("search.apiKey")}{(enabled||knowledgeEnabled)&&<span className="required-mark">{uiText("required")}</span>}（{configured[provider]?uiText("already_set_leave_blank"):uiText("not_set")}）<input id="web-search-key" aria-invalid={!!keyError} aria-describedby={keyError?'web-search-key-error':undefined} type="text" autoComplete="new-password" value={key} onChange={e=>{setKey(e.target.value);setKeyError('');}}/>{keyError&&<small id="web-search-key-error" className="field-error">{keyError}</small>}</label>
  <p className={keyError?'settings-warning':''} role="status">{message}</p>
  <Dialog open={!!dialog} onOpenChange={open=>{if(!open)setDialog('');}}><DialogContent><DialogTitle>{uiText("unable_to_save_web_search")}</DialogTitle><DialogDescription>{dialog}</DialogDescription><button onClick={()=>setDialog('')}>{uiText("got_it")}</button></DialogContent></Dialog>
 </section>;
}
