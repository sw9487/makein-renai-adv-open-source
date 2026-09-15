import {useEffect,useState,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter} from './ui/dialog';
import {LanguageSelect,useI18n} from '../lib/i18n';

const DISCLAIMER_KEY='makeine-disclaimer-v1';

export function GameEntry({children}:{children:ReactNode}){
 const {t}=useI18n();
 const [status,setStatus]=useState<'disclaimer'|'checking'|'confirm'|'ready'>(()=>{try{return localStorage.getItem(DISCLAIMER_KEY)==='accepted'?'checking':'disclaimer';}catch{return 'disclaimer';}});
 const [message,setMessage]=useState('');
 useEffect(()=>{
  if(status!=='checking')return;
  let controller:AbortController|undefined;
  let entered=false;
  function check(){
  if(entered)return;
  controller?.abort();
  const current=new AbortController();controller=current;
  setStatus('checking');
  void fetch('/api/ai-status',{cache:'no-store',signal:current.signal})
   .then(async response=>{
    if(!response.ok)throw Error();
    const result=await response.json();
    if(current.signal.aborted)return;
    if(result.status==='ready'){entered=true;setMessage('');setStatus('ready');return;}
    setMessage(result.message||t(result.status==='missing'?'entry.aiMissing':'entry.aiUnknown'));
    setStatus('confirm');
   }).catch(()=>{
    if(current.signal.aborted)return;
    setMessage(t('entry.aiOffline'));
    setStatus('confirm');
   });
  }
  const restored=(event:PageTransitionEvent)=>{if(event.persisted)check();};
  check();
  window.addEventListener('pageshow',restored);
  window.addEventListener('focus',check);
  return ()=>{controller?.abort();window.removeEventListener('pageshow',restored);window.removeEventListener('focus',check);};
 },[status,t]);
 if(status==='disclaimer')return <main className="launch-disclaimer"><LanguageSelect className="launch-language"/><section className="launch-disclaimer-card" aria-labelledby="disclaimer-title"><span className="launch-eyebrow">{t('disclaimer.eyebrow')}</span><div className="launch-rule"/><h1 id="disclaimer-title">{t('disclaimer.title')}</h1><p className="launch-lead">{t('disclaimer.adapted')}</p><p>{t('disclaimer.rights')}</p><p>{t('disclaimer.notice')}</p><button className="primary launch-continue" onClick={()=>{try{localStorage.setItem(DISCLAIMER_KEY,'accepted');}catch{}setStatus('checking');}}>{t('disclaimer.accept')}<span aria-hidden="true">→</span></button></section></main>;
 if(status==='ready')return <>{children}</>;
 return <main className="loading">
  <h1>{t('app.title')}</h1>
  {status==='checking'&&<p role="status">{t('entry.checking')}</p>}
  <Dialog open={status==='confirm'} onOpenChange={()=>{}}>
   <DialogContent showCloseButton={false}>
    <DialogTitle>{t('entry.aiTitle')}</DialogTitle>
    <DialogDescription>{message}</DialogDescription>
    <p>{t('entry.aiDescription')}</p>
    <DialogFooter>
     <button onClick={()=>setStatus('checking')}>{t('entry.retry')}</button>
     <button className="primary" onClick={()=>{window.location.href='/editor';}}>{t('entry.configure')}</button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 </main>;
}
