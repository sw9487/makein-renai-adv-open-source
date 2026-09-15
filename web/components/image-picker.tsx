import {uiText} from '../lib/i18n';
import {useState} from 'react';
import {Upload,Image as ImageIcon,Trash2} from 'lucide-react';
import type {Content,ImageCrop} from '@core/types';
import {CharacterImage} from './character-image';
import {useI18n} from '../lib/i18n';

export function ImagePicker({label,value,crop,onChange,assets=[],disabled,onBusy}:{label:string;value:string;crop?:ImageCrop;onChange:(url:string)=>void;assets?:Content['assets'];disabled?:boolean;onBusy?:(busy:boolean)=>void}) {
 const {t}=useI18n();
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[library,setLibrary]=useState(false);
 async function upload(file?:File){
  if(!file)return;setPending(true);onBusy?.(true);setError('');
  try{
   if(file.size>5*1024*1024)throw Error(uiText("images_must_not_exceed_5_mb"));
   const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':file.type},body:file});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   onChange(data.url);
  }catch(e){setError(e instanceof Error?e.message:uiText("upload_failed"));}finally{setPending(false);onBusy?.(false);}
 }
 return <section className="image-picker" aria-label={label}>
  <strong>{label}</strong>
  <div className="image-picker-preview">{value?<CharacterImage src={value} alt={label} crop={crop}/>:<span><ImageIcon size={32}/>{uiText("no_picture_has_been_set_yet")}</span>}</div>
  <div className="image-picker-actions">
   <label className="file-button"><Upload size={16}/>{pending?uiText("uploading"):value?uiText("change_image"):uiText("add_image")}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||pending} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label>
   {!!assets.length&&<button type="button" disabled={disabled||pending} onClick={()=>setLibrary(!library)}>{uiText("choose_from_library")}</button>}
   {value&&<button type="button" disabled={disabled||pending} onClick={()=>onChange('')} aria-label={t('image.removeLabel').replace('{label}',label)}><Trash2 size={16}/>{uiText("remove")}</button>}
  </div>
  {library&&<div className="image-picker-library">{assets.filter(a=>a.url).map(a=><button type="button" key={a.id} disabled={disabled||pending} onClick={()=>{onChange(a.url);setLibrary(false);}}><img src={a.url} alt=""/><span>{a.title}</span></button>)}</div>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
