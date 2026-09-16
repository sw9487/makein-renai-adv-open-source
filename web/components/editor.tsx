import {uiText} from '../lib/i18n';
'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import {
  BookOpen,
  Save,
  RotateCcw,
  RefreshCw,
  LoaderCircle,
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Download,
  Check,
  Sun,
  Moon,
  Monitor,
  Settings,
  Users,
  MapPin,
  Clapperboard,
  Image as ImageIcon,
  Languages,
  CalendarDays,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Content, Character, StoryEvent } from '@core/types';
import { CharacterAvatar } from './character-avatar';
import { CharacterImage } from './character-image';
import {ImagePicker} from './image-picker';
import {KnowledgeEditor} from './knowledge-editor';
import {StableDiffusionSettings} from './stable-diffusion-settings';
import {socialSettings,twitterActivityLevels,twitterOnlineProbability} from '@core/twitter';
import {SearchSettings} from './search-settings';
import {editorFeedbackEvent} from './editor-feedback';
import {encounterWeights,stageDate,schoolLabel} from '@core/timeline';
import {createGame} from '@core/engine';
import {schoolCalendarRules} from '@core/calendar';
import {publicAccounts,defaultPublicAccounts,hydratePublicAccounts,publicAccountModules,publicModuleStarterPrompts,type TwitterPublicAccount} from '@core/twitter-public';
import {hydrateCharacterDefaults,displayedCharacterPrompt,isUnmodifiedCharacterField} from '@core/character-defaults';
import {hydrateContentDefaults,isUnmodifiedContentDefault,type ContentDefaultSection} from '@core/content-defaults';
import {hasDefaultOverride,recordChangedDefaultFields,recordTranslatedField} from '@core/default-overrides';
import {LanguageSelect,useI18n} from '../lib/i18n';
import {useTheme} from '../lib/theme';
import {Progress} from '@/components/ui/progress';
import {Slider} from '@/components/ui/slider';
const labels = {
  characters: "characters",
  places: "places_and_encounters",
  events: "event_scripts",
  assets: "asset_library",
  settings: "system_settings",
  knowledge: "knowledge_library",
} as const;
type TranslationSection='characters'|'publicAccounts'|'places'|'events'|'assets';
type TranslationField={path:string;text:string;set:(value:string)=>void};
const publicDefaultsByLanguage=['ja','zh-Hant','en'].map(language=>defaultPublicAccounts(language as 'ja'|'zh-Hant'|'en'));
function unmodifiedTranslationDefault(content:Content,section:TranslationSection,path:string,value:string){
 const [_,index,...fieldParts]=path.split('.'),field=fieldParts.join('.');
 const item=content[section]?.[Number(index)] as {id:string}|undefined;
 if(!item)return false;
 if(hasDefaultOverride(content,section,item.id,field))return false;
 if(section==='characters')return isUnmodifiedCharacterField(item as Content['characters'][number],field,value);
 if(section==='publicAccounts')return publicDefaultsByLanguage.some(accounts=>{
  const original=accounts.find(account=>account.id===item.id);
  return fieldParts.reduce<any>((current,part)=>current?.[part],original)===value;
 });
 return isUnmodifiedContentDefault(section as ContentDefaultSection,item.id,field,value);
}
export function translationFields(content:Content,section:TranslationSection):TranslationField[]{
 const fields:TranslationField[]=[];
 const add=(path:string,value:string|undefined,set:(value:string)=>void)=>{if(value?.trim()&&!value.startsWith('i18n:')&&!unmodifiedTranslationDefault(content,section,path,value))fields.push({path,text:value,set});};
 if(section==='characters')content.characters.forEach((character,i)=>{
  add(`characters.${i}.name`,character.name,value=>character.name=value);
  add(`characters.${i}.reading`,character.reading,value=>character.reading=value);
  add(`characters.${i}.role`,character.role,value=>character.role=value);
  add(`characters.${i}.bio`,character.bio,value=>character.bio=value);
  add(`characters.${i}.prompt`,character.prompt,value=>character.prompt=value);
  add(`characters.${i}.imageNote`,character.imageNote,value=>character.imageNote=value);
  add(`characters.${i}.social.twitterBio`,character.social?.twitterBio,value=>{if(character.social)character.social.twitterBio=value;});
  add(`characters.${i}.timeline.note`,character.timeline?.note,value=>{if(character.timeline)character.timeline.note=value;});
  if(character.source&&!/^https?:\/\//i.test(character.source))add(`characters.${i}.source`,character.source,value=>character.source=value);
  character.roles?.forEach((role,j)=>{add(`characters.${i}.roles.${j}.role`,role.role,value=>role.role=value);add(`characters.${i}.roles.${j}.note`,role.note,value=>role.note=value);});
 });
 if(section==='publicAccounts')content.publicAccounts?.forEach((account,i)=>{
  add(`publicAccounts.${i}.name`,account.name,value=>account.name=value);
  add(`publicAccounts.${i}.bio`,account.bio,value=>account.bio=value);
  add(`publicAccounts.${i}.prompt`,account.prompt,value=>account.prompt=value);
  publicAccountModules.forEach(module=>add(`publicAccounts.${i}.modules.${module}.prompt`,account.modules?.[module]?.prompt,value=>{if(account.modules?.[module])account.modules[module]!.prompt=value;}));
 });
 if(section==='places')content.places.forEach((place,i)=>{add(`places.${i}.name`,place.name,value=>place.name=value);add(`places.${i}.subtitle`,place.subtitle,value=>place.subtitle=value);});
 if(section==='events')content.events.forEach((event,i)=>{
  add(`events.${i}.title`,event.title,value=>event.title=value);add(`events.${i}.reference`,event.reference,value=>event.reference=value);add(`events.${i}.text`,event.text,value=>event.text=value);
  event.script?.forEach((line,j)=>{add(`events.${i}.script.${j}.speaker`,line.speaker,value=>line.speaker=value);add(`events.${i}.script.${j}.text`,line.text,value=>line.text=value);});
  event.choices.forEach((choice,j)=>{add(`events.${i}.choices.${j}.text`,choice.text,value=>choice.text=value);add(`events.${i}.choices.${j}.reply`,choice.reply,value=>choice.reply=value);});
 });
 if(section==='assets')content.assets.forEach((asset,i)=>{add(`assets.${i}.title`,asset.title,value=>asset.title=value);if(asset.source&&!/^https?:\/\//i.test(asset.source))add(`assets.${i}.source`,asset.source,value=>asset.source=value);add(`assets.${i}.note`,asset.note,value=>asset.note=value);});
 return fields;
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
  id,
  error,
  required = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  id?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className={'field '+(error?'invalid-field':'')}>
      <span>{label}{required&&<span className="required-mark">{uiText("required")}</span>}</span>
      {multiline ? (
        <textarea
          id={id}
          aria-invalid={!!error}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
        />
      ) : (
        <input
          id={id}
          aria-invalid={!!error}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error&&<small className="field-error">{error}</small>}
    </label>
  );
}
function AffectionThresholdSlider({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}){
  const current=Math.max(0,Math.min(100,Math.round(Number.isFinite(value)?value:0)));
  return <div className="field editor-affection-slider">
    <div className="editor-affection-slider-heading"><span>{label}</span><output>{current} / 100</output></div>
    <Slider aria-label={label} min={0} max={100} step={1} value={[current]} onValueChange={next=>onChange(Math.max(0,Math.min(100,Math.round(Array.isArray(next)?next[0]:next))))}/>
    <div className="editor-affection-slider-scale" aria-hidden="true"><span>0</span><span>100</span></div>
  </div>;
}
export default function Editor() {
  const {t,language}=useI18n();
  const {preference:themePreference,dark,setPreference:setTheme,cycle:cycleTheme}=useTheme();
  const [data, setData] = useState<Content>();
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState('characters');
  const [settingsTab,setSettingsTab]=useState('story');
  const [searchStatus,setSearchStatus]=useState({ready:false,dirty:false,busy:false});
  const [sdStatus,setSdStatus]=useState({ready:false,dirty:false,busy:false});
  const searchSave=useRef<(()=>Promise<void>)|null>(null);
  const sdSave=useRef<(()=>Promise<void>)|null>(null);
  const registerSearchSave=useCallback((save:(()=>Promise<void>)|null)=>{searchSave.current=save;},[]);
  const registerSdSave=useCallback((save:(()=>Promise<void>)|null)=>{sdSave.current=save;},[]);
  const [selected, setSelected] = useState('anna');
  const [publicId,setPublicId]=useState('official-tsuwabuki');
  const [placeId, setPlaceId] = useState('club');
  const [previewDate,setPreviewDate]=useState('');
  const [eventId, setEventId] = useState('anna-first');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [login, setLogin] = useState(false);
  const [api, setApi] = useState({
    url: '',
    model: '',
    key: '',
    hasKey: false,
    contextTokens:32768,
  });
  const [savedApi,setSavedApi]=useState<typeof api|null>(null);
  const apiDirty=!!savedApi&&JSON.stringify(api)!==JSON.stringify(savedApi);
  const serviceDirty=searchStatus.dirty||sdStatus.dirty||apiDirty;
  const activeService=tab==='settings'?(settingsTab==='search'?searchStatus:settingsTab==='stable-diffusion'?sdStatus:null):null;
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy,setModelsBusy]=useState(false);
  const [modelsMessage,setModelsMessage]=useState('');
  const [apiErrors,setApiErrors]=useState<Record<string,string>>({});
  const [aiState,setAiState]=useState<'checking'|'ready'|'blocked'>('checking');
  const [aiMessage,setAiMessage]=useState('');
  const [translation,setTranslation]=useState<{section:TranslationSection;total:number;completed:number}|null>(null);
  const headerSaveDisabled=busy||!!translation||!data||login||(activeService?!activeService.ready||!activeService.dirty||activeService.busy:tab==='settings'&&settingsTab==='llm'?!apiDirty:!dirty);
  const headerSaveLabel=tab==='settings'?(settingsTab==='search'?t('editor.saveWebSearch'):settingsTab==='stable-diffusion'?t('editor.saveStableDiffusion'):settingsTab==='llm'?t('editor.saveAi'):t('editor.save')):t('editor.save');
  const [preview, setPreview] = useState(false);
  const [pendingImport, setPendingImport] = useState<Content>();
  const [resetOpen, setResetOpen] = useState(false);
  const [newStoryOpen,setNewStoryOpen]=useState(false);
  const calendarDate=(value:string)=>value.replace('-', '/');
  const calendarRules=[
    {title:t('editor.calendar.summerTitle'),range:t('editor.calendar.summerRange').replace('{start}',calendarDate(schoolCalendarRules.summerVacationStart))},
    {title:t('editor.calendar.winterTitle'),range:t('editor.calendar.winterRange').replace('{start}',calendarDate(schoolCalendarRules.winterVacationStart))},
    {title:t('editor.calendar.springTitle'),range:t('editor.calendar.springRange').replace('{start}',calendarDate(schoolCalendarRules.springVacationStart))},
    {title:t('editor.calendar.goldenTitle'),range:`${calendarDate(schoolCalendarRules.goldenWeekStart)} — ${calendarDate(schoolCalendarRules.goldenWeekEnd)}`},
    {title:t('editor.calendar.newYearTitle'),range:`${calendarDate(schoolCalendarRules.newYearHolidayStart)} — ${calendarDate(schoolCalendarRules.newYearHolidayEnd)}`},
    {title:t('editor.calendar.nationalTitle'),range:t('editor.calendar.nationalRange')},
  ];
  async function load() {
    try {
      const r = await fetch('/api/editor');
      const d = (await r.json()) as {
        error: string;
        content: Content;
        revision: number;
        sourceSaved?: boolean;
        warning?: string;
        api: { url: string; model: string;contextTokens:number; key: string; hasKey: boolean };
      };
      if (r.status === 401) {
        setLogin(true);
        return;
      }
      if (!r.ok) throw Error(d.error);
      setLogin(false);
      setData(d.content);
      setRevision(d.revision);
      setApi({ ...d.api, key: d.api.key ?? '' });
      setSavedApi({ ...d.api, key: d.api.key ?? '' });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : uiText("read_failed"));
    }
  }
  async function refreshAiStatus(){
    setAiState('checking');
    try{const response=await fetch('/api/ai-status',{cache:'no-store'}),result=await response.json();if(!response.ok)throw Error();setAiState(result.status==='ready'?'ready':'blocked');setAiMessage(result.message??'');}
    catch{setAiState('blocked');setAiMessage(t('editor.aiStatusUnavailable'));}
  }
  useEffect(() => {
    void load();
    void refreshAiStatus();
  }, []);
  useEffect(()=>{setData(current=>current?hydratePublicAccounts(hydrateContentDefaults(hydrateCharacterDefaults(structuredClone(current),language),language),language):current);},[language]);
  useEffect(() => {
    const show = (event: Event) => {
      setError('');
      setFeedback((event as CustomEvent<string>).detail);
    };
    window.addEventListener(editorFeedbackEvent, show);
    return () => window.removeEventListener(editorFeedbackEvent, show);
  }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty||serviceDirty||translation) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty,serviceDirty,translation]);
  function edit(fn: (x: Content) => void) {
    if (!data) return;
    const copy = structuredClone(data);
    fn(copy);
    setData(recordChangedDefaultFields(data,copy));
    setDirty(true);
    setFeedback('');
  }
  async function post(payload: unknown) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const r = await fetch('/api/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as {
        error: string;
        content: Content;
        revision: number;
        sourceSaved?: boolean;
        warning?: string;
        api: { url: string; model: string;contextTokens:number; hasKey: boolean };
      };
      if (!r.ok) throw Error(d.error);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : uiText("save_failed"));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function loadModels() {
    if (modelsBusy) return;
    if (!api.url.trim()) {
      setModelsMessage(uiText("please_enter_the_api_url_first"));
      return;
    }
    setModelsBusy(true);
    setModelsMessage('');
    try {
      const r = await fetch('/api/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'list-models', url: api.url, key: api.key }),
      });
      const d = (await r.json()) as { error: string; models?: string[] };
      if (!r.ok) throw Error(d.error);
      const list = [...new Set((d.models ?? []).filter(model=>typeof model==='string'&&model.trim()))];
      setModels(list);
      setModelsMessage(t('editor.modelsFound').replace('{count}',String(list.length)));
    } catch (e) {
      setModelsMessage(e instanceof Error ? e.message : uiText("query_model_failed"));
      setModels([]);
    } finally {
      setModelsBusy(false);
    }
  }
  async function save() {
    const r = await post({ type: 'content', content: data, revision });
    if (r) {
      setRevision(r.revision);
      if(r.content) setData(r.content);
      setDirty(false);
      setFeedback(t('editor.save'));
    }
  }
  async function resetDefaults() {
    const r = await post({ type: 'reset-content', revision });
    if (!r) return;
    setData(r.content);
    setRevision(r.revision);
    setSelected(r.content.characters[0]?.id ?? '');
    setPlaceId(r.content.places[0]?.id ?? '');
    setEventId(r.content.events[0]?.id ?? '');
    setPendingImport(undefined);
    setDirty(false);
    setResetOpen(false);
    setFeedback(uiText("reverted_to_the_default_content_of_the_current_code_and_synced_to_the_game"));
  }
  function saveFromHeader(){
    if(tab==='settings'){
      if(settingsTab==='search'){void searchSave.current?.();return;}
      if(settingsTab==='stable-diffusion'){void sdSave.current?.();return;}
      if(settingsTab==='llm'){void saveApiSettings();return;}
    }
    void save();
  }
  async function saveApiSettings() {
    const errors:Record<string,string>={};
    if(!api.url.trim())errors.url=uiText("please_enter_the_api_url");
    if(!api.model.trim())errors.model=uiText("please_enter_or_select_a_model");
    if(!api.key.trim()&&!api.hasKey)errors.key=uiText("please_enter_api_key");
    if(!Number.isInteger(api.contextTokens)||api.contextTokens<4096||api.contextTokens>2000000)errors.contextTokens=uiText("please_enter_an_integer_between_4096_2000000");
    setApiErrors(errors);
    if(Object.keys(errors).length){
      setFeedback('');
      setError(uiText("settings_not_saved_yet_please_complete_the_required_fields_marked_in_red"));
      document.getElementById('llm-'+Object.keys(errors)[0])?.focus();
      return;
    }
    if (await post({type:'api',url:api.url,model:api.model,contextTokens:api.contextTokens,key:api.key})) {
      const saved={...api,key:api.key,hasKey:!!api.key||api.hasKey};
      setApi(saved);setSavedApi(saved);
      setAiState('ready');setAiMessage('');
      setFeedback(t('editor.aiSaveVerified'));
    }
  }
  async function translateSection(section:TranslationSection){
    if(!data||translation||aiState!=='ready')return;
    const next=structuredClone(data);if(section==='publicAccounts')next.publicAccounts??=defaultPublicAccounts(language);const fields=translationFields(next,section),total=fields.length;
    if(!total){setFeedback(t('editor.translateEmpty'));return;}
    setError('');setFeedback('');setTranslation({section,total,completed:0});
    let cursor=0,completed=0,failure:Error|undefined;
    const worker=async()=>{while(!failure){const index=cursor++;if(index>=fields.length)return;const field=fields[index];try{const response=await fetch('/api/editor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'translate-field',section,path:field.path,text:field.text,language})});const result=await response.json();if(!response.ok)throw Error(result.error||t('editor.public.errorTranslate'));field.set(result.translation);recordTranslatedField(next,field.path);completed++;setTranslation({section,total,completed});}catch(error){failure=error instanceof Error?error:Error(t('editor.public.errorTranslate'));}}};
    await Promise.all(Array.from({length:Math.min(4,total)},worker));
    if(failure)setError(t('editor.translateFailed').replace('{message}',failure.message));
    else{setData(next);setDirty(true);setFeedback(t('editor.translateComplete').replace('{count}',String(total)));}
    setTranslation(null);
  }
  function translationToolbar(section:TranslationSection,title:string){
    const disabled=aiState!=='ready'||busy||!!translation;
    return <div className="editor-section-toolbar"><div><p className="eyebrow">{uiText("editor.aiTranslation")}</p><h2>{title}</h2></div><button type="button" className="ai-translate-button" disabled={disabled} title={aiState==='ready'?t('editor.translateTooltip'):aiMessage||t('editor.aiNotReady')} onClick={()=>void translateSection(section)}><Languages size={17}/><span>{t('editor.translateButton')}</span></button></div>;
  }
  function exportJson() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'makeine-content.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importJson(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1500000) throw Error(uiText("files_must_not_exceed_1_5mb"));
      const parsed = JSON.parse(await file.text());
      if (
        !parsed.characters ||
        !parsed.places ||
        !parsed.events ||
        !parsed.settings
      )
        throw Error(uiText("not_a_game_content_file"));
      setPendingImport(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : uiText("import_failed"));
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw Error(uiText("pictures_must_not_exceed_5mb"));
      const r = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const result = (await r.json()) as { url: string; error: string };
      if (!r.ok) throw Error(result.error);
      edit((x) =>
        x.assets.push({
          id: 'asset-' + Date.now(),
          title: file.name,
          url: result.url,
          source: '',
          note: uiText("user_import_please_provide_the_source_and_corresponding_event"),
        }),
      );
      setFeedback(uiText("the_picture_has_been_added_to_the_material_library_you_can_select_the_picture_card_of"));
    } catch (e) {
      setError(e instanceof Error ? e.message : uiText("upload_failed"));
    } finally {
      setBusy(false);
    }
  }
  const ch = data?.characters.find((c) => c.id === selected);
  const publicList=data?publicAccounts(data):[];
  const selectedPublic=publicList.find(account=>account.id===publicId)??publicList[0];
  function changePublic<K extends keyof TwitterPublicAccount>(key:K,value:TwitterPublicAccount[K]){edit(x=>{const account=(x.publicAccounts??=defaultPublicAccounts(language)).find(item=>item.id===(selectedPublic?.id??publicId));if(account)account[key]=value;});}
  const place = data?.places.find((p) => p.id === placeId);
  const event = data?.events.find((e) => e.id === eventId);
  async function startNewStory(){
    setBusy(true);setError('');
    try{
      let currentResponse=await fetch('/api/game?state-only=1',{cache:'no-store'});
      let current=await currentResponse.json();
      if(currentResponse.ok&&!current.state){currentResponse=await fetch('/api/game',{cache:'no-store'});current=await currentResponse.json();}
      if(!currentResponse.ok||!current.state)throw Error(current.error||t('editor.public.errorProgress'));
      const response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'new',revision:current.state.revision,runId:current.state.runId,requestId:crypto.randomUUID()})});
      const result=await response.json();
      if(!response.ok||!result.state)throw Error(result.error||t('editor.public.errorNewStory'));
      window.location.assign('/');
    }catch(error){setError(error instanceof Error?error.message:String(error));setNewStoryOpen(false);setBusy(false);}
  }
  function changeCharacter<K extends keyof Character>(
    key: K,
    value: Character[K],
  ) {
    edit((x) => {
      const c = x.characters.find((c) => c.id === selected);
      if (c) c[key] = value;
    });
  }
  function changeEvent<K extends keyof StoryEvent>(
    key: K,
    value: StoryEvent[K],
  ) {
    edit((x) => {
      const e = x.events.find((e) => e.id === eventId);
      if (e) {e[key] = value;if(key==='script' && Array.isArray(value)) e.text=(value as NonNullable<StoryEvent['script']>).map(line=>line.kind==='speech'?`${line.speaker??''}：「${line.text}」`:line.text).join('\n\n');}
    });
  }
  return (
    <div className="editor-app">
      <header className="topbar">
        <a className="brand" href="/">
          <BookOpen />
          <div>
            {uiText("diary_after_class")}<small>{uiText("editor.storyEditor")}</small>
          </div>
        </a>
        <div className="header-actions">
          <a className={'icon-link '+(aiState!=='ready'||translation?'is-disabled':'')} aria-disabled={aiState!=='ready'||!!translation} title={aiState==='ready'?undefined:aiMessage||t('editor.public.aiRequired')} href="/" onClick={event=>{if(aiState!=='ready'||translation)event.preventDefault();}}>
            <ArrowLeft size={17} /> {t('editor.back')}
          </a>
          <button
            aria-label={t('theme.switch')}
            onClick={cycleTheme}
          >
            {themePreference==='system'?<Monitor size={18}/>:dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            disabled={busy || !data || login || !!translation}
            onClick={() => { setError(''); setResetOpen(true); }}
          >
            <RotateCcw size={17} /> {t('editor.restore')}
          </button>
          <button
            className="primary"
            disabled={headerSaveDisabled}
            onClick={saveFromHeader}
          >
            <Save size={17} />
            {busy||activeService?.busy ? t('editor.saving') : headerSaveLabel}
          </button>
        </div>
      </header>
      <main className="editor-main">
        <div className="editor-heading">
          <div>
            <p className="eyebrow">{uiText("editor.storyBehindStory")}</p>
            <h1>{t('editor.heading')}</h1>
            <p className="muted">{t('editor.description')}</p>
          </div>
          <span className={'status-chip ' + (dirty||serviceDirty ? 'unsaved' : '')}>
            <Check size={14} />
            {dirty||serviceDirty ? t('editor.unsaved') : t('editor.synced')}
          </span>
        </div>
        {(error || feedback) && (
          <div
            className={'feedback editor-toast ' + (error ? 'error' : '')}
            role={error ? 'alert' : 'status'}
          >
            <span>{error || feedback}</span>
            <button type="button" aria-label={uiText("close_notice")} onClick={() => { setError(''); setFeedback(''); }}>{uiText("close")}</button>
          </div>
        )}
        {login ? (
          <form
            className="login-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await post({ type: 'login', password })) {
                setPassword('');
                await load();
              }
            }}
          >
            <h2>{t('editor.login')}</h2>
            <p>{t('editor.password')}</p>
            <input
              type="password"
              aria-label={uiText("editor_password")}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="primary" disabled={busy}>
              {uiText("sign_in")}
            </button>
          </form>
        ) : !data ? (
          <p>{uiText("loading_settings")}</p>
        ) : (
          <Tabs value={tab} onValueChange={(v) => {if(!translation)setTab(String(v));}}>
            <TabsList className="editor-tabs">
              {Object.entries(labels).map(([key, label], i) => (
                <TabsTrigger key={key} value={key} disabled={!!translation}>
                  {
                    [
                      <Users size={16} />,
                      <MapPin size={16} />,
                      <Clapperboard size={16} />,
                      <ImageIcon size={16} />,
                      <Settings size={16} />,
                    ][i]
                  }
                  {uiText(label)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="characters">
              <Tabs defaultValue="game-characters">
                <TabsList className="settings-subtabs"><TabsTrigger value="game-characters" disabled={!!translation}>{t('editor.public.characters')}</TabsTrigger><TabsTrigger value="public-accounts" disabled={!!translation}>{t('editor.public.accounts')}</TabsTrigger></TabsList>
                <TabsContent value="game-characters">
                  {translationToolbar('characters',uiText("characters"))}
              <div className="editor-layout">
                <aside className="editor-list">
                  {data.characters.map((c) => (
                    <button
                      key={c.id}
                      className={selected === c.id ? 'selected' : ''}
                      onClick={() => setSelected(c.id)}
                    >
                      <span
                        className="color-dot"
                        style={{ background: c.color }}
                      />
                      <span>
                        {c.name}
                        <small>{c.role}</small>
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const id = 'character-' + Date.now();
                      edit((x) =>
                        x.characters.push({
                          id,
                          name: uiText("new_roles"),
                          reading: '',
                          color: '#748caf',
                          role: uiText("first_grade"),
                          bio: '',
                          prompt: '',
                          sprites: { normal: '' },
                          romance: false,
                          year: 1,
                          source: '',
                          timeline: {school:'tsuwabuki',baseGrade:1,debutYear:1,debutMonth:7,note:''},
                        }),
                      );
                      setSelected(id);
                    }}
                  >
                    <Plus size={16} /> {uiText("add_character")}
                  </button>
                </aside>
                {ch && (
                  <section className="editor-detail">
                    <div className="detail-heading">
                      <div>
                        <p className="eyebrow">{uiText("editor.characterPrefix")} {ch.id}</p>
                        <h2>{ch.name}</h2>
                      </div>
                      <button onClick={() => setPreview(true)}>{uiText("preview_sprite")}</button>
                    </div>
                    <div className="field-grid">
                      <Field
                        label={uiText("display_name")}
                        value={ch.name}
                        onChange={(v) => changeCharacter('name', v)}
                      />
                      <label className="field"><span>{uiText("gender_for_role_pronouns")}</span>
                        <select value={ch.gender??'unspecified'} onChange={e=>changeCharacter('gender',e.target.value as Character['gender'])}>
                          <option value="male">{uiText("male_him")}</option><option value="female">{uiText("female_her")}</option><option value="unspecified">{uiText("unspecified_other_party")}</option>
                        </select>
                      </label>
                      <Field
                        label={uiText("japanese_reading")}
                        value={ch.reading}
                        onChange={(v) => changeCharacter('reading', v)}
                      />
                      <Field
                        label={uiText("identity_tag_backup_when_handover_is_not_configured")}
                        value={ch.role}
                        onChange={(v) => changeCharacter('role', v)}
                      />
                      <Field
                        label={uiText("accent_color")}
                        type="color"
                        value={ch.color}
                        onChange={(v) => changeCharacter('color', v)}
                      />
                      <ImagePicker label={uiText("character_avatar")} value={ch.avatar??''} crop={ch.avatarCrop} assets={data.assets} disabled={busy} onBusy={setBusy} onChange={v=>{changeCharacter('avatar',v);changeCharacter('avatarCrop',undefined);}}/>
                      <label className="switch-field">
                        {uiText("enable_romance_route")}
                        <Switch
                          checked={ch.romance}
                          onCheckedChange={(v) => changeCharacter('romance', v)}
                        />
                      </label>
                    </div>
                    <h3>{uiText("line_and_twitter")}</h3><div className="field-grid">
                      <AffectionThresholdSlider label={t('editor.lineAffectionMinimum')} value={socialSettings(ch).lineAffection} onChange={value=>changeCharacter('social',{...socialSettings(ch),lineAffection:value})}/>
                      <Field label={uiText("twitter_account_without")} value={socialSettings(ch).twitterHandle} onChange={v=>changeCharacter('social',{...socialSettings(ch),twitterHandle:v})}/>
                      <Field label={t('editor.characterTwitterBio')} value={socialSettings(ch,language).twitterBio} onChange={v=>changeCharacter('social',{...socialSettings(ch,language),twitterBio:v.slice(0,160)})}/>
                      <ImagePicker label={t('editor.characterTwitterCover')} value={socialSettings(ch).twitterCover??''} assets={data.assets} disabled={busy} onBusy={setBusy} onChange={v=>changeCharacter('social',{...socialSettings(ch),twitterCover:v})}/>
                      <label className="switch-field">{uiText("private_twitter_account")}<Switch checked={socialSettings(ch).twitterPrivate} onCheckedChange={v=>changeCharacter('social',{...socialSettings(ch),twitterPrivate:v})}/></label>
                      <label className="switch-field">{t('editor.followBack')}<Switch checked={socialSettings(ch).twitterFollowBack} onCheckedChange={v=>changeCharacter('social',{...socialSettings(ch),twitterFollowBack:v})}/></label>
                      <AffectionThresholdSlider label={t('editor.twitterAffectionMinimum')} value={socialSettings(ch).twitterAffection} onChange={value=>changeCharacter('social',{...socialSettings(ch),twitterAffection:value})}/>
                      <label className="field"><span>{uiText("twitter_online_frequency_2")} {t(`twitter.activity.${socialSettings(ch).twitterActivity}`)}</span>
                        <input type="range" min={0} max={2} step={1} value={twitterActivityLevels.indexOf(socialSettings(ch).twitterActivity)} aria-label={uiText("twitter_online_frequency")} aria-valuetext={t(`twitter.activity.${socialSettings(ch).twitterActivity}`)} style={{width:'100%',accentColor:'#1da1f2',cursor:'pointer'}} onChange={e=>changeCharacter('social',{...socialSettings(ch),twitterActivity:twitterActivityLevels[Number(e.target.value)]})}/>
                        <span aria-hidden="true" style={{display:'flex',justifyContent:'space-between'}}><span>{uiText("low")}</span><span>{uiText("middle")}</span><span>{uiText("high_2")}</span></span>
                        <small>{t('editor.onlineChance').replace('{percent}',String(Math.round(twitterOnlineProbability(ch)*100)))}</small>
                      </label>
                    </div><p className="muted">{uiText("after_the_personal_account_reaches_the_favorability_standard_the_character_will_decide_whether_to_agree_or")}</p>
                    {ch.timeline && <>
                      <h3>{uiText("grade_and_appearance_time")}</h3>
                      <div className="field-grid">
                        <label className="field"><span>{uiText("opening_school_category")}</span><select value={ch.timeline.school} onChange={e=>changeCharacter('timeline',{...ch.timeline!,school:e.target.value as NonNullable<Character['timeline']>['school']})}>
                          <option value="tsuwabuki">{uiText("shilou_high_school")}</option><option value="middle">{uiText("taoyuan_middle_school")}</option><option value="ayame">{uiText("ayame_high_school")}</option><option value="staff">{uiText("teacher")}</option><option value="outside">{uiText("off_campus")}</option>
                        </select></label>
                        <Field label={uiText("opening_grade_0_next_year_enrollment_teacher")} type="number" value={ch.timeline.baseGrade} onChange={v=>changeCharacter('timeline',{...ch.timeline!,baseGrade:Number(v)})}/>
                        <Field label={uiText("the_protagonist_appears_in_his_senior_year_of_high_school")} type="number" value={ch.timeline.debutYear} onChange={v=>changeCharacter('timeline',{...ch.timeline!,debutYear:Number(v)})}/>
                        <Field label={uiText("the_starting_month_of_the_school_year_april_to_march_of_the_following_year")} type="number" value={ch.timeline.debutMonth} onChange={v=>changeCharacter('timeline',{...ch.timeline!,debutMonth:Number(v)})}/>
                      </div>
                      <Field label={uiText("original_source_age_verification_and_fan_arrangement_description")} multiline value={ch.timeline.note} onChange={v=>changeCharacter('timeline',{...ch.timeline!,note:v})}/>
                    </>}
                    <h3>{uiText("transfer_of_status_and_duties")}</h3>
                    <p className="muted">{uiText("the_time_is_based_on_onmizu_kazuhiko_not_the_character_s_own_grade_each_academic_year")}</p>
                    {(ch.roles??[]).map((stage,i)=><div className="role-stage" key={i}><div className="field-grid">
                      <label className="field"><span>{uiText("kazuhiko_onmizu_s_school_year")}</span><select value={stage.year} onChange={e=>changeCharacter('roles',ch.roles!.map((t,j)=>j===i?{...t,year:Number(e.target.value)}:t))}>{[1,2,3].map(y=><option key={y} value={y}>{uiText("warm_water_is_high")}{[uiText("one"),uiText("two"),uiText("three")][y-1]}{uiText("school_year_april_to_march_of_the_following_year")}</option>)}</select></label>
                      <Field label={uiText("effective_month")} type="number" value={stage.month} onChange={v=>changeCharacter('roles',ch.roles!.map((t,j)=>j===i?{...t,month:Number(v)}:t))}/>
                      <Field label={uiText("effective_date_day")} type="number" value={stage.day??1} onChange={v=>changeCharacter('roles',ch.roles!.map((t,j)=>j===i?{...t,day:Number(v)}:t))}/>
                      <Field label={uiText("identity_at_the_time")} value={stage.role} onChange={v=>changeCharacter('roles',ch.roles!.map((t,j)=>j===i?{...t,role:v}:t))}/>
                      <Field label={uiText("original_work_basis_fan_arrangement")} value={stage.note} onChange={v=>changeCharacter('roles',ch.roles!.map((t,j)=>j===i?{...t,note:v}:t))}/>
                    </div><p className="muted">{stageDate(data.settings.startDate,stage)} {uiText("onwards")} {ch.name}：{schoolLabel(ch,{...createGame(data),date:stageDate(data.settings.startDate,stage)},data)}</p><button onClick={()=>changeCharacter('roles',ch.roles!.filter((_,j)=>j!==i))}>{uiText("remove_this_transfer")}</button></div>)}
                    <button onClick={()=>changeCharacter('roles',[...(ch.roles??[]),{year:1,month:4,role:ch.role,note:''}])}>{uiText("added_new_job_transfer")}</button>
                    <Field
                      label={uiText("character_profiles_and_relationships")}
                      multiline
                      value={ch.bio}
                      onChange={(v) => changeCharacter('bio', v)}
                    />
                    <Field
                      label={uiText("role_prompt")}
                      multiline
                      value={displayedCharacterPrompt(ch.prompt,language,ch)}
                      onChange={(v) => changeCharacter('prompt', v)}
                    />
                    <Field
                      label={uiText("official_reference_sources")}
                      value={ch.source}
                      onChange={(v) => changeCharacter('source', v)}
                    />
                    <h3>{uiText("vertical_painting_and_expression")}</h3>
                    <Field label={uiText("image_source_and_processing_instructions")} value={ch.imageNote ?? ''} onChange={v=>changeCharacter('imageNote',v)}/>
                    {(['spriteCrop','avatarCrop'] as const).map(key=><details key={key}><summary>{key==='spriteCrop'?uiText("vertical_painting"):uiText("avatar")}{uiText("cutting_range")}</summary>
                      <p className="muted">{uiText("use_the_pixel_coordinates_of_the_original_image_cancel_cropping_to_display_the_entire_original_image")}</p>
                      {ch[key] ? <><div className="field-grid">{(['x','y','width','height','imageWidth','imageHeight'] as const).map(axis=><Field key={axis} label={axis} type="number" value={ch[key]![axis]} onChange={v=>changeCharacter(key,{...ch[key]!,[axis]:Number(v)})}/>)}</div><button onClick={()=>changeCharacter(key,undefined)}>{uiText("cancel_cropping")}</button></> : <button onClick={()=>changeCharacter(key,{x:0,y:0,width:100,height:100,imageWidth:100,imageHeight:100})}>{uiText("set_crop")}</button>}
                    </details>)}
                    <p className="muted">{t('editor.spriteHelp')}</p>
                    {Object.entries(ch.sprites).map(([key, url]) => (
                      <div className="sprite-row" key={key}>
                        <ImagePicker label={t(('expression.'+key) as Parameters<typeof t>[0])} value={url} crop={key==='normal'?ch.spriteCrop:undefined} assets={data.assets} disabled={busy} onBusy={setBusy} onChange={v=>{edit(x=>{const character=x.characters.find(c=>c.id===selected)!;character.sprites[key]=v;if(key==='normal'){delete character.spriteCrop;if(character.avatar===url){character.avatar=v;delete character.avatarCrop;}}});}}/>
                        {key !== 'normal' && (
                          <button
                            aria-label={uiText("remove") + key}
                            onClick={() => {
                              const sprites = { ...ch.sprites };
                              delete sprites[key];
                              changeCharacter('sprites', sprites);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        changeCharacter('sprites', {
                          ...ch.sprites,
                          ['expression-' + Object.keys(ch.sprites).length]: '',
                        })
                      }
                    >
                      <Plus size={16} /> {uiText("added_emoticon_pictures")}
                    </button>
                  </section>
                )}
              </div>
                </TabsContent>
                <TabsContent value="public-accounts">
                  {translationToolbar('publicAccounts',t('editor.public.accounts'))}
                  <div className="editor-layout">
                    <aside className="editor-list">
                      {publicList.map(account=><button key={account.id} className={selectedPublic?.id===account.id?'selected':''} onClick={()=>setPublicId(account.id)}><span className="color-dot" style={{background:account.color}}/><span>{account.name}<small>@{account.handle}</small></span></button>)}
                      <button onClick={()=>{const suffix=Date.now().toString(36).slice(-8),id=`official-custom-${suffix}`;edit(x=>{(x.publicAccounts??=defaultPublicAccounts(language)).push({id,name:t('editor.public.newName'),handle:`new_${suffix}`,bio:'',color:'#1d9bf0',avatar:'',cover:'',sourceUrl:'',prompt:'',modules:{civic:{enabled:true,prompt:publicModuleStarterPrompts(language).civic}}});});setPublicId(id);}}><Plus size={16}/>{t('editor.public.add')}</button>
                    </aside>
                    {selectedPublic&&<section className="editor-detail">
                      <div className="detail-heading"><div><p className="eyebrow">{uiText("editor.publicAccountPrefix")} {selectedPublic.id}</p><h2>{selectedPublic.name}</h2></div>{selectedPublic.id.startsWith('official-custom-')&&<button onClick={()=>{if(!confirm(t('editor.public.deleteQuestion').replace('{name}',selectedPublic.name)))return;const id=selectedPublic.id;edit(x=>{x.publicAccounts=x.publicAccounts?.filter(item=>item.id!==id);});setPublicId(publicList.find(item=>item.id!==id)?.id??'');}}><Trash2 size={16}/>{t('editor.public.delete')}</button>}</div>
                      <p className="muted">{t('editor.public.notice')}</p>
                      <div className="field-grid">
                        <Field label={t('editor.public.displayName')} value={selectedPublic.name} onChange={v=>changePublic('name',v)}/>
                        <Field label={t('editor.public.handle')} value={selectedPublic.handle} onChange={v=>changePublic('handle',v)}/>
                        <Field label={t('editor.public.color')} type="color" value={selectedPublic.color} onChange={v=>changePublic('color',v)}/>
                        <Field label={t('editor.public.source')} value={selectedPublic.sourceUrl??''} onChange={v=>changePublic('sourceUrl',v)}/>
                        <ImagePicker label={t('editor.public.avatar')} value={selectedPublic.avatar} assets={data.assets} disabled={busy} onBusy={setBusy} onChange={v=>changePublic('avatar',v)}/>
                        <ImagePicker label={t('editor.public.cover')} value={selectedPublic.cover??''} assets={data.assets} disabled={busy} onBusy={setBusy} onChange={v=>changePublic('cover',v)}/>
                      </div>
                      <Field label={t('editor.public.bio')} value={selectedPublic.bio} onChange={v=>changePublic('bio',v.slice(0,160))}/>
                      <Field label={t('editor.public.voice')} multiline value={selectedPublic.prompt} onChange={v=>changePublic('prompt',v)}/>
                      <h3>{t('editor.public.modules')}</h3><p className="muted">{t('editor.public.modulesHelp')}</p>
                      {publicAccountModules.map(module=>{const names={promotion:t('editor.public.promotion'),civic:t('editor.public.civic'),advisory:t('editor.public.advisory'),patrol:t('editor.public.patrol'),reporting:t('editor.public.reporting'),municipal:t('editor.public.municipal')};const setting=selectedPublic.modules?.[module]??{enabled:false,prompt:''};return <div className="role-stage" key={module}><label className="switch-field">{names[module]}<Switch checked={setting.enabled} onCheckedChange={enabled=>changePublic('modules',{...selectedPublic.modules,[module]:{...setting,enabled,prompt:enabled&&!setting.prompt.trim()?publicModuleStarterPrompts(language)[module]:setting.prompt}})}/></label>{setting.enabled&&<Field label={t('editor.public.modulePrompt').replace('{name}',names[module])} multiline value={setting.prompt} onChange={v=>changePublic('modules',{...selectedPublic.modules,[module]:{...setting,prompt:v}})}/>}</div>})}
                    </section>}
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>
            <TabsContent value="knowledge"><KnowledgeEditor/></TabsContent>
            <TabsContent value="places">
              {translationToolbar('places',uiText("places_and_encounters"))}
              <div className="editor-layout">
                <aside className="editor-list">
                  {data.places.map((p) => (
                    <button
                      key={p.id}
                      className={placeId === p.id ? 'selected' : ''}
                      onClick={() => setPlaceId(p.id)}
                    >
                      <MapPin size={16} />
                      <span>
                        {p.name}
                        <small>
                          {p.school ? uiText("on_campus") : uiText("off_campus")} ·{' '}
                          {Object.values(p.weights).filter((w) => w > 0).length}{' '}
                          {uiText("possible_characters")}
                        </small>
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const id = 'place-' + Date.now();
                      edit((x) =>
                        x.places.push({
                          id,
                          name: uiText("new_scene"),
                          subtitle: '',
                          background: '',
                          weights: {},
                          school: false,
                        }),
                      );
                      setPlaceId(id);
                    }}
                  >
                    <Plus size={16} /> {uiText("add_place")}
                  </button>
                </aside>
                {place && (
                  <section className="editor-detail">
                    <p className="eyebrow">{uiText("editor.locationPrefix")} {place.id}</p>
                    <h2>{place.name}</h2>
                    <div className="field-grid">
                      <Field
                        label={uiText("place_name")}
                        value={place.name}
                        onChange={(v) =>
                          edit((x) => {
                            x.places.find((p) => p.id === placeId)!.name = v;
                          })
                        }
                      />
                      <Field
                        label={uiText("scenario_description")}
                        value={place.subtitle}
                        onChange={(v) =>
                          edit((x) => {
                            x.places.find((p) => p.id === placeId)!.subtitle =
                              v;
                          })
                        }
                      />
                    </div>
                    <ImagePicker
                      label={uiText("scene_background")} assets={data.assets} disabled={busy} onBusy={setBusy}
                      value={place.background}
                      onChange={(v) =>
                        edit((x) => {
                          x.places.find((p) => p.id === placeId)!.background =
                            v;
                        })
                      }
                    />
                    <label className="switch-field">
                      {uiText("campus_scene_closed_on_weekends_graduated_senior_sister_will_no_longer_appear")}
                      <Switch
                        checked={place.school}
                        onCheckedChange={(v) =>
                          edit((x) => {
                            x.places.find((p) => p.id === placeId)!.school = v;
                          })
                        }
                      />
                    </label>
                    {place.school&&<label className="field"><span>{uiText("school_category")}</span><select value={place.campus??'tsuwabuki'} onChange={e=>edit(x=>{x.places.find(p=>p.id===placeId)!.campus=e.target.value as 'tsuwabuki'|'middle';})}><option value="tsuwabuki">{uiText("shilou_high_school")}</option><option value="middle">{uiText("taoyuan_middle_school")}</option></select></label>}
                    <h3>{uiText("character_encounter_weight")}</h3>
                    <Field label={uiText("preview_date_after_school_encounter_distribution")} type="date" value={previewDate||data.settings.startDate} onChange={setPreviewDate}/>
                    <p className="muted">
                      {uiText("check_for_eligible_plot_events_before_rolling_to_determine_a_normal_encounter_weight_0_does_not")}
                    </p>
                    <div className="weights">
                      {data.characters
                        .filter((c) => c.id !== 'kazuhiko')
                        .map((c) => {
                          const preview={...createGame(data),date:previewDate||data.settings.startDate,location:place.id,phase:1};
                          const effective=encounterWeights(preview,data,place.weights,place.school,place.id).find(row=>row.id===c.id)!;
                          const w = place.weights[c.id] ?? 0;
                          return (
                            <label key={c.id}>
                              <span
                                className="color-dot"
                                style={{ background: c.color }}
                              />
                              <span>{c.name}</span>
                              <input
                                type="number"
                                min={0}
                                max={1000}
                                aria-label={c.name + uiText("weight")}
                                value={w}
                                onChange={(e) =>
                                  edit((x) => {
                                    x.places.find(
                                      (p) => p.id === placeId,
                                    )!.weights[c.id] = Number(e.target.value);
                                  })
                                }
                              />
                              <small>
                                {effective.reason||t('editor.effectiveWeight').replace('{percent}',String(Math.round(effective.probability*100))).replace('{weight}',String(effective.effectiveWeight))}
                              </small>
                            </label>
                          );
                        })}
                    </div>
                  </section>
                )}
              </div>
            </TabsContent>
            <TabsContent value="events">
              {translationToolbar('events',uiText("event_scripts"))}
              <div className="editor-layout">
                <aside className="editor-list">
                  {data.events.map((e) => (
                    <button
                      key={e.id}
                      className={eventId === e.id ? 'selected' : ''}
                      onClick={() => setEventId(e.id)}
                    >
                      <span>
                        {e.title}
                        <small>
                          {e.kind === 'original' ? uiText("original") : uiText("based_on_original")} ·{' '}
                          {
                            data.characters.find((c) => c.id === e.character)
                              ?.name
                          }
                        </small>
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const id = 'event-' + Date.now();
                      edit((x) =>
                        x.events.push({
                          id,
                          title: uiText("new_encounter"),
                          character: 'anna',
                          place: 'cafe',
                          month: 0,
                          minYear: 1,
                          minAffection: 0,
                          prerequisite: '',
                          kind: 'original',
                          reference: uiText("fan_original"),
                          text: '',
                          choices: [
                            { text: uiText("stay"), delta: 2, reply: '', flag: '' },
                            { text: uiText("say_goodbye_first"), delta: 0, reply: '' },
                          ],
                          cg: '',
                          repeatable: false,
                        }),
                      );
                      setEventId(id);
                    }}
                  >
                    <Plus size={16} /> {uiText("add_event")}
                  </button>
                </aside>
                {event && (
                  <section className="editor-detail">
                    <p className="eyebrow">{uiText("editor.storyPrefix")} {event.id}</p>
                    <h2>{event.title}</h2>
                    <Field
                      label={uiText("event_title")}
                      value={event.title}
                      onChange={(v) => changeEvent('title', v)}
                    />
                    <div className="field-grid">
                      <label className="field">
                        <span>{uiText("character")}</span>
                        <select
                          value={event.character}
                          onChange={(e) =>
                            changeEvent('character', e.target.value)
                          }
                        >
                          {data.characters
                            .filter((c) => c.id !== 'kazuhiko')
                            .map((c) => (
                              <option value={c.id} key={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>{uiText("place_of_occurrence")}</span>
                        <select
                          value={event.place}
                          onChange={(e) => changeEvent('place', e.target.value)}
                        >
                          {data.places.map((p) => (
                            <option value={p.id} key={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field
                        label={uiText("month_0_is_not_limited")}
                        type="number"
                        value={event.month}
                        onChange={(v) => changeEvent('month', Number(v))}
                      />
                      <Field
                        label={uiText("lowest_grade")}
                        type="number"
                        value={event.minYear}
                        onChange={(v) => changeEvent('minYear', Number(v))}
                      />
                      <Field
                        label={uiText("latest_academic_year_0_no_limit")}
                        type="number"
                        value={event.maxYear ?? 0}
                        onChange={(v) => changeEvent('maxYear', Number(v) || undefined)}
                      />
                      <Field
                        label={uiText("minimum_affection")}
                        type="number"
                        value={event.minAffection}
                        onChange={(v) => changeEvent('minAffection', Number(v))}
                      />
                      <Field
                        label={uiText("prepend_event_id_or_flag")}
                        value={event.prerequisite}
                        onChange={(v) => changeEvent('prerequisite', v)}
                      />
                      <label className="field">
                        <span>{uiText("event_source_type")}</span>
                        <select
                          value={event.kind}
                          onChange={(e) =>
                            changeEvent(
                              'kind',
                              e.target.value as StoryEvent['kind'],
                            )
                          }
                        >
                          <option value="original">{uiText("fan_original")}</option>
                          <option value="canon-inspired">{uiText("rewriting_of_the_original_theme")}</option>
                        </select>
                      </label>
                      <label className="switch-field">
                        {uiText("can_be_triggered_repeatedly")}
                        <Switch
                          checked={event.repeatable}
                          onCheckedChange={(v) => changeEvent('repeatable', v)}
                        />
                      </label>
                    </div>
                    <Field
                      label={uiText("original_volume_chapter_or_creation_description")}
                      value={event.reference}
                      onChange={(v) => changeEvent('reference', v)}
                    />
                    <Field
                      label={uiText("event_opening_dialogue")}
                      multiline
                      value={event.text}
                      onChange={(v) => {changeEvent('text', v);changeEvent('script',undefined);}}
                    />
                    <details><summary>{uiText("segmented_script_narration_lines_and_heart")}</summary>
                    <p className="muted">{uiText("the_full_text_of_segmented_scripts_will_be_updated_simultaneously_directly_modify_the_full_text_above")}</p>
                    {(event.script??[]).map((line,i)=><div className="role-stage" key={i}>
                      <div className="field-grid"><label className="field"><span>{uiText("type")}</span><select value={line.kind} onChange={e=>changeEvent('script',event.script!.map((l,j)=>j===i?{...l,kind:e.target.value as typeof line.kind}:l))}><option value="narration">{uiText("narration_action")}</option><option value="speech">{uiText("spoken_line")}</option><option value="thought">{uiText("thought_unspoken")}</option></select></label>
                      <Field label={uiText("character_name")} value={line.speaker??''} onChange={v=>changeEvent('script',event.script!.map((l,j)=>j===i?{...l,speaker:v}:l))}/></div>
                      <Field label={t('editor.scriptLine').replace('{number}',String(i+1))} multiline value={line.text} onChange={v=>changeEvent('script',event.script!.map((l,j)=>j===i?{...l,text:v}:l))}/>
                      <button onClick={()=>changeEvent('script',event.script!.filter((_,j)=>j!==i))}>{uiText("remove_paragraph")}</button>
                    </div>)}
                    <button onClick={()=>changeEvent('script',[...(event.script??[{kind:'narration' as const,text:event.text}]),{kind:'narration',text:''}])}>{uiText("add_new_paragraph")}</button>
                    </details>
                    <ImagePicker
                      label={uiText("event_cg")} assets={data.assets} disabled={busy} onBusy={setBusy}
                      value={event.cg}
                      onChange={(v) => changeEvent('cg', v)}
                    />
                    <h3>{uiText("options_and_results")}</h3>
                    {event.choices.map((choice, i) => (
                      <div className="choice-editor" key={i}>
                        <div className="section-heading">
                          <strong>{uiText("choice")} {i + 1}</strong>
                          <button
                            disabled={event.choices.length <= 2}
                            onClick={() =>
                              changeEvent(
                                'choices',
                                event.choices.filter((_, j) => j !== i),
                              )
                            }
                            aria-label={uiText("delete_option") + (i + 1)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <Field
                          label={uiText("player_choice")}
                          value={choice.text}
                          onChange={(v) =>
                            changeEvent(
                              'choices',
                              event.choices.map((c, j) =>
                                j === i ? { ...c, text: v } : c,
                              ),
                            )
                          }
                        />
                        <div className="field-grid">
                          <Field
                            label={uiText("favorability_increase_or_decrease_20_20")}
                            type="number"
                            value={choice.delta}
                            onChange={(v) =>
                              changeEvent(
                                'choices',
                                event.choices.map((c, j) =>
                                  j === i ? { ...c, delta: Number(v) } : c,
                                ),
                              )
                            }
                          />
                          <Field
                            label={uiText("result_flag_route_role_id_can_enter_the_route")}
                            value={choice.flag ?? ''}
                            onChange={(v) =>
                              changeEvent(
                                'choices',
                                event.choices.map((c, j) =>
                                  j === i ? { ...c, flag: v } : c,
                                ),
                              )
                            }
                          />
                        </div>
                        <Field
                          label={uiText("character_response_follow_up_narrative")}
                          multiline
                          value={choice.reply}
                          onChange={(v) =>
                            changeEvent(
                              'choices',
                              event.choices.map((c, j) =>
                                j === i ? { ...c, reply: v } : c,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                    <button
                      disabled={event.choices.length >= 6}
                      onClick={() =>
                        changeEvent('choices', [
                          ...event.choices,
                          { text: uiText("new_options"), delta: 0, reply: '' },
                        ])
                      }
                    >
                      <Plus size={16} /> {uiText("new_option")}
                    </button>
                  </section>
                )}
              </div>
            </TabsContent>
            <TabsContent value="assets">
              {translationToolbar('assets',uiText("asset_library"))}
              <section className="editor-detail">
                <h2>{uiText("asset_sources_and_import")}</h2>
                <label className="file-button">
                  <Upload size={17} /> {uiText("upload_images_png_jpeg_webp")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <p className="muted">
                  {uiText("after_uploading_you_can_directly_select_it_on_the_picture_cards_of_characters_scenes_and_events")}
                </p>
                <div className="book-grid">
                  {data.assets.map((a, i) => (
                    <article key={a.id}>
                      <Field
                        label={uiText("name")}
                        value={a.title}
                        onChange={(v) =>
                          edit((x) => {
                            x.assets[i].title = v;
                          })
                        }
                      />
                      <ImagePicker
                        label={uiText("material_pictures")} disabled={busy} onBusy={setBusy}
                        value={a.url}
                        onChange={(v) =>
                          edit((x) => {
                            x.assets[i].url = v;
                          })
                        }
                      />
                      <Field
                        label={uiText("source_official_preview")}
                        value={a.source}
                        onChange={(v) =>
                          edit((x) => {
                            x.assets[i].source = v;
                          })
                        }
                      />
                      <Field
                        label={uiText("notes")}
                        value={a.note}
                        onChange={(v) =>
                          edit((x) => {
                            x.assets[i].note = v;
                          })
                        }
                      />
                      <a href={a.source} target="_blank" rel="noreferrer">
                        {uiText("open_source_2")}
                      </a>
                    </article>
                  ))}
                </div>
                <button
                  onClick={() =>
                    edit((x) =>
                      x.assets.push({
                        id: 'asset-' + Date.now(),
                        title: uiText("new_material"),
                        url: '',
                        source: '',
                        note: '',
                      }),
                    )
                  }
                >
                  <Plus size={16} /> {uiText("add_asset")}
                </button>
                <hr />
                <h3>{uiText("content_backup")}</h3>
                <p>{t('editor.backupHelp')}</p>
                <div className="button-row">
                  <button onClick={exportJson}>
                    <Download size={17} /> {uiText("export_json")}
                  </button>
                  <label className="file-button">
                    <Upload size={17} /> {uiText("import_json")}
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        void importJson(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </section>
            </TabsContent>
            <TabsContent value="settings" keepMounted>
              <Tabs value={settingsTab} onValueChange={value=>setSettingsTab(String(value))}>
                <TabsList className="settings-subtabs">
                  <TabsTrigger value="story">{uiText("story_and_time")}</TabsTrigger>
                  <TabsTrigger value="search">{uiText("technical.web_search")}</TabsTrigger>
                  <TabsTrigger value="stable-diffusion">{uiText("technical.stable_diffusion")}</TabsTrigger>
                  <TabsTrigger value="llm">{uiText("llm_api_settings")}</TabsTrigger>
                  <TabsTrigger value="appearance" disabled={!!translation}>{t('editor.appearanceTab')}</TabsTrigger>
                  <TabsTrigger value="new-story" disabled={!!translation}>{t('editor.newStoryTab')}</TabsTrigger>
                </TabsList>
                <TabsContent value="appearance"><section className="editor-detail appearance-settings"><h2>{t('theme.label')} / {t('language.label')}</h2><div className="field-grid"><label className="field"><span>{t('theme.label')}</span><select disabled={!!translation} value={themePreference} onChange={event=>setTheme(event.target.value as 'system'|'light'|'dark')}><option value="system">{t('theme.system')}</option><option value="light">{t('theme.light')}</option><option value="dark">{t('theme.dark')}</option></select></label><LanguageSelect className="field" disabled={!!translation}/></div></section></TabsContent>
                <TabsContent value="new-story"><section className="editor-detail"><h2>{t('settings.newStory')}</h2><p>{t('settings.newConfirm')}</p>{dirty&&<p className="muted">{t('editor.saveBeforeNewStory')}</p>}<button disabled={busy||!!translation||dirty} onClick={()=>setNewStoryOpen(true)}><RefreshCw size={17}/>{t('settings.newStory')}</button></section></TabsContent>
                <TabsContent value="story">
                  <section className="editor-detail">
                    <h2>{uiText("story_and_time")}</h2>
                <div className="field-grid">
                  <Field
                    label={uiText("town_name")}
                    value={data.settings.town}
                    onChange={(v) =>
                      edit((x) => {
                        x.settings.town = v;
                      })
                    }
                  />
                  <Field
                    label={uiText("general_encounter_probability_0_1")}
                    type="number"
                    value={data.settings.encounterRate}
                    onChange={(v) =>
                      edit((x) => {
                        x.settings.encounterRate = Number(v);
                      })
                    }
                  />
                  <Field
                    label={uiText("story_start_date")}
                    type="date"
                    value={data.settings.startDate}
                    onChange={(v) =>
                      edit((x) => {
                        x.settings.startDate = v;
                      })
                    }
                  />
                  <Field
                    label={uiText("high_school_graduation_date_march")}
                    type="date"
                    value={data.settings.graduationDate}
                    onChange={(v) =>
                      edit((x) => {
                        x.settings.graduationDate = v;
                      })
                    }
                  />
                </div>
                <section className="school-calendar-panel" aria-labelledby="school-calendar-heading">
                  <header>
                    <div className="school-calendar-title">
                      <CalendarDays aria-hidden="true" size={21}/>
                      <div><h3 id="school-calendar-heading">{t('editor.calendar.title')}</h3><p>{t('editor.calendar.description')}</p></div>
                    </div>
                    <span className="school-calendar-status">{t('editor.calendar.noClasses')}</span>
                  </header>
                  <div className="school-calendar-grid">
                    {calendarRules.map(rule=><article key={rule.title}><strong>{rule.title}</strong><span>{rule.range}</span></article>)}
                    <article className="school-calendar-opening">
                      <strong>{t('editor.calendar.openingTitle')}</strong>
                      <span>{t('editor.calendar.openingRange')
                        .replace('{april}',calendarDate(schoolCalendarRules.openingDayCandidates[0]))
                        .replace('{september}',calendarDate(schoolCalendarRules.openingDayCandidates[1]))
                        .replace('{january}',calendarDate(schoolCalendarRules.openingDayCandidates[2]))}</span>
                    </article>
                  </div>
                  <p className="school-calendar-note">{t('editor.calendar.accessNote')}</p>
                </section>
                <Field
                  label={uiText("global_plot_prompt")}
                  multiline
                  value={data.settings.systemPrompt}
                  onChange={(v) =>
                    edit((x) => {
                      x.settings.systemPrompt = v;
                    })
                  }
                />
                <h3>{uiText("character_memory_harness")}</h3>
                <p className="muted">
                  {uiText("each_character_keeps_important_facts_and_recent_information_independently_the_excess_history_is_compressed_by_deterministic")}
                </p>
                <div className="field-grid">
                  <Field
                    label={uiText("long_term_summary_character_limit_400_6000")}
                    type="number"
                    value={data.settings.memoryChars}
                    onChange={(v) =>
                      edit((x) => {
                        x.settings.memoryChars = Number(v);
                      })
                    }
                  />
                  <Field
                    label={uiText("number_of_recent_messages_2_20")}
                    type="number"
                    value={data.settings.recentTurns}
                    onChange={(v) =>
                      edit((x) => {
                        x.settings.recentTurns = Number(v);
                      })
                    }
                  />
                </div>
                  </section>
                </TabsContent>
                <TabsContent value="search" keepMounted>
                  <SearchSettings registerSave={registerSearchSave} onStatusChange={setSearchStatus}/>
                </TabsContent>
                <TabsContent value="stable-diffusion" keepMounted>
                  <StableDiffusionSettings registerSave={registerSdSave} onStatusChange={setSdStatus}/>
                </TabsContent>
                <TabsContent value="llm">
                  <section className="service-card"><header><span className="settings-eyebrow">{uiText("editor.languageModel")}</span><h2>{uiText("llm_services")}</h2></header>
                <p className="muted">{t('editor.llmHelp')}</p>
                <p className={'ai-readiness '+(aiState==='ready'?'ready':'blocked')} role="status">{aiState==='checking'?t('editor.aiChecking'):aiState==='ready'?t('editor.aiReadyStatus'):aiMessage||t('editor.aiNotReady')}</p>
                <p className="muted"><strong>{t('editor.aiCapabilityRequirement')}</strong> {t('editor.aiCapabilityExplanation')}</p>
                <Field
                  label="API URL"
                  id="llm-url"
                  required
                  error={apiErrors.url}
                  value={api.url}
                  onChange={(v) => {setApi({ ...api, url: v });setAiState('blocked');setApiErrors(old=>({...old,url:''}));}}
                />
                <p className="muted">
                  {uiText("please_enter")} <code>{uiText("technical.v1")}</code>{uiText("e_g")} <code>{uiText("technical.https_api_openai_com_v1")}</code>
                  {uiText("if_only_the_root_url_is_filled_in_it_will_be_filled_in_automatically")} <code>{uiText("technical.v1")}</code>。
                </p>
                <Field
                  label={
                    api.hasKey
                      ? uiText("api_key_already_set_enter_to_replace")
                      : uiText("api_key_not_set_yet")
                  }
                  type="text"
                  id="llm-key"
                  required
                  error={apiErrors.key}
                  value={api.key}
                  onChange={(v) => {setApi({ ...api, key: v });setAiState('blocked');setApiErrors(old=>({...old,key:''}));}}
                />
                <div className={'model-combobox-field '+(apiErrors.model?'invalid-field':'')}>
                  <label htmlFor="llm-model">{uiText("model")}<span className="required-mark">{uiText("required")}</span>{uiText("can_be_entered_or_selected_from_query_results")}</label>
                  <Combobox items={models} inputValue={api.model} value={models.includes(api.model)?api.model:null} onInputValueChange={model=>{setApi(current=>({...current,model}));setAiState('blocked');setApiErrors(old=>({...old,model:''}));}} onValueChange={model=>{if(model){setApi(current=>({...current,model}));setAiState('blocked');setApiErrors(old=>({...old,model:''}));}}}>
                    <ComboboxInput id="llm-model" aria-invalid={!!apiErrors.model} className="model-combobox-input" placeholder={uiText("enter_the_model_name_or_select_after_querying")}/>
                    <ComboboxContent>
                      <ComboboxEmpty>{models.length?uiText("there_is_no_matching_model_the_manually_entered_name_can_be_retained"):uiText("the_model_has_not_been_queried_yet_you_can_enter_the_name_directly")}</ComboboxEmpty>
                      <ComboboxList>{(model:string)=><ComboboxItem key={model} value={model}>{model}</ComboboxItem>}</ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {apiErrors.model&&<small className="field-error">{apiErrors.model}</small>}
                </div>
                <label className={apiErrors.contextTokens?'invalid-field':''}>{uiText("context_budget")}<span className="required-mark">{uiText("required")}</span>{uiText("to_estimate_token_it_needs_to_be_lower_than_the_model_capacity")}<input id="llm-contextTokens" aria-invalid={!!apiErrors.contextTokens} type="number" min={4096} max={2000000} value={api.contextTokens??32768} onChange={e=>{setApi({...api,contextTokens:Number(e.target.value)});setApiErrors(old=>({...old,contextTokens:''}));}}/>{apiErrors.contextTokens&&<small className="field-error">{apiErrors.contextTokens}</small>}</label>
                <div className="model-query-panel" aria-busy={modelsBusy}>
                  <div className="button-row model-query-actions"><button type="button" disabled={modelsBusy||!api.url.trim()} onClick={()=>void loadModels()}>{modelsBusy?uiText("inquiring"):uiText("fetch_models")}</button></div>
                  <p className="model-query-status" role="status">{modelsBusy?uiText("obtaining_model_list"):modelsMessage||uiText("you_can_directly_enter_the_model_name_or_select_it_in_the_model_field_after_querying")}</p>
                </div>
                <div className="button-row">
                </div>
                </section>
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        )}
      </main>
      <Dialog open={newStoryOpen} onOpenChange={open=>{if(!busy)setNewStoryOpen(open);}}>
        <DialogContent showCloseButton={!busy}>
          <DialogTitle>{t('settings.newStory')}</DialogTitle>
          <DialogDescription>{t('settings.newConfirm')}</DialogDescription>
          <div className="button-row">
            <button disabled={busy} onClick={()=>setNewStoryOpen(false)}>{t('common.cancel')}</button>
            <button className="primary" disabled={busy} onClick={()=>void startNewStory()}>{busy?<LoaderCircle size={17} className="spin"/>:<RefreshCw size={17}/>} {t('settings.newStory')}</button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!busy) setResetOpen(open); }}>
        <DialogContent showCloseButton={!busy}>
          <DialogTitle>{uiText("restore_default_values")}</DialogTitle>
          <DialogDescription>
            {uiText("characters_scenes_events_library_and_game_system_settings_will_be_replaced_with_the_default_content_of")}
          </DialogDescription>
          {error && <p className="feedback error" role="alert">{error}</p>}
          <div className="button-row">
            <button disabled={busy} onClick={() => setResetOpen(false)}>{uiText("cancel")}</button>
            <button className="primary" disabled={busy} onClick={resetDefaults}>
              {busy ? uiText("restoring") : uiText("confirm_restore")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="portrait-preview">
          <DialogTitle>{ch?.name}{uiText("vertical_drawing_preview")}</DialogTitle>
          <DialogDescription>{ch?.source}</DialogDescription>
          {ch?.sprites.normal ? (
            <CharacterImage src={ch.sprites.normal} alt={ch.name} crop={ch.spriteCrop}/>
          ) : (
            <p>{uiText("no_image_specified_yet")}</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pendingImport}
        onOpenChange={(open) => {
          if (!open) setPendingImport(undefined);
        }}
      >
        <DialogContent>
          <DialogTitle>{uiText("import_content_files")}</DialogTitle>
          <DialogDescription>
            {uiText("importing_will_replace_content_that_is_not_currently_saved_after_confirmation_you_still_need_to_click")}
          </DialogDescription>
          <button
            className="primary"
            onClick={() => {
              if (pendingImport) {
                setData(pendingImport);
                setDirty(true);
                setPendingImport(undefined);
              }
            }}
          >
            {uiText("replace_editorial_content")}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!translation} onOpenChange={()=>{}}>
        <DialogContent showCloseButton={false} className="translation-dialog" aria-describedby="translation-description">
          <DialogTitle>{t('editor.translatingTitle')}</DialogTitle>
          <DialogDescription id="translation-description">{t('editor.translatingDescription')}</DialogDescription>
          {translation&&<div className="translation-progress" aria-live="polite">
            <div><strong>{translation.completed} / {translation.total}</strong><span>{Math.floor(translation.completed/translation.total*100)}%</span></div>
            <Progress value={translation.completed/translation.total*100}/>
            <p>{translation.section==='publicAccounts'?t('editor.public.accounts'):uiText(labels[translation.section])} · {t('editor.translatingProgress')}</p>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
