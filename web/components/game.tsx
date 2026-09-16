import {uiText} from '../lib/i18n';
import {useLineScroll} from './use-line-scroll';
import {inboxStatus,lineReadBaseline,messageKey} from '@core/line-inbox';
'use client';
import { Fragment, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {createPortal} from 'react-dom';
import {
  BookOpen,
  MapPin,
  MessageCircle,
  Sun,
  Moon,
  Monitor,
  Save,
  Settings,
  ChevronRight,
  Heart,
  History,
  Image as ImageIcon,
  Calendar,
  ArrowRight,
  Send,
  RefreshCw,
  GraduationCap,
  Users,
  FastForward,
  Play,
  Pause,
  LoaderCircle,
  Home,
  PenLine,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { Content, GameState, Character } from '@core/types';
import { grade, schoolTime, dayPhaseNames, eventEligible } from '@core/engine';
import {schoolCalendar,schoolClosed,schoolUnavailable} from '@core/calendar';
import { characterAvailable, schoolLabel, roleLabel } from '@core/timeline';
import { CharacterAvatar as Avatar } from './character-avatar';
import { SceneCharacterSprite } from './scene-character-sprite';
import {readSSE} from '@core/sse';
import {novelPages,preserveReadingDialogue} from '@core/vn-pages';
import {cleanToolText} from '@core/tool-text';
import {blocksDialoguePaging,freshRetryAction,shouldFadeBeforeAction,shouldOpenMap} from '@core/navigation';
import {lineMessage} from '@core/line';
import {socialSettings,twitterAudibleNotificationTokens,twitterHasUnread} from '@core/twitter';
import {TwitterPanel,TwitterBird} from './twitter-panel';
import {LanguageSelect,useI18n} from '../lib/i18n';
import {useTheme} from '../lib/theme';
import {optimizedSceneUrl,preloadSceneImage} from '../lib/scene-images';
import {spriteBounds} from '../lib/sprite-bounds';
import {socialAppEnabled} from '@core/social-apps';
import {hydrateCharacterDefaults} from '@core/character-defaults';
import {TypewriterText} from './typewriter-text';
import type {StoryLine} from '@core/types';
/** Generated story CGs already contain the complete scene and its characters. */
export function sceneShowsSprite(cg?:string){
  return !cg?.startsWith('/api/media/');
}
const isExternalUrl = (url: string) => /^https?:\/\//i.test(url);
function playNotificationSound(kind:'line'|'twitter'){
  const audio=new Audio(`/assets/sounds/${kind}.mp3`);audio.volume=.8;void audio.play().catch(()=>{});
}
function isProgressConflict(message:string){
  return /同一段進度已被修改|同一欄位同時被更新|進度已在另一個分頁更新|進度已更新|劇情已在另一個分頁推進|Game changed while this request was running|遊戲已讀檔或重新開始|此請求屬於讀檔前|別のタブ|同じ項目|another tab|same field|progress changed/i.test(message);
}
function gameRequestError(data:{error?:string;code?:string}|undefined,fallback:string){
  const error=new Error(data?.error??fallback);
  if(data?.code==='PROGRESS_CONFLICT')error.name='ProgressConflictError';
  return error;
}
export default function Game() {
  const {t,language}=useI18n();
  const {preference:themePreference,dark,setPreference:setTheme,cycle:cycleTheme}=useTheme();
  const [content, setContent] = useState<Content>();
  useEffect(()=>{setContent(current=>current?hydrateCharacterDefaults(structuredClone(current),language):current);},[language]);
  const [state, setState] = useState<GameState>();
  const [busy, setBusy] = useState(false);
  const [sceneTransition,setSceneTransition]=useState<'out'|'in'|''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(()=>{
    if(!notice)return;
    const timer=setTimeout(()=>setNotice(''),3000);
    return ()=>clearTimeout(timer);
  },[notice]);
  const [panel, setPanel] = useState('');
  const [lineLaunching,setLineLaunching]=useState(false);
  const [dateCharacter,setDateCharacter]=useState('');
  const [datePlace,setDatePlace]=useState('');
  const [dateBusy,setDateBusy]=useState(false);
  const [dateStage,setDateStage]=useState<'creating'|'waiting'>('creating');
  const dateLineLaunch=useRef('');
  const [twitterUnread,setTwitterUnread]=useState(false);
  const twitterSoundRun=useRef(''),twitterSoundSeen=useRef(new Set<string>()),lineSoundRun=useRef(''),lineSoundSeen=useRef(new Set<string>()),lineReadAck=useRef(new Set<string>());
  const [phone, setPhone] = useState('kaju');
  const [lineRead,setLineRead]=useState<Record<string,string>>(()=>{
    try{return JSON.parse(localStorage.getItem('makeine-line-read')||'{}')??{};}catch{return {};}
  });
  const lineInbox=Object.fromEntries(Object.entries(state?.messages??{}).map(([id,messages])=>[id,inboxStatus(messages,id,lineRead[id])]));
  const lineLatest=Object.fromEntries(Object.entries(lineInbox).map(([id,value])=>[id,value.latest]));
  const unreadLine=(id:string)=>(lineInbox[id]?.unread??0)>0;
  const hasUnreadLine=(state?.contacts??[]).some(unreadLine);
  useEffect(()=>{
    setTwitterUnread(false);
    if(!state?.runId||!socialAppEnabled(state,'twitter'))return;let live=true;const runId=state.runId;
    const storageKey='makeine-twitter-read:'+runId;
    async function poll(){try{const response=await fetch('/api/twitter',{cache:'no-store'}),data=await response.json();if(!response.ok||!live)return;const audible=new Set(twitterAudibleNotificationTokens(data.twitter));if(twitterSoundRun.current!==runId){twitterSoundRun.current=runId;twitterSoundSeen.current=audible;}else if([...audible].some(token=>!twitterSoundSeen.current.has(token))){playNotificationSound('twitter');twitterSoundSeen.current=audible;}else twitterSoundSeen.current=audible;let read='';try{read=localStorage.getItem(storageKey)??'';}catch{}setTwitterUnread(twitterHasUnread(data.twitter,read));}catch{}}
    const readChanged=()=>void poll();void poll();window.addEventListener('makeine-twitter-read',readChanged);const timer=setInterval(()=>{if(!document.hidden)void poll();},5000);return()=>{live=false;window.removeEventListener('makeine-twitter-read',readChanged);clearInterval(timer);};
  },[state?.runId,state?.socialApps?.twitter,panel]);
  const [lineDrafts,setLineDrafts]=useState<Record<string,string>>({});
  const text=lineDrafts[phone]??'';
  const setText=(value:string)=>setLineDrafts(previous=>({...previous,[phone]:value}));
  const [chatText, setChatText] = useState('');
  const [chatAction, setChatAction] = useState('');
  const [actionOn, setActionOn] = useState(false);
  const [pendingChoice,setPendingChoice]=useState('');
  const [streamReply,setStreamReply]=useState<{speech:string;narration:string;thought:string|null}|null>(null);
  const [pageIndex,setPageIndex]=useState(0);
  const [drawer,setDrawer]=useState<'map'|'status'|''>('');
  const readingDialogue=useMemo(()=>state?.dialogue,[JSON.stringify(state?.dialogue?{...state.dialogue,cg:undefined}:null)]);
  const localizedDialogue=state?.dialogue;
  const [imageGenerating,setImageGenerating]=useState(false);
  const [imageStatus,setImageStatus]=useState('');
  const [imageResultUrl,setImageResultUrl]=useState('');
  const openedMapDialogue=useRef<GameState['dialogue']|undefined>(undefined);
  useEffect(()=>{setDrawer('');},[readingDialogue]);
  const openBacklog=useCallback((node:HTMLDivElement|null)=>{if(node)requestAnimationFrame(()=>{if(node.isConnected)node.scrollTop=node.scrollHeight;});},[]);
  const playerName=content?.characters.find(c=>c.id==='kazuhiko')?.name??uiText("onmizu_kazuhiko");
  const pages=useMemo(()=>state&&localizedDialogue?novelPages(localizedDialogue,playerName):[],[localizedDialogue,playerName]);
  const currentPage=pages[Math.min(pageIndex,Math.max(0,pages.length-1))];
  const morePages=pageIndex<pages.length-1;
  useEffect(()=>{setPageIndex(0);},[readingDialogue]);
  function nextPage(){if(blocksDialoguePaging(requestBusy.current,imageGenerating,!!sceneTransition))return;if(isTyping){setCompletedPage(currentPage);return;}if(morePages)setPageIndex(i=>i+1);}
  function continueScene(){if(isTyping||morePages){nextPage();return;}if(!requestBusy.current&&!sceneTransition&&state&&!state.ended&&!state.dialogue.choices?.length)void action({type:'advance'});}
  const [pendingChat,setPendingChat]=useState<Record<string,unknown>|null>(null);
  const [failedChat,setFailedChat]=useState<Record<string,unknown>|null>(null);
  const [images,setImages]=useState({enabled:false,automatic:false});
  type LineRequest={busy?:boolean;pending?:Record<string,unknown>|null;failed?:Record<string,unknown>|null;reply?:{speech:string}|null;error?:string};
  const lineRequestBusy=useRef(new Set<string>());
  const lineRequestGeneration=useRef(0);
  const [lineRequests,setLineRequests]=useState<Record<string,LineRequest>>({});
  const updateLine=(id:string,patch:LineRequest)=>setLineRequests(previous=>({...previous,[id]:{...previous[id],...patch}}));
  const {busy:lineBusy=false,pending:pendingLine,failed:failedLine,reply:lineReply,error:lineError}=lineRequests[phone]??{};
  const setFailedLine=(value:Record<string,unknown>|null)=>updateLine(phone,{failed:value});
  const requestBusy=useRef(false);
  const reloadGeneration=useRef(0);
  const [tabVisible,setTabVisible]=useState(true);
  useEffect(()=>{
    if(panel!=='phone'||!tabVisible||!lineLatest[phone]||!state||!socialAppEnabled(state,'line'))return;
    if(lineRead[phone]!==lineLatest[phone])setLineRead(previous=>{const next={...previous,[phone]:lineLatest[phone]};try{localStorage.setItem('makeine-line-read',JSON.stringify(next));}catch{}return next;});
    if(!(state?.messages[phone]??[]).some(message=>message.from===phone&&!message.readByPlayerAt))return;
    const key=`${state?.runId}:${phone}:${lineLatest[phone]}`;if(lineReadAck.current.has(key))return;lineReadAck.current.add(key);
    void fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'line-read',character:phone,runId:state?.runId,requestId:crypto.randomUUID()})}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);if(data.state)setState(previous=>previous&&previous.revision>data.state.revision?previous:preserveReadingDialogue(previous,data.state));}).catch(()=>lineReadAck.current.delete(key));
  },[panel,phone,state?.messages,tabVisible]);
  function openLine(){if(state&&socialAppEnabled(state,'line')){setLineLaunching(true);setPanel('phone');}}
  useEffect(()=>{if(!lineLaunching)return;const timer=setTimeout(()=>setLineLaunching(false),700);return()=>clearTimeout(timer);},[lineLaunching]);
  useEffect(()=>{
    const pending=state?.pendingDate??state?.pendingDateInvitation;
    if(!pending||!state||!socialAppEnabled(state,'line')){dateLineLaunch.current='';return;}
    const key=pending.character+':'+pending.place;
    setPhone(pending.character);
    if(dateLineLaunch.current!==key){dateLineLaunch.current=key;openLine();}
  },[state?.pendingDate?.character,state?.pendingDate?.place,state?.pendingDateInvitation?.character,state?.pendingDateInvitation?.place]);

  useEffect(()=>{
    if(!state?.runId||!socialAppEnabled(state,'line'))return;
    const keys=new Set(Object.entries(state.messages).flatMap(([id,messages])=>messages.map((message,index)=>message.from===id?`${id}:${messageKey(message,index)}`:'').filter(Boolean)));
    if(lineSoundRun.current!==state.runId){lineSoundRun.current=state.runId;lineSoundSeen.current=keys;lineReadAck.current.clear();return;}
    if([...keys].some(key=>!lineSoundSeen.current.has(key)))playNotificationSound('line');
    lineSoundSeen.current=keys;
  },[state?.runId,state?.messages,state?.socialApps?.line]);

  const dialogueScroll=useRef<HTMLDivElement>(null);
  const messageScroll=useLineScroll(phone);
  const talkInput=useRef<HTMLTextAreaElement>(null);
  const actionInput=useRef<HTMLTextAreaElement>(null);
  const lineInput=useRef<HTMLTextAreaElement>(null);
  const followDialogue=useRef(true);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(28);
  const [twitterNpcLimit,setTwitterNpcLimit]=useState(3);
  useEffect(()=>{
    if(panel!=='settings'||!state?.runId||!socialAppEnabled(state,'twitter'))return;
    let live=true;void fetch('/api/twitter').then(r=>r.json()).then(data=>{if(live&&Number.isInteger(data.twitter?.npcInteractionLimit))setTwitterNpcLimit(data.twitter.npcInteractionLimit);}).catch(()=>{});
    return()=>{live=false;};
  },[panel,state?.runId,state?.socialApps?.twitter]);
  function changeTwitterNpcLimit(value:number){
    const limit=Math.max(0,Math.min(20,Math.round(value)));setTwitterNpcLimit(limit);
    if(!state?.runId)return;
    void fetch('/api/twitter',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:state.runId,npcInteractionLimit:limit})}).then(async r=>{if(!r.ok){const data=await r.json();throw Error(data.error??'Twitter NPC setting failed');}}).catch(e=>setError(e instanceof Error?e.message:String(e)));
  }
  const [completedPage,setCompletedPage]=useState<StoryLine|undefined>();
  const completeTyping=useCallback((page:StoryLine)=>setCompletedPage(page),[]);
  const isTyping=!!currentPage?.text&&completedPage!==currentPage;
  useEffect(()=>{
    if(!state||!currentPage||isTyping||morePages||sceneTransition||busy||!tabVisible||panel)return;
    if(openedMapDialogue.current===state.dialogue||!shouldOpenMap(state))return;
    openedMapDialogue.current=state.dialogue;
    setDrawer('map');
  },[state?.dialogue,currentPage,isTyping,morePages,sceneTransition,busy,tabVisible,panel]);
  const [saves, setSaves] = useState<
    { slot: number; date?: string; phase?: number }[]
  >([]);
  const [confirm, setConfirm] = useState<{
    label: string;
    action: Record<string, unknown>;
  } | null>(null);
  const [sprite, setSprite] = useState('normal');
  const [sceneBackgroundChoice,setSceneBackgroundChoice]=useState<{source:string;url:string}|null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(()=>{
    if(!state)return;
    let stopped=false,refreshing=false,again=false;
    const refresh=async()=>{
      if(refreshing){again=true;return;}refreshing=true;
      try{
        const response=await fetch('/api/game?line-inbox=1&revision='+(stateRef.current?.revision??-1),{cache:'no-store'});
        if(response.ok){const data=await response.json();if(!stopped&&data.state)setState(previous=>{
          if(!previous||previous.revision>=data.state.revision)return previous;
          if(requestBusy.current)return previous.runId===data.state.runId?{...previous,messages:data.state.messages}:previous;
          return preserveReadingDialogue(previous,data.state);
        });}
      }catch{}finally{refreshing=false;if(again&&!stopped){again=false;void refresh();}}
    };
    const events=new EventSource('/api/game?events=1&language='+encodeURIComponent(language));
    events.addEventListener('sync',refresh);events.addEventListener('change',event=>{
      try{
        const data=JSON.parse((event as MessageEvent).data);
        if(data.type==='image.status'&&data.runId===stateRef.current?.runId){
          setImageStatus(data.imageStatus??'');if(data.imageUrl)setImageResultUrl(data.imageUrl);
        }
      }catch{}
      void refresh();
    });
    return ()=>{stopped=true;events.close();};
  },[!!state,language]);
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
  useEffect(()=>{
    if(talkInput.current)autoGrow(talkInput.current);
    if(actionInput.current)autoGrow(actionInput.current);
    if(lineInput.current)autoGrow(lineInput.current);
  },[chatText,chatAction,actionOn,text]);
  function resetPlaythroughUi(next:GameState,twitterReadKey=''){
    const read=lineReadBaseline(next.messages);
    setLineRead(read);
    try{
      localStorage.setItem('makeine-line-read',JSON.stringify(read));
      if(next.runId)localStorage.setItem('makeine-twitter-read:'+next.runId,twitterReadKey);
    }catch{}
    lineRequestGeneration.current++;
    lineRequestBusy.current.clear();
    setTwitterUnread(false);
    setPhone(next.contacts.includes('kaju')?'kaju':next.contacts[0]??'kaju');
    setLineDrafts({});
    setLineRequests({});
    setChatText('');
    setChatAction('');
    setActionOn(false);
    setPendingChoice('');
    setPendingChat(null);
    setFailedChat(null);
    setStreamReply(null);
    setAuto(false);
    setTwitterNpcLimit(3);
    setImageStatus('');
    setImageResultUrl('');
    setSprite('normal');
    openedMapDialogue.current=undefined;
    followDialogue.current=true;
  }
  async function showState(next:GameState,preserveCursor=false,fadeOut?:Promise<void>,nextSprite=sprite) {
    const previous=stateRef.current;
    if(previous&&previous.revision>next.revision){if(!fadeOut)return;next=previous;preserveCursor=true;}
    const background=(s:GameState)=>{
      const place=content?.places.find(p=>p.id===s.location);
      return s.dialogue.cg||place?.background||(place?.school?'/assets/authored/backgrounds/00000000-0000-4000-8000-000000000111.png':'');
    };
    const spriteImage=(s:GameState)=>{
      const character=content?.characters.find(c=>c.id===s.character);
      return character?.sprites[nextSprite]||character?.sprites.normal||'';
    };
    const spriteImages=(s:GameState)=>{
      const character=content?.characters.find(c=>c.id===s.character);
      const expressions=(s.dialogue.script??[]).filter(line=>line.kind==='speech'&&line.speaker===character?.name&&line.expression).map(line=>character?.sprites[line.expression!]||'');
      return [...new Set([spriteImage(s),...expressions].filter(Boolean))];
    };
    const preloadSprites=(s:GameState)=>Promise.all(spriteImages(s).map(async src=>{
      const [image]=await Promise.all([preloadSceneImage(src),spriteBounds(src)]);
      return image;
    }));
    const changing=previous&&(previous.location!==next.location||previous.date!==next.date||previous.phase!==next.phase||background(previous)!==background(next));
    if(!changing&&!fadeOut){
      const images=await preloadSprites(next);
      if(images.some(image=>!image.loaded))setError(t('game.assetLoadFailed'));
      if(!preserveCursor&&previous&&JSON.stringify(previous.dialogue)!==JSON.stringify(next.dialogue))setPageIndex(0);
      setSprite(nextSprite);
      setState(next);return;
    }
    setDrawer('');
    setSceneTransition('out');
    const source=background(next);
    const [sceneImage,characterImages]=await Promise.all([
      preloadSceneImage(source),
      preloadSprites(next),
      fadeOut??new Promise(resolve=>setTimeout(resolve,1000)),
    ]);
    setSceneBackgroundChoice({source,url:sceneImage.url});
    if(!sceneImage.loaded||characterImages.some(image=>!image.loaded))setError(t('game.assetLoadFailed'));
    setSprite(nextSprite);
    setState(previous=>previous&&previous.revision>next.revision?previous:next);
    if(!preserveCursor)setPageIndex(0);
    await new Promise(resolve=>setTimeout(resolve,400));
    setSceneTransition('in');
    await new Promise(resolve=>setTimeout(resolve,1000));
    setSceneTransition('');
  }
  async function reload() {
    const generation=++reloadGeneration.current;
    try {
      const r = await fetch('/api/game');
      const d = (await r.json()) as {
        error: string;
        content: Content;
        state: GameState;
        saves: { slot: number; date?: string; phase?: number }[];
        mode?: string;
        notice?:string;
        imageStatus?:string;imageUrl?:string;
        imagePending?:boolean;
        images?:{enabled:boolean;automatic:boolean};
      };
      if (!r.ok) throw Error(d.error);
      if(generation!==reloadGeneration.current)return;
      setContent(d.content);
      if(d.images)setImages(d.images);
      if(d.imageStatus)setImageStatus(d.imageStatus);
      if(d.imageUrl)setImageResultUrl(d.imageUrl);
      if(!stateRef.current&&d.state.dialogue.kind==='chat')setSprite(d.state.dialogue.expression??'normal');
      setState(previous=>previous&&previous.revision>d.state.revision?previous:preserveReadingDialogue(previous,d.state));
      setSaves(d.saves);
      if(d.imagePending)void action({type:'generate-image'});
      if(d.notice)setNotice(d.notice);
      setError('');
    } catch (e) {
      if(generation!==reloadGeneration.current)return;
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  async function currentSavedState(){
    const response=await fetch('/api/game?state-only=1',{cache:'no-store'});
    const result=await response.json();
    if(!response.ok||!result.state)throw Error(result.error??t('game.syncFailed'));
    return result.state as GameState;
  }
  useEffect(() => {
    void reload();
    const updated = () => {if(!requestBusy.current)void reload();};
    window.addEventListener('focus', updated);
    const visibility=()=>setTabVisible(!document.hidden);
    visibility();
    document.addEventListener('visibilitychange',visibility);
    return () => {window.removeEventListener('focus', updated);document.removeEventListener('visibilitychange',visibility);};
  }, []);
  async function sendLine(a:Record<string,unknown>){
    const generation=lineRequestGeneration.current;
    a={...a,requestId:a.requestId??crypto.randomUUID(),runId:a.runId??stateRef.current?.runId};
    const id=String(a.character??'');
    if(lineRequestBusy.current.has(id))return;
    const message=String(a.text??'').trim();if(!message)return;
    lineRequestBusy.current.add(id);updateLine(id,{busy:true,pending:{...a,text:message},failed:null,reply:null,error:''});
    setLineDrafts(previous=>({...previous,[id]:''}));
    try{
      const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({...a,text:message,revision:stateRef.current?.revision})});
      let result;
      if(response.ok&&response.headers.get('content-type')?.includes('text/event-stream')&&response.body){
        for await(const frame of readSSE(response.body)){
          const data=JSON.parse(frame.data);
          if(frame.event==='accepted'&&generation===lineRequestGeneration.current&&data.state){
            setState(previous=>previous&&previous.revision>data.state.revision?previous:preserveReadingDialogue(previous,data.state));
            updateLine(id,{pending:null});
          }
          if(frame.event==='delta'&&generation===lineRequestGeneration.current)updateLine(id,{reply:data});
          if(frame.event==='error')throw gameRequestError(data,uiText("line_transmission_failed"));
          if(frame.event==='done')result=data;
        }
      }else result=await response.json();
      if(!response.ok||!result?.state)throw gameRequestError(result,uiText("line_the_connection_was_interrupted_please_try_again"));
      if(generation!==lineRequestGeneration.current)return;
      setState(previous=>previous&&previous.revision>result.state.revision?previous:preserveReadingDialogue(previous,result.state));
      if(result.notice)updateLine(id,{error:result.notice});
    }catch(e){
      if(generation===lineRequestGeneration.current){
        const reason=e instanceof Error?e.message:uiText("line_transmission_failed");
        if(e instanceof Error&&e.name==='ProgressConflictError'||isProgressConflict(reason)){
          try{
            const fresh=await currentSavedState();setState(fresh);
            setLineDrafts(previous=>({...previous,[id]:message}));
            updateLine(id,{error:t('game.lineConflictRestored'),failed:null});
          }catch{updateLine(id,{error:reason,failed:freshRetryAction({...a,text:message})});}
        }else updateLine(id,{error:reason,failed:freshRetryAction({...a,text:message})});
      }
    }
    finally{lineRequestBusy.current.delete(id);if(generation===lineRequestGeneration.current)updateLine(id,{busy:false,pending:null,reply:null});}
  }
  async function action(a: Record<string, unknown>) {
    a={...a,requestId:a.requestId??crypto.randomUUID(),runId:a.runId??stateRef.current?.runId};
    if(a.type==='chat'&&a.channel==='line')return sendLine(a);
    if (requestBusy.current) return;
    reloadGeneration.current++;
    if(a.type==='choose')setPendingChoice(stateRef.current?.dialogue.choices?.[Number(a.index)]?.text??'');
    if(a.type==='chat') {
      const message=String(a.text??'').trim();
      const act=String(a.action??'').trim();
      if(!message&&!act)return;
      a={...a,text:message,...(act?{action:act}:{})};
      if(a.channel==='talk')setChatText('');else setText('');
      if(act)setChatAction('');
      setPendingChat(a);
      setStreamReply(null);
      setFailedChat(null);
      setAuto(false);
      followDialogue.current=true;
    }
    requestBusy.current=true;
    setBusy(true);
    if(a.type==='generate-image'){setImageGenerating(true);setImageStatus('');setImageResultUrl('');}
    setError('');
    setNotice('');
    // Start the visual transition without delaying the narrative request.
    // New stories and known time/place changes fade while it is running.
    const transitioning=shouldFadeBeforeAction(a,stateRef.current?.location);
    let transitionFinished=false;
    const fadeOut=transitioning?new Promise<void>(resolve=>{
      setDrawer('');setPanel('');setSceneTransition('out');
      setTimeout(resolve,1000);
    }):undefined;
    try {
      const r = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',...(a.type==='chat'?{Accept:'text/event-stream'}:{}) },
        body: JSON.stringify({ ...a, sceneRevision:stateRef.current?.sceneRevision??stateRef.current?.revision, revision: stateRef.current?.revision }),
      });
      let payload;
      if(r.ok&&r.headers.get('content-type')?.includes('text/event-stream')&&r.body){
        for await(const frame of readSSE(r.body)){
          const value=JSON.parse(frame.data);
          if(frame.event==='delta')setStreamReply(value);
          if(frame.event==='error')throw gameRequestError(value,uiText("operation_failed"));
          if(frame.event==='done')payload=value;
        }
        if(!payload)throw Error(uiText("the_connection_was_interrupted_please_check_the_progress_again_and_try_again"));
      }else payload=await r.json();
      if(a.type==='generate-image'&&r.ok&&payload.imagePending){
        for(;;){
          await new Promise(resolve=>setTimeout(resolve,1500));
          try{
            const poll=await fetch('/api/game?image-job=1',{cache:'no-store'});
            if(!poll.ok)continue;
            const result=await poll.json();
            setImageStatus(result.imageStatus??'');
            if(result.imageUrl)setImageResultUrl(result.imageUrl);
            if(result.imagePending)continue;
            payload=result;break;
          }catch{ /* A lost polling connection does not cancel the job or unlock the button. */ }
        }
      }
      const d = payload as {
        error: string;
        code?:string;
        content: Content;
        state: GameState;
        saves: { slot: number; date?: string; phase?: number }[];
        mode?: string;
        notice?:string;
        imageStatus?:string;imageUrl?:string;
        imagePending?:boolean;
        images?:{enabled:boolean;automatic:boolean};
        twitterReadKey?:string;
      };
      if (!r.ok) throw gameRequestError(d,uiText("operation_failed"));
      if(a.type==='new'&&d.state)resetPlaythroughUi(d.state,d.twitterReadKey);
      if (d.state) {
        const preserveReading=a.type==='save'||(a.type==='chat'&&a.channel==='line');
        if(a.type==='generate-image')await showState(preserveReadingDialogue(stateRef.current,d.state),true);
        else await showState(preserveReading?preserveReadingDialogue(stateRef.current,d.state):d.state,false,fadeOut,a.type==='chat'&&a.channel==='talk'?d.state.dialogue.expression??'normal':a.type==='save'?sprite:'normal');
        transitionFinished=true;
      }
      if(a.type!=='chat'&&d.state&&a.type!=='save')setFailedChat(null);
      if (a.type === 'save') {
        setNotice(`${uiText("saved_to_field")} ${a.slot}`);
        await reload();
      }
      if (a.type === 'load' || a.type === 'new') setPanel('');
      if(d.notice)setNotice(d.notice);
      if (d.mode === 'offline')
        setNotice(uiText("currently_using_offline_character_lines_ai_free_dialogue_can_be_set_in_the_editor"));
      if(a.type==='chat'&&a.channel==='talk')talkInput.current?.focus();
      return d;
    } catch (e) {
      const reason=e instanceof Error?e.message:uiText("operation_failed");
      if(e instanceof Error&&e.name==='ProgressConflictError'||isProgressConflict(reason)){
        try{
          const fresh=await currentSavedState();
          if(fresh.runId!==stateRef.current?.runId)resetPlaythroughUi(fresh);
          await showState(fresh,false,fadeOut);
          transitionFinished=true;
          setError(t('game.progressSynced'));
          if(a.type==='chat'){
            setChatText(String(a.text??''));
            if(a.action){setActionOn(true);setChatAction(String(a.action));}
            setFailedChat(null);
          }
        }catch{setError(reason);if(a.type==='chat')setFailedChat(freshRetryAction(a));}
      }else{setError(reason);if(a.type==='chat')setFailedChat(freshRetryAction(a));}
      setAuto(false);
    } finally {
      // A rejected request must reveal the unchanged scene instead of leaving it black.
      if(fadeOut&&!transitionFinished){
        await fadeOut;
        setSceneTransition('in');
        await new Promise(resolve=>setTimeout(resolve,1000));
        setSceneTransition('');
      }
      requestBusy.current=false;
      setPendingChat(null);
      setPendingChoice('');
      setStreamReply(null);
      setBusy(false);
      setImageGenerating(false);
    }
  }
  async function inviteDate(){
    if(!dateCharacter||!datePlace)return;
    dateLineLaunch.current=dateCharacter+':'+datePlace;
    setPhone(dateCharacter);setDateBusy(true);setDateStage('creating');openLine();
    try{
      const created=await action({type:'date-invite-create',character:dateCharacter,place:datePlace});
      if(!created?.state?.pendingDateInvitation)return;
      stateRef.current=created.state;
      setDateStage('waiting');
      await action({type:'date-invite-answer'});
    }finally{setDateBusy(false);}
  }
  async function retryDateReply(){
    if(!stateRef.current?.pendingDateInvitation)return;
    setDateBusy(true);setDateStage('waiting');
    try{await action({type:'date-invite-answer'});}finally{setDateBusy(false);}
  }
  useEffect(()=>{
    const el=dialogueScroll.current;
    if(!el)return;
    if(pendingChat?.channel==='talk') {
      if(followDialogue.current)el.scrollTo({top:el.scrollHeight,behavior:'smooth'});
    }else {el.scrollTop=0;followDialogue.current=true;}
  },[readingDialogue,pendingChat,streamReply,pageIndex]);

  useEffect(() => {
    if (
      !auto ||
      isTyping ||
      !tabVisible ||
      (busy && !imageGenerating) ||
      panel ||
      !state ||
      state.ended ||
      (state.dialogue.choices?.length && !morePages)
    )
      return;
    const timer = setTimeout(() => nextPage(), Math.max(1800,(currentPage?.text.length??30)*(80-speed)));
    return () => clearTimeout(timer);
  }, [auto, busy, imageGenerating, panel, state, pageIndex,speed,tabVisible,isTyping]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches('input,textarea,select') ||
        panel ||
        confirm
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        nextPage();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [state, pageIndex, panel, confirm, busy,isTyping,currentPage]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const life = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'read_makeine_progress',
            description:
              'Read current game date, phase, relationship and pending choices.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            execute: () => ({
              date: stateRef.current?.date,
              phase: stateRef.current?.phase,
              affection: stateRef.current?.affection,
              choices: stateRef.current?.dialogue.choices?.map((c) => c.text),
            }),
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => life.abort();
  }, []);
  if (!state || !content)
    return (
      <main className="loading">
        <BookOpen size={40} />
        <h1>{t('app.title')}</h1>
        <p>{error || t('game.loading')}</p>
        {error && <button onClick={reload}>{t('game.reload')}</button>}
      </main>
    );
  const character = content.characters.find((c) => c.id === state.character);
  const pageExpression=pages.slice(0,pageIndex+1).reverse().find(line=>line.kind==='speech'&&line.speaker===character?.name)?.expression;
  const displayedSprite=pageExpression??sprite;
  const place = content.places.find((p) => p.id === state.location);
  const sceneBackgroundSource=state.dialogue.cg||place?.background||(place?.school?'/assets/authored/backgrounds/00000000-0000-4000-8000-000000000111.png':'');
  const sceneBackgroundUrl=sceneBackgroundChoice?.source===sceneBackgroundSource?sceneBackgroundChoice.url:optimizedSceneUrl(sceneBackgroundSource);
  const locked = !!state.dialogue.choices?.length;
  const visited = state.flags.includes(`visited:${state.date}:${state.phase}`);
  const dateLocales:Record<typeof language,string>={ja:'ja','zh-Hant':'zh-TW',en:'en'};
  const today = new Intl.DateTimeFormat(dateLocales[language],{weekday:'short',timeZone:'UTC'}).format(new Date(state.date+'T12:00:00Z'));
  const todayCalendar=schoolCalendar(state.date);
  const todayLabel=t(todayCalendar.openingDay?'calendar.openingDay':todayCalendar.dayType==='summer-vacation'?'calendar.summerVacation':todayCalendar.dayType==='winter-vacation'?(todayCalendar.holiday==='日本新年假期'?'calendar.newYearWinter':'calendar.winterVacation'):todayCalendar.dayType==='spring-vacation'?'calendar.springVacation':todayCalendar.dayType==='golden-week'?'calendar.goldenWeek':todayCalendar.dayType==='public-holiday'?'calendar.publicHoliday':todayCalendar.dayType==='weekend'?'calendar.weekend':'calendar.schoolDay');
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (Date.parse(content.settings.graduationDate) - Date.parse(state.date)) /
        86400000,
    ),
  );
  const phoneChar = content.characters.find((c) => c.id === phone);
  const event = content.events.find((e) => e.id === state.dialogue.eventId);
  const atSchool = schoolTime(state);
  const canVisit =
    !busy &&
    !locked &&
    !visited &&
    !atSchool &&
    state.phase !== 2 &&
    !state.ended;
  return (
    <div className={`game-app vn-game drawer-${drawer||'closed'} ${sceneTransition?'scene-transitioning':''}`}>
      <header className="topbar">
        <a className="brand" href="/">
          <BookOpen size={24} />
          <div>
            {t('app.title')}<small>{t('app.subtitle')}</small>
          </div>
        </a>
        <span className="header-note">{t('app.fanGame')}</span>
        <nav className="header-actions" aria-label={t('nav.gameMenu')}>
          {images.enabled&&!images.automatic&&<button disabled={busy||!!sceneTransition} onClick={()=>void action({type:'generate-image'})}>{imageGenerating?<LoaderCircle size={18} className="spin"/>:<ImageIcon size={18}/>} {imageGenerating?(imageStatus==='queued'?t('game.imageQueued'):t('game.imageRunning')):t('game.generateImage')}</button>}
          <button onClick={() => setPanel('saves')} title={uiText("save_load")}>
            <Save size={18} />
            <span>{t('nav.saves')}</span>
          </button>
          <button onClick={()=>setPanel('settings')}><Settings size={18}/> {t('nav.gameSettings')}</button>
          <a className="icon-link" href="/editor">
            <PenLine size={18} />
            <span>{t('nav.features')}</span>
          </a>
          <button
            onClick={cycleTheme}
            aria-label={t('theme.switch')}
          >
            {themePreference==='system'?<Monitor size={19}/>:dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </nav>
      </header>
      <div className="game-heading">
        <div>
          <p className="eyebrow">
            {uiText("game.chapter")} {String(grade(state, content)).padStart(2, '0')} /
            {t('game.subtitle')}
          </p>
          <h1>
            {state.ended
              ? uiText("graduation_and_then_the_next_page")
              : state.route
                ? uiText("your_name_is_becoming_part_of_the_story")
                : uiText("who_will_you_meet_today")}
          </h1>
        </div>
        <button className="date-pill" onClick={() => setPanel('calendar')}>
          <Calendar size={19} />
          <span>
            {state.date.replaceAll('-', ' . ')} <b>{today}</b>
            <small>
              {uiText("high_school")} {grade(state, content)} {uiText("grade")} {todayLabel} · {dayPhaseNames(state.date)[state.phase]}
            </small>
          </span>
        </button>
      </div>
      {(error || notice) && createPortal(
        <div
          className={error ? 'feedback game-toast error' : 'feedback game-toast'}
          role={error ? 'alert' : 'status'}
        >
          {error || notice}
          <button
            aria-label={uiText("close_notice")}
            onClick={() => {
              setError('');
              setNotice('');
            }}
          >
            ×
          </button>
        </div>,document.body
      )}
      <div className="play-layout">
        {drawer&&<button className="vn-drawer-backdrop" aria-label={uiText("close_sidebar")} onClick={()=>setDrawer('')}/>}
        <aside className="places-panel" inert={drawer!=='map'} aria-hidden={drawer!=='map'}>
          <div className="section-heading">
            <h2>
              <MapPin size={17} /> {content.settings.town}{uiText("dispersion")}
            </h2>
            <small>
              {atSchool
                ? uiText("in_class")
                : state.phase === 2
                  ? uiText("bedtime")
                  : uiText("choose_a_destination")}
            </small>
          </div>
          <div className="place-list">
            {socialAppEnabled(state,'line')&&<button className="place-button date-button" disabled={!canVisit||!state.contacts.length} onClick={()=>{const eligible=state.contacts.find(id=>state.met.includes(id))??'';const destination=content.places.find(item=>!item.school)?.id??'';setDateCharacter(eligible);setDatePlace(destination);setDrawer('');setPanel('date');}}>
              <span className="place-glyph"><Heart size={17}/></span><span>{t('game.planDate')}<small>{t('game.chooseDate')}</small></span>
            </button>}
            {content.places.map((p) => (
              <button
                key={p.id}
                className={
                  'place-button ' + (p.id === state.location ? 'selected' : '')
                }
                disabled={!canVisit || (schoolUnavailable(state.date) && p.school)}
                onClick={() => {
                  setSprite('normal');
                  setDrawer('');
                  void action({ type: 'visit', place: p.id });
                }}
              >
                <span className="place-glyph">
                  {p.id === 'home' ? (
                    <Home size={17} />
                  ) : p.school ? (
                    <BookOpen size={17} />
                  ) : (
                    <MapPin size={17} />
                  )}
                </span>
                <span>
                  {p.name}
                  <small>
                    {canVisit&&content.events.find(e=>e.kind==='canon-inspired'&&eventEligible({...state,location:p.id},content,e))
                      ? uiText("original_event")+content.events.find(e=>e.kind==='canon-inspired'&&eventEligible({...state,location:p.id},content,e))!.title
                      : p.id === state.location
                      ? uiText("current_location")
                      : schoolUnavailable(state.date) && p.school
                        ? t('game.schoolRest').replace('{place}',todayLabel)
                        : (() => {
                            const people = Object.entries(p.weights)
                              .filter(([id, w]) => w > 0 && state.met.includes(id))
                              .sort(([a], [b]) => (state.affection[b] ?? 0) - (state.affection[a] ?? 0))
                              .map(([id]) => content.characters.find(c => c.id === id))
                              .filter((c): c is Character => !!c);
                            if (!people.length) return uiText("perhaps_a_new_encounter_awaits");
                            return people[0].name + (people.length > 1 ? t('game.otherPeople').replace('{count}',String(people.length-1)) : '');
                          })()}
                  </small>
                </span>
                {p.id === state.location && <i />}
              </button>
            ))}
          </div>
          <div className="map-note">
            <span>{uiText("after_class_no_small_restraint")}</span>
            <p>
              {atSchool
                ? uiText("let_s_get_through_today_s_classes_first")
                : state.phase === 2
                  ? uiText("some_feelings_are_easier_to_share_in_a_message")
                  : visited
                    ? uiText("an_encounter_deserves_a_little_time")
                    : place?.subtitle}
            </p>
          </div>
        </aside>
        <section className="story-area" aria-label={uiText("visual_novel_stage")}>
          <div className={`scene-fade ${sceneTransition==='out'?'is-dark':''}`}>
            {sceneTransition==='out'&&<div className="scene-loading" role="status" aria-live="polite">
              <LoaderCircle className="scene-loading-ring" size={24} aria-hidden="true"/>
              <span className="scene-loading-word" aria-hidden="true">{'Loading...'.split('').map((letter,index)=><span key={index} style={{animationDelay:`${index*65}ms`}}>{letter}</span>)}</span>
              <span className="sr-only">{t('common.loading')}</span>
            </div>}
          </div>
          <div
            className={'scene phase-' + state.phase}
            style={{
              ...(state.dialogue.cg?.startsWith('/api/media/')?{backgroundSize:'contain',backgroundRepeat:'no-repeat',backgroundColor:'var(--background)'}:{}),
              backgroundImage: `url("${sceneBackgroundUrl}")`,
            }}
          >
            <div className="scene-shade" />
            <div className="scene-top">
              <span>
                <MapPin size={14} />
                {place?.name}
              </span>
              <span>
                {state.ended
                  ? 'FIN'
                  : event
                    ? 'STORY EVENT'
                    : state.phase === 2
                      ? 'NIGHT'
                      : schoolClosed(state.date)
                        ? state.phase === 0
                          ? 'MORNING'
                          : 'AFTERNOON'
                        : state.phase === 0
                          ? 'DAYTIME'
                          : 'AFTER SCHOOL'}
              </span>
            </div>
            {!place?.school && !place?.background && !state.dialogue.cg && (
              <div className="location-lettering">
                <span>{content.settings.town}</span>
                <b>{place?.name}</b>
                <small>{place?.subtitle}</small>
              </div>
            )}
            {character && sceneShowsSprite(state.dialogue.cg) && (
              <SceneCharacterSprite
                key={character.id}
                src={character.sprites[displayedSprite] || character.sprites.normal}
                normalSrc={character.sprites.normal}
                expressionReferenceSrc={character.sprites.happy}
                normalCrop={character.spriteCrop}
                alt={character.name + uiText("vertical_painting")}
                crop={displayedSprite==='normal'||!character.sprites[displayedSprite] ? character.spriteCrop : undefined}
              />
            )}
            <div className="scene-character-tools">
            {character && (
              <div className="character-tag">
                <span style={{ background: character.color }} />
                <div>
                  {character.name}
                  <small>{character.reading}</small>
                </div>
                <Heart size={15} />
                {state.affection[character.id] ?? 0}
              </div>
            )}
              {socialAppEnabled(state,'twitter')&&<button className="scene-twitter-button" onClick={()=>setPanel('twitter')} aria-label={uiText("open_twitter")}><span className="social-icon-wrap"><TwitterBird size={40}/>{twitterUnread&&<span className="social-unread-dot" role="status" aria-label={t('game.twitterUnread')}/>}</span><span>{uiText("technical.twitter")}</span></button>}
              {socialAppEnabled(state,'line')&&<button className="scene-line-button" onClick={()=>{if(character&&state.contacts.includes(character.id))setPhone(character.id);openLine();}} aria-label={uiText("open_line")}>
                <span className="social-icon-wrap"><img src="/assets/line-brand.png" alt="" width={40} height={40}/>{hasUnreadLine&&<span className="social-unread-dot" role="status" aria-label={uiText("there_are_unread_line_messages")}/>}</span><span>{uiText("technical.line")}</span>
              </button>}
              <nav className="scene-side-actions" aria-label={uiText("game_menu_on_the_left")}><button onClick={()=>setDrawer(drawer==='map'?'':'map')} aria-expanded={drawer==='map'}><MapPin size={18}/> {uiText("map")}</button><button onClick={()=>setPanel('gallery')}><ImageIcon size={18}/> {uiText("memory_album")}</button></nav>
            </div>
            <nav className="scene-right-tools scene-side-actions" aria-label={uiText("game_menu_on_the_right")}><button onClick={()=>setDrawer(drawer==='status'?'':'status')} aria-expanded={drawer==='status'}><Users size={18}/> {uiText("daily")}</button><button onClick={()=>setPanel('log')}><History size={18}/> {uiText("history")}</button></nav>
            {(imageResultUrl||busy)&&<div className="thinking scene-image-feedback">
              {busy&&<span className="scene-image-progress">
                <LoaderCircle size={16} className="spin" /> {imageGenerating?uiText("picture_is_being_generated_please_wait"):uiText("continuing_writing_this_page")}
              </span>}
              {imageResultUrl&&<a className="image-result-action" href={imageResultUrl} target="_blank" rel="noreferrer">{uiText("open_recently_generated_pictures")}</a>}
            </div>}
          </div>
          <div className="dialogue-box">
            <div className="dialogue-top">
              <strong>{pendingChat?.channel==='talk'?character?.name:currentPage?.kind==='narration'?uiText("narration"):currentPage?.speaker??state.dialogue.speaker}{!pendingChat&&currentPage?.kind==='thought'?uiText("heart_unspoken"):''}</strong>
              <span>
                {!pendingChat&&`${Math.min(pageIndex+1,pages.length)} / ${pages.length} · `}{event
                  ? event.kind === 'canon-inspired'
                    ? uiText("original_theme_fan_adaptation")
                    : uiText("original_event_2")
                  : state.route
                    ? 'IF ROUTE'
                    : 'STORY'}
              </span>
            </div>
            <div className="vn-current" ref={dialogueScroll} onWheel={e=>{if(e.deltaY<0)followDialogue.current=false;}} onTouchStart={()=>{followDialogue.current=false;}}>
              {pendingChat?.channel==='talk'?<small role="status">{uiText("waiting_for_reply")}</small>:<button className="vn-page" onClick={nextPage} aria-label={isTyping?uiText("show_full_paragraph"):morePages?uiText("read_next_paragraph"):uiText("you_have_finished_reading_this_paragraph_please_use_the_button_in_the_lower_right_corner_to")}>{currentPage&&<TypewriterText page={currentPage} speed={speed} paused={!tabVisible||!!sceneTransition} instant={!isTyping} onComplete={completeTyping}/>}</button>}
            </div>
            {failedChat?.channel==='talk'&&<div className="vn-retry"><small>{uiText("message_not_sent")}</small><button disabled={busy} onClick={()=>void action(failedChat)}>{uiText("retry")}</button><button onClick={()=>{setChatText(String(failedChat.text??''));if(failedChat.action){setActionOn(true);setChatAction(String(failedChat.action));}setFailedChat(null);}}>{uiText("retrieve_text")}</button></div>}
            {!pendingChoice&&(locked && !morePages && !isTyping ? (
              <div className="choices">
                {state.dialogue.choices!.map((choice, i) => (
                  <button
                    disabled={busy}
                    key={i}
                    onClick={() => void action({ type: 'choose', index: i })}
                  >
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    {choice.text}
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="dialogue-controls">
                {state.phase===2&&state.location==='home'&&character?.id==='kaju'&&state.flags.some(f=>f.startsWith(`home-offer:${state.date}:`))&&!state.flags.includes(`home-evening:${state.date}`)&&<button disabled={busy} onClick={()=>void action({type:'home-evening'})}><Home size={16}/> {uiText("spend_tonight_with_jia_shu")}</button>}
                <button onClick={() => setPanel('log')}>
                  <History size={16} /> {uiText("backlog")}
                </button>
                <button
                  className={auto ? 'active' : ''}
                  disabled={busy&&!imageGenerating}
                  onClick={() => setAuto(!auto)}
                >
                  {auto ? <Pause size={16} /> : <Play size={16} />} {uiText("game.auto")}
                </button>
                {!state.ended || morePages ? (
                  <button
                    className="primary next-button"
                    disabled={busy&&!(imageGenerating&&(isTyping||morePages))}
                    onClick={continueScene}
                  >
                    {isTyping?uiText("show_full_text"):morePages?uiText("next_paragraph"):atSchool
                      ? uiText("complete_today_s_lesson")
                      : state.phase === 2
                        ? uiText("rest_until_tomorrow")
                        : uiText("advance_time")}
                    <ArrowRight size={17} />
                  </button>
                ) : (
                  <button
                    className="primary next-button"
                    onClick={() => setPanel('endings')}
                  >
                    {uiText("view_ending_collection")}
                    <ArrowRight size={17} />
                  </button>
                )}
              </div>
            ))}
            {!locked && !morePages && character && !state.ended && (
              <form
                className="talk-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const act = actionOn ? chatAction.trim() : '';
                  const speech = chatText.trim();
                  if (!speech && !act) return;
                  void action({
                    type: 'chat',
                    character: character.id,
                    text: speech,
                    channel: 'talk',
                    ...(act ? { action: act } : {}),
                  });
                }}
              >
                <div className="talk-fields">
                  <label className="action-toggle">
                    <span>{uiText("action")}</span>
                    <Switch size="sm" checked={actionOn} onCheckedChange={setActionOn} />
                  </label>
                  {actionOn && (
                    <textarea
                      ref={actionInput}
                      aria-label={uiText("player_action")}
                      placeholder={uiText("what_actions_were_taken")}
                      value={chatAction}
                      onChange={(e) => { setChatAction(e.target.value); autoGrow(e.target); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          const t = chatText.trim();
                          if (!t && !e.currentTarget.value.trim()) return;
                          void action({
                            type: 'chat',
                            character: character.id,
                            text: t,
                            channel: 'talk',
                            ...(e.currentTarget.value.trim() ? { action: e.currentTarget.value.trim() } : {}),
                          });
                        }
                      }}
                      rows={1}
                      maxLength={500}
                    />
                  )}
                  <textarea
                    ref={talkInput}
                    aria-label={uiText("talk_with_character")}
                    placeholder={t('game.talkPlaceholder').replace('{name}',character.name)}
                    value={chatText}
                    onChange={(e) => { setChatText(e.target.value); autoGrow(e.target); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        const act = actionOn ? chatAction.trim() : '';
                        if (!e.currentTarget.value.trim() && !act) return;
                        void action({
                          type: 'chat',
                          character: character.id,
                          text: e.currentTarget.value.trim(),
                          channel: 'talk',
                          ...(act ? { action: act } : {}),
                        });
                      }
                    }}
                    rows={1}
                    maxLength={1500}
                  />
                </div>
                <div className="talk-actions">
                  <button
                    disabled={busy || (!chatText.trim() && !(actionOn && chatAction.trim()))}
                    aria-label={uiText("send_dialogue")}
                  >
                    {pendingChat?.channel==='talk'?<LoaderCircle className="spin" size={17}/>:<Send size={17} />}
                  </button>
                  {socialAppEnabled(state,'line')&&!state.contacts.includes(character.id) && (
                    <button
                      type="button"
                      title={t('game.lineAffectionTitle').replace('{value}',String(socialSettings(character).lineAffection))}
                      disabled={busy || (state.affection[character.id] ?? 0) < socialSettings(character).lineAffection}
                      onClick={() => void action({ type: 'contact' })}
                    >
                      <MessageCircle size={16} /> {uiText("exchange_line")}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </section>
        <aside className="right-panel" inert={drawer!=='status'} aria-hidden={drawer!=='status'}>
          <div className="schedule-card">
            <p className="eyebrow">{uiText("game.diaryTitle")}</p>
            <h2>{uiText("today_s_daily_routine")}</h2>
            {dayPhaseNames(state.date).map((phase, i) => (
              <div
                key={phase}
                className={
                  'schedule-row ' + (i === state.phase ? 'current' : '')
                }
              >
                <span className="timeline-dot" />
                <div>
                  <strong>{phase}</strong>
                  <small>
                    {i === 0
                      ? schoolClosed(state.date)
                        ? t('game.freeExplore').replace('{place}',todayLabel)
                        : uiText("shi_ou_high_school_class_time")
                      : i === 1
                        ? uiText("go_and_meet_the_person_you_want_to_meet")
                        : uiText("go_home_and_rest")}
                  </small>
                </div>
                {i < state.phase && <span>✓</span>}
              </div>
            ))}
            <div className="graduation-note">
              <GraduationCap size={18} />
              <span>
                {uiText("until_graduation")} <b>{daysLeft}</b> {uiText("days")}
              </span>
            </div>
          </div>
          <div className="relationships">
            <div className="section-heading">
              <h2>{uiText("affection")}</h2>
              <button
                className="text-button"
                onClick={() => setPanel('people')}
              >
                {uiText("all")} <ChevronRight size={13} />
              </button>
            </div>
            {content.characters
              .filter((c) => c.id !== 'kazuhiko')
              .sort((a,b)=>(state.affection[b.id]??0)-(state.affection[a.id]??0))
              .slice(0,3)
              .map((c) => (
                <button
                  className="relationship"
                  key={c.id}
                  onClick={() => {
                    setPhone(c.id);
                    setPanel('people');
                  }}
                >
                  <Avatar character={c} />
                  <div>
                    <span>
                      {c.name}
                      <small>
                        {state.met.includes(c.id)
                          ? (state.affection[c.id] ?? 0) + ' / 100'
                          : uiText("not_acquainted_yet")}
                      </small>
                    </span>
                    <Progress value={state.affection[c.id] ?? 0} />
                  </div>
                </button>
              ))}
          </div>
        </aside>
      </div>
      <footer className="game-footer">
        <span>{uiText("original_work_yumori_yuki_shogakukan_unofficial_fan_work")}</span>
        <button onClick={() => setPanel('sources')}>
          {uiText("original_reference_and_material_source")}
        </button>
        <span>{uiText("space_continue_selection_will_not_be_automatically_skipped")}</span>
      </footer>
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open&&!dateBusy&&!state.pendingDate&&!state.pendingDateInvitation) setPanel('');
        }}
      >
        <DialogContent
          showCloseButton={panel!=='twitter'&&!dateBusy&&!state.pendingDate&&!state.pendingDateInvitation}
          initialFocus={panel==='phone'?false:undefined}
          className={'game-modal ' + (panel==='twitter'?'twitter-modal':panel === 'phone' ? 'phone-modal'+(lineLaunching?' line-launch-modal':'') : panel==='log'?'history-modal':'')}
        >
          <DialogTitle className={panel==='twitter'||panel==='phone'&&lineLaunching?'sr-only':panel==='phone'?'line-dialog-title':undefined}>
            {panel==='phone'&&!lineLaunching&&<img src="/assets/line-brand.png" width={40} height={40} alt=""/>}
            {(
              {
                phone: uiText("technical.line"),
                twitter: uiText("technical.twitter"),
                saves: uiText("save_load"),
                log: uiText("story_review"),
                people: uiText("characters_and_relationships"),
                gallery: uiText("memory_album"),
                calendar: uiText("school_calendar"),
                settings: uiText("game_settings"),
                sources: uiText("sources_and_assets"),
                endings: uiText("graduation_ending"),
                date: t('game.planDate'),
              } as Record<string, string>
            )[panel] ?? uiText("diary")}
          </DialogTitle>
          <DialogDescription className={panel==='twitter'||panel==='phone'&&lineLaunching?'sr-only':undefined}>
            {panel === 'phone'
              ? uiText("there_are_some_things_i_want_to_say_just_to_you")
              : uiText("these_daily_routines_are_all_part_of_the_story")}
          </DialogDescription>
          {panel==='twitter'&&socialAppEnabled(state,'twitter')&&<TwitterPanel key={state.runId} state={state} content={content} images={images.enabled} onClose={()=>setPanel('')}/>}
          {panel==='date'&&<div className="date-planner"><label><span>{t('game.invitee')}</span><select value={dateCharacter} onChange={event=>setDateCharacter(event.target.value)}>{state.contacts.filter(id=>state.met.includes(id)).map(id=><option key={id} value={id}>{content.characters.find(item=>item.id===id)?.name}</option>)}</select></label><label><span>{t('game.datePlace')}</span><select value={datePlace} onChange={event=>setDatePlace(event.target.value)}>{content.places.filter(item=>!item.school).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="muted">{t('game.inviteExplanation')}</p><button className="primary" disabled={!dateCharacter||!datePlace||busy} onClick={()=>void inviteDate()}><Send size={18}/> {t('game.sendDateInvite')}</button></div>}
          {panel === 'phone' && (lineLaunching?<div className="social-launch line-launch" role="status"><span className="social-launch-logo"><img src="/assets/line-brand.png" width={68} height={68} alt={uiText("technical.line")}/></span><LoaderCircle className="spin" size={30}/><strong>{t('game.openingLine')}</strong></div>:(
            <div className="phone-layout">
              <div className="contact-list">
                {state.contacts.map((id) => (
                  <button
                    className={id === phone ? 'selected' : ''}
                    key={id}
                    disabled={dateBusy||!!state.pendingDate||!!state.pendingDateInvitation}
                    onClick={() => setPhone(id)}
                  >
                    <Avatar
                      character={content.characters.find((c) => c.id === id)}
                    />
                    <span className="line-contact-text">
                      <span className="line-contact-name">{content.characters.find((c) => c.id === id)?.name}</span>
                      {lineRequests[id]?.busy?<small className="line-preview">{t('game.lineSending')}</small>:state.messages[id]?.at(-1)&&<small className="line-preview">{state.messages[id].at(-1)?.text.slice(0,40)}</small>}
                    </span>
                    {unreadLine(id)&&<span className="line-contact-unread" aria-label={uiText("unread_messages")}/>}
                  </button>
                ))}
              </div>
              <div className="chat-pane">
                <h3>
                  {state.contacts.includes(phone)
                    ? phoneChar?.name
                    : uiText("choose_a_contact")}
                </h3>
                {lineError&&<p role="status">{lineError}</p>}
                {dateBusy&&<div className="date-wait" role="status"><LoaderCircle className="spin" size={20}/><span>{t(dateStage==='creating'?'game.dateInvitationCreating':'game.dateInvitationWaiting')}</span></div>}
                {!dateBusy&&state.pendingDateInvitation?.character===phone&&<div className="date-result" role="status"><p>{t('game.dateInvitationReplyFailed')}</p><button className="primary" disabled={busy} onClick={()=>void retryDateReply()}><RefreshCw size={18}/> {t('game.dateInvitationRetry')}</button></div>}
                <div className="message-list" ref={messageScroll}>
                  <div className="line-message-content">
                  {state.contacts.includes(phone) &&
                    (state.messages[phone] ?? []).map(m=>lineMessage(m,phone,content.characters.find(ch=>ch.id===phone)?.name??phone)).map((m, i) => (
                      <Fragment key={i}>
                      {(i===0||state.messages[phone][i-1].date!==m.date)&&<div className="line-date-divider"><time dateTime={m.date}>{m.date}</time></div>}
                      <div
                        className={
                          'message ' +
                          (m.from === 'system' ? 'system' : m.from === 'player' ? 'sent' : 'received')
                        }
                        key={i}
                      >
                        <p data-i18n-skip={m.from!=='system'||undefined}>{m.text}</p>
                        {m.image&&<a href={m.image} target="_blank" rel="noreferrer"><img className="line-photo" src={m.image} alt={m.imageCaption||uiText("photos_from_characters")}/></a>}
                        <small>
                          {m.date} {m.from === 'player' && state.messages[phone][i].readByCharacterAt ? uiText("read") : ''}
                        </small>
                      </div>
                      </Fragment>
                    ))}
                  {!state.messages[phone]?.length && (
                    <p className="empty-copy">
                      {uiText("no_message_yet_send_me_a_greeting_today")}
                    </p>
                  )}
                  {pendingLine?.channel==='line'&&pendingLine.character===phone&&<>{state.messages[phone]?.at(-1)?.date!==state.date&&<div className="line-date-divider"><time dateTime={state.date}>{state.date}</time></div>}<div className="message sent"><p>{String(pendingLine.text)}</p><small role="status">{t('game.lineSending')}</small></div></>}
                  {lineBusy&&lineReply?.speech&&<div className="message received"><p>{lineReply.speech}</p></div>}
                  {failedLine?.channel==='line'&&failedLine.character===phone&&<div className="chat-retry"><p>{uiText("not_sent")}{String(failedLine.text)}</p><button disabled={lineBusy} onClick={()=>void action(failedLine)}>{uiText("retry")}</button><button onClick={()=>{setText(String(failedLine.text));setFailedLine(null);}}>{uiText("return_to_input")}</button></div>}
                  </div>
                </div>
                <form
                  className="message-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({
                      type: 'chat',
                      character: phone,
                      text,
                      channel: 'line',
                    });
                  }}
                >
                  <textarea
                    ref={lineInput}
                    disabled={dateBusy||!!state.pendingDate||!!state.pendingDateInvitation}
                    aria-label={uiText("line_message")}
                    placeholder={uiText("send_a_message_anytime")}
                    value={text}
                    rows={1}
                    maxLength={1500}
                    onChange={(e) => {setText(e.target.value);autoGrow(e.target);}}
                    onKeyDown={e=>{
                      if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){
                        e.preventDefault();
                        if(lineBusy||state.ended||!e.currentTarget.value.trim()||!state.contacts.includes(phone))return;
                        void action({type:'chat',character:phone,text:e.currentTarget.value,channel:'line'});
                      }
                    }}
                  />
                  <button
                    className="primary"
                    disabled={
                      dateBusy || !!state.pendingDate || !!state.pendingDateInvitation ||
                      lineBusy ||
                      state.ended ||
                      !text.trim() ||
                      !state.contacts.includes(phone)
                    }
                  >
                    <Send size={18} />
                  </button>
                </form>
                {state.pendingDate?.character===phone&&<div className="date-result"><p>{state.pendingDate.accepted?t('game.dateAccepted'):t('game.dateDeclined')}</p><button className="primary" disabled={busy} onClick={()=>void action({type:'date-confirm'})}>{t('game.confirmReply')}</button></div>}
                <small>{uiText("line_can_be_used_during_the_day_after_school_and_at_night_sending_messages_will_not")}</small>
              </div>
            </div>
          ))}
          {panel === 'saves' && (
            <>
              <p className="muted">
                {uiText("every_action_is_auto_saved_manual_saves_preserve_progress_before_a_branch")}
              </p>
              <div className="save-grid">
                {saves.map((s) => (
                  <div className="save-card" key={s.slot}>
                    <span>{uiText("game.slot")} {String(s.slot).padStart(2, '0')}</span>
                    <strong>{s.date ?? uiText("blank_diary")}</strong>
                    <small>{s.date ? dayPhaseNames(s.date)[s.phase ?? 0] : uiText("empty_slot")}</small>
                    <div>
                      <button
                        disabled={busy}
                        onClick={() =>
                          s.date
                            ? setConfirm({
                                label: uiText("overwrite_this_save_field"),
                                action: { type: 'save', slot: s.slot },
                              })
                            : void action({ type: 'save', slot: s.slot })
                        }
                      >
                        {uiText("save")}
                      </button>
                      <button
                        disabled={busy || !s.date}
                        onClick={() =>
                          setConfirm({
                            label: uiText("read_this_save_and_replace_current_progress"),
                            action: { type: 'load', slot: s.slot },
                          })
                        }
                      >
                        {uiText("load")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {panel === 'log' && (
            <div className="backlog" tabIndex={0} aria-label={uiText("story_review_the_latest_information_is_at_the_bottom")} ref={openBacklog}>
              <h3>{uiText("previous_story")}</h3>
              {state.log.map((entry, i) => (
                <article key={i}>
                  <small>{entry.date}</small>
                  <strong>{entry.speaker}</strong>
                  <p>{cleanToolText(entry.text)}</p>
                </article>
              ))}
              <h3>{uiText("complete_record_of_current_scene")}</h3>
              {(state.dialogue.script??[{kind:'narration',speaker:state.dialogue.speaker,text:state.dialogue.text}]).map((line,i)=><article key={'current-'+i}><strong>{line.speaker??uiText("narration")}{line.kind==='thought'?uiText("heart_unspoken"):''}</strong><p>{line.kind==='speech'?`「${cleanToolText(line.text)}」`:line.text}</p></article>)}
              {pendingChat?.channel==='talk'&&<article><strong>{playerName}</strong>{!!pendingChat.action&&<p>{String(pendingChat.action)}</p>}{String(pendingChat.text??'').trim()&&<p>「{String(pendingChat.text)}」</p>}<small>{uiText("sent_awaiting_reply")}</small></article>}
              {pendingChoice&&<article><strong>{playerName}{uiText("select")}</strong><p>「{pendingChoice}」</p><small>{uiText("saving_selections")}</small></article>}
              {failedChat?.channel==='talk'&&<article><strong>{playerName}</strong>{!!failedChat.action&&<p>{String(failedChat.action)}</p>}{String(failedChat.text??'').trim()&&<p>「{String(failedChat.text)}」</p>}<small>{uiText("sending_failed_progress_has_not_been_saved_yet")}</small></article>}
            </div>
          )}
          {panel === 'people' && (
            <div className="people-grid">
              {content.characters
                .filter((c) => c.id !== 'kazuhiko')
                .map((c) => (
                  <article className="person-card" key={c.id}>
                    <Avatar character={c} />
                    <div>
                      <h3>{c.name}</h3>
                      <small>{roleLabel(c,state,content)}</small>
                      <small>{schoolLabel(c,state,content)}</small>
                      {!characterAvailable(c,state,content) && <p className="route-hint">{uiText("the_debut_time_has_not_yet_arrived_high")}{c.timeline?.debutYear}{uiText("school_year")} {c.timeline?.debutMonth}{uiText("starting_from_month")}</p>}
                      <p>{c.bio}</p>
                      {c.imageNote && <small className="muted">{c.imageNote}</small>}
                      <Progress value={state.affection[c.id] ?? 0} />
                      {socialAppEnabled(state,'line')&&<small>
                        {state.met.includes(c.id)
                          ? t('game.affectionValue').replace('{value}',String(state.affection[c.id] ?? 0))
                          : uiText("not_acquainted_yet")}{' '}
                        ·{' '}
                        {state.contacts.includes(c.id)
                          ? uiText("exchanged_line")
                          : t('game.lineAffectionNeeded').replace('{value}',String(socialSettings(c).lineAffection))}
                      </small>}

                      {c.romance && (
                        <p className="route-hint">
                          {state.route === c.id
                            ? uiText("entered_if_route")
                            : state.flags.includes(`${c.id}-trust`)
                              ? uiText("trust_has_been_established_starting_from_the_second_year_of_high_school_a_favorable_opinion_of")
                              : uiText("favorability_20_can_trigger_a_trust_event")}
                          <br />
                          {uiText("favorability_75_trust_route_can_welcome_the_ending_of_love")}
                        </p>
                      )}
                      {state.memories[c.id] && (
                        <details>
                          <summary>
                            {uiText("shared_memory")} {state.memories[c.id].turns} {uiText("conversations")}
                          </summary>
                          <p>
                            {state.memories[c.id].facts.join('\n') ||
                              uiText("there_are_no_important_agreements_yet")}
                          </p>
                          <p>
                            {state.memories[c.id].summary ||
                              uiText("recent_conversations_have_not_yet_required_compression")}
                          </p>
                        </details>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          )}
          {panel === 'gallery' && (
            <Tabs defaultValue="events">
              <TabsList className="gallery-tabs">
                <TabsTrigger value="events">{uiText("event_memories")}</TabsTrigger>
                <TabsTrigger value="cg">{uiText("cg_collection")}</TabsTrigger>
                <TabsTrigger value="books">{uiText("bibliography")}</TabsTrigger>
              </TabsList>
              <TabsContent value="events">
                <div className="event-gallery">
                  {content.events.map((e) => (
                    <article key={e.id} className="memory-card">
                      <small>
                        {e.kind === 'original' ? uiText("fan_original") : uiText("rewriting_of_the_original_theme")}
                      </small>
                      <h3>
                        {state.completed.includes(e.id)
                          ? e.title
                          : uiText("memories_not_yet_unlocked")}
                      </h3>
                      {state.completed.includes(e.id) ? (
                        <details className="memory-details">
                          <summary>{uiText("full_text_of_memories")}</summary>
                          <p>{e.text}</p>
                          <small>{e.reference}</small>
                        </details>
                      ) : (
                        <p>{t('game.eventRequirement').replace('{place}',content.places.find((p) => p.id === e.place)?.name??'').replace('{year}',String(e.minYear)).replace('{affection}',String(e.minAffection)).replace('{month}',e.month?t('game.eventMonth').replace('{month}',String(e.month)):'')}</p>
                      )}
                    </article>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="cg">
                {!state.gallery.length ? (
                  <p className="empty-copy">{t('game.emptyGallery')}</p>
                ) : (
                  state.gallery.map((id) => {
                    const e = content.events.find((e) => e.id === id);
                    return e?.cg ? (
                      <figure key={id}>
                        <img
                          className="cg-image"
                          src={e.cg}
                          alt={e.title}
                          draggable={false}
                          onContextMenu={(e) => e.preventDefault()}
                        />
                        <figcaption>
                          {e.title} · {e.reference}
                        </figcaption>
                      </figure>
                    ) : null;
                  })
                )}
              </TabsContent>
              <TabsContent value="books">
                <div className="book-grid">
                  {content.assets.map((a) => {
                    const external = isExternalUrl(a.source);
                    return external ? (
                      <a
                        key={a.id}
                        href={a.source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img src={a.url} alt={a.title} />
                        <h3>{a.title}</h3>
                        <small>{a.note}</small>
                      </a>
                    ) : (
                      <div key={a.id}>
                        <img src={a.url} alt={a.title} />
                        <h3>{a.title}</h3>
                        <small>{a.note}</small>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          )}
          {panel === 'calendar' && (
            <>
              <div className="calendar-summary">
                <Calendar size={34} />
                <h2>
                  {state.date} · {today}
                </h2>
                <p>
                  {uiText("high_2")}{grade(state, content)} · {todayLabel} · {dayPhaseNames(state.date)[state.phase]} {uiText("graduation_day")}{' '}
                  {content.settings.graduationDate}
                </p>
              </div>
              <p>{t('game.calendarHelp')}</p>
              <p className="muted">{t('game.fastForwardHelp')}</p>
              <div className="button-row">
                {[1, 7, 30].map((days) => (
                  <button
                    key={days}
                    disabled={busy || locked || state.ended}
                    onClick={() => {
                      void action({ type: 'skip', days });
                      setPanel('');
                    }}
                  >
                    <FastForward size={16} /> {uiText("skip")} {days} {uiText("days")}
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === 'settings' && (
            <div className="settings-list">
              <label>{t('settings.lineEnabled')}<Switch disabled={busy||!!state.pendingDate||!!state.pendingDateInvitation} checked={socialAppEnabled(state,'line')} onCheckedChange={enabled=>void action({type:'social-settings',app:'line',enabled})}/></label>
              {(state.pendingDate||state.pendingDateInvitation)&&<small className="muted">{t('settings.linePendingDate')}</small>}
              <label>{t('settings.twitterEnabled')}<Switch disabled={busy} checked={socialAppEnabled(state,'twitter')} onCheckedChange={enabled=>void action({type:'social-settings',app:'twitter',enabled})}/></label>
              <label>{t('theme.label')}<select value={themePreference} onChange={event=>setTheme(event.target.value as 'system'|'light'|'dark')}><option value="system">{t('theme.system')}</option><option value="light">{t('theme.light')}</option><option value="dark">{t('theme.dark')}</option></select></label>
              <LanguageSelect />
              <label>
                {t('settings.autoRead')}
                <Switch checked={auto} onCheckedChange={setAuto} />
              </label>
              <div>
                <p>{t('settings.textSpeed')}</p>
                <Slider
                  aria-label={t('settings.textSpeed')}
                  min={5}
                  max={60}
                  value={[speed]}
                  onValueChange={(v) => setSpeed(Array.isArray(v) ? v[0] : v)}
                />
              </div>
              {socialAppEnabled(state,'twitter')&&<div>
                <p>{t('settings.twitterNpcInteractions')}：{twitterNpcLimit}</p>
                <Slider aria-label={t('settings.twitterNpcInteractions')} min={0} max={20} step={1} value={[twitterNpcLimit]} onValueChange={v=>setTwitterNpcLimit(Array.isArray(v)?v[0]:v)} onValueCommitted={v=>changeTwitterNpcLimit(Array.isArray(v)?v[0]:v)}/>
                <small className="muted">{t('settings.twitterNpcInteractionsHelp')}</small>
              </div>}
              {character && Object.keys(character.sprites).length > 1 && (
                <div>
                  <p>{t('settings.expression')}</p>
                  <div className="button-row">
                    {Object.keys(character.sprites).map((key) => (
                      <button key={key} onClick={() => setSprite(key)}>
                        {t(('expression.'+key) as Parameters<typeof t>[0])??key}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <a href="/editor">{t('settings.openFeatures')}</a>
            </div>
          )}
          {panel === 'sources' && (
            <div className="sources">
              <p>
                {uiText("unofficial_fan_work_the_stage_is_set_in_toyohashi_city_aichi_prefecture_not_funabashi_the_opening")}
              </p>
              <p>{t('game.fanDisclaimer')}</p>
              <a
                href="https://makeine-anime.com/character/"
                target="_blank"
                rel="noreferrer"
              >
                {uiText("animation_official_character_introduction_and_17_character_drawings")}
              </a>
              <a
                href="https://gagagabunko.jp/special/makeine/"
                target="_blank"
                rel="noreferrer"
              >
                {uiText("gagaga_bunko_original_work_page_and_official_preview")}
              </a>
              <a
                href="https://recommend.jr-central.co.jp/oshi-tabi/makeine3rd/"
                target="_blank"
                rel="noreferrer"
              >
                {uiText("jr_tokai_toyohashi_stage_cooperation_introduction")}
              </a>
              <p>{t('game.assetDisclaimer')}</p>
            </div>
          )}
          {panel === 'endings' && (
            <>
              <p>
                {uiText("all_endings_are_original_creations_by_fans_collected")} {state.seenEndings.length} {uiText("endings")}
              </p>
              <div className="event-gallery">
                {[
                  'ordinary',
                  'friendship',
                  ...content.characters
                    .filter((c) => c.romance)
                    .flatMap((c) => ['love:' + c.id, 'bittersweet:' + c.id]),
                ].map((id) => (
                  <article className="memory-card" key={id}>
                    <GraduationCap />
                    <h3>
                      {id === 'ordinary'
                        ? uiText("your_own_next_page")
                        : id === 'friendship'
                          ? uiText("see_you_in_the_next_magazine")
                          : `${content.characters.find((c) => c.id === id.split(':')[1])?.name}・${id.startsWith('love') ? uiText("after_spring") : uiText("unsent_message")}`}
                    </h3>
                    <small>
                      {state.seenEndings.includes(id) ? uiText("collected") : uiText("not_yet_arrived")}
                    </small>
                  </article>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{uiText("confirm_diary_operation")}</DialogTitle>
          <DialogDescription>{confirm?.label}</DialogDescription>
          <div className="button-row">
            <button onClick={() => setConfirm(null)}>{uiText("cancel")}</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (confirm) void action(confirm.action);
                setConfirm(null);
              }}
            >
              {uiText("confirm")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
