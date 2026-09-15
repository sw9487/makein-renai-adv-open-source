import {expect,test} from 'bun:test';
import {selectStorePromotionAccounts,selectCivicInformationAccounts,shouldPublishPoliceAdvisory,shouldPublishMunicipalOutreach,isStoreAccount} from '../core/public-twitter-activity';
import {createGame} from '../core/engine';
import {defaultContent} from '../core/content';
import {applyTwitterDecision,twitterNewsCandidates} from '../server/twitter';
import {socialSettings,twitterState} from '../core/twitter';
import {storePromotionStrategy,policeAdvisoryStrategy,municipalOutreachStrategy,regionalNewsCoverageStrategy} from '../server/twitter-public-strategies';
import {defaultPublicAccounts,hydratePublicAccounts,hasPublicModule,publicAccountModules,publicModuleStarterPrompts} from '../core/twitter-public';
import jaCatalog from '../web/locales/ja.json';
import zhCatalog from '../web/locales/zh-TW.json';
import enCatalog from '../web/locales/en.json';
import {startTwitterSlot} from '../server/twitter';
import {validateContent} from '../server/validation';
import {choosePoliceAdvisoryTopic,inferPoliceAdvisoryTopic,policeAdvisoryUsedTopics} from '../core/police-advisory';

test('store, police, municipal, civic, and news policies stay independent',()=>{
 const stores=selectStorePromotionAccounts(1,false,()=>0);
 expect(stores.length).toBeGreaterThan(5);
 expect(stores.every(isStoreAccount)).toBe(true);
 const civic=selectCivicInformationAccounts(false,()=>0);
 expect(civic.length).toBeGreaterThan(0);
 expect(civic.some(isStoreAccount)).toBe(false);
 expect(shouldPublishPoliceAdvisory(false,()=>0)).toBe(true);
 expect(shouldPublishPoliceAdvisory(false,()=>1)).toBe(false);
 expect(shouldPublishMunicipalOutreach(true,false,()=>1)).toBe(true);
 expect(shouldPublishMunicipalOutreach(false,false,()=>1)).toBe(false);
 expect(storePromotionStrategy('official-seibunkan').system.length).toBeGreaterThan(30);
 expect(storePromotionStrategy('official-seibunkan',{kind:'reply'}).actions).toContain('reply');
 expect(policeAdvisoryStrategy('official-toyohashi-police').system.length).toBeGreaterThan(30);
 expect(policeAdvisoryStrategy('official-toyohashi-police',{kind:'patrol'}).actions).toEqual(['reply','idle']);
 expect(municipalOutreachStrategy('official-toyohashi-city').actions).toContain('quote');
 expect(regionalNewsCoverageStrategy('official-higashiaichi-news',{kind:'news-digest'}).length).toBeGreaterThan(30);
});

test('police advisories rotate across crimes and weather without repeating a topic on one day',()=>{
 const s=createGame(defaultContent),t=twitterState(s,defaultContent),actor='official-toyohashi-police';
 const heat=applyTwitterDecision(s,defaultContent,actor,{action:'post',target:'',text:'熱中症を防ぐため、こまめな水分補給を。',image:false})!;
 expect(inferPoliceAdvisoryTopic(heat.text)).toBe('heat');
 expect(inferPoliceAdvisoryTopic('飲酒運転をしないでください')).toBe('drunk_driving');
 expect(inferPoliceAdvisoryTopic('侵入窃盗に備えて戸締まりを')).toBe('burglary');
 expect(inferPoliceAdvisoryTopic('台風に備え、避難経路を確認')).toBe('typhoon');
 expect(policeAdvisoryUsedTopics(t,s.date,actor).has('heat')).toBe(true);
 t.jobs={reserved:{actor,date:s.date,phase:0,due:0,posts:[],status:'scheduled',advisoryTopic:'fraud'}};
 const picked=choosePoliceAdvisoryTopic(t,s.date,actor,()=>0);
 expect(picked).not.toBe('heat');expect(picked).not.toBe('fraud');
 const winter=choosePoliceAdvisoryTopic(t,'2027-01-14',actor,()=>0);
 expect(winter).not.toBe('heat');expect(winter).not.toBe('typhoon');
});

test('police slots reserve different advisory topics across the same day',()=>{
 const s=createGame(defaultContent),actor='official-toyohashi-police',original=Math.random;s.phase=0;
 try{
  Math.random=()=>0;
  startTwitterSlot('test',s,defaultContent);
  const morning=s.twitter!.jobs![`${s.date}:0:${actor}`]?.advisoryTopic;
  expect(morning).toBeTruthy();
  s.phase=1;startTwitterSlot('test',s,defaultContent);
  const afternoon=s.twitter!.jobs![`${s.date}:1:${actor}`]?.advisoryTopic;
  expect(afternoon).toBeTruthy();expect(afternoon).not.toBe(morning);
 }finally{Math.random=original;}
});

test('news source window covers public individuals and every public-account category',()=>{
 const state=createGame(defaultContent);state.date='2026-07-14';state.phase=0;
 const post=(author:string,text:string)=>applyTwitterDecision(state,defaultContent,author,{action:'post',target:'',text,image:false})!;
 const store=post('official-seibunkan','Book event');
 const police=post('official-toyohashi-police','Safety reminder');
 const city=post('official-toyohashi-city','Civic notice');
 const person=post('kazuhiko','Personal observation');
 twitterState(state,defaultContent).accounts.kazuhiko.private=false;
 state.phase=1;
 const ids=new Set(twitterNewsCandidates(twitterState(state,defaultContent),state.date,state.phase).map(post=>post.id));
 for(const entry of [store,police,city,person])expect(ids.has(entry.id)).toBe(true);
});

test('editor-created public account keeps its own modules, artwork and scheduled Twitter behavior',()=>{
 const c=structuredClone(defaultContent),accounts=defaultPublicAccounts();
 accounts.push({id:'official-custom-test',name:'新店',handle:'new_shop',bio:'每日店內消息',color:'#123456',avatar:'/assets/twitter-official/seibunkan.jpg',cover:'/assets/twitter-official/covers/seibunkan.jpg',prompt:'親切介紹商品',modules:{promotion:{enabled:true,prompt:'著重店內日常'},reporting:{enabled:true,prompt:'選擇可信貼文'}}});
 c.publicAccounts=accounts;
 const saved=validateContent(c);expect(saved.publicAccounts?.at(-1)?.modules?.promotion?.prompt).toBe('著重店內日常');
 expect(saved.publicAccounts?.at(-1)?.cover).toBe('/assets/twitter-official/covers/seibunkan.jpg');
 expect(selectStorePromotionAccounts(1,false,()=>0,accounts)).toContain('official-custom-test');
 expect(storePromotionStrategy('official-custom-test',undefined,accounts.at(-1)).system).toContain('著重店內日常');
 const s=createGame(c);s.runId='custom-public-test';startTwitterSlot('test',s,c);
 expect(twitterState(s,c).accounts['official-custom-test']).toMatchObject({private:false,verified:true,publicAccount:true});
 expect(s.twitter?.online).toContain('official-custom-test');
 expect(s.twitter?.jobs?.[`${s.date}:${s.phase}:official-custom-test`]).toBeDefined();
});

test('every enabled built-in public module has an editor-visible, account-specific prompt',()=>{
 for(const [language,catalog] of [['ja',jaCatalog],['zh-Hant',zhCatalog],['en',enCatalog]] as const){
  const accounts=defaultPublicAccounts(language);
  expect(accounts).toHaveLength(19);
  const seen=new Set<string>();
  for(const account of accounts){
   expect(account.prompt).toBe(catalog.publicAccountPrompts.identity[account.id as keyof typeof catalog.publicAccountPrompts.identity]);
   expect(account.bio).toBe(catalog.publicAccountBios[account.id as keyof typeof catalog.publicAccountBios]);
   expect(account.prompt.trim().length).toBeGreaterThan(10);
   for(const module of publicAccountModules)if(hasPublicModule(account,module)){
    const instruction=account.modules?.[module]?.prompt??'';
    expect(instruction.trim().length).toBeGreaterThan(30);
    expect(seen.has(instruction)).toBe(false);seen.add(instruction);
   }
  }
  for(const module of publicAccountModules)expect(publicModuleStarterPrompts(language)[module]).toBe(catalog.publicAccountPrompts.starter[module]);
 }
});

test('old saved content fills blank built-in prompts even for disabled modules',()=>{
 const c=structuredClone(defaultContent);c.publicAccounts=defaultPublicAccounts();
 const store=c.publicAccounts.find(account=>account.id==='official-seibunkan')!;
 const city=c.publicAccounts.find(account=>account.id==='official-toyohashi-city')!;
 store.modules!.promotion!.prompt='';city.modules!.civic!.prompt='自訂市民提示';city.modules!.municipal!.enabled=false;city.modules!.municipal!.prompt='';
 hydratePublicAccounts(c);
 expect(store.modules!.promotion!.prompt.trim().length).toBeGreaterThan(30);
 expect(city.modules!.civic!.prompt).toBe('自訂市民提示');
 expect(city.modules!.municipal!.prompt).toBe(jaCatalog.publicAccountPrompts.modules['official-toyohashi-city'].municipal);
});

test('saved Japanese built-in defaults migrate to Chinese without replacing custom prompts',()=>{
 const c=structuredClone(defaultContent);c.publicAccounts=defaultPublicAccounts();
 const school=c.publicAccounts.find(account=>account.id==='official-tsuwabuki')!;
 const city=c.publicAccounts.find(account=>account.id==='official-toyohashi-city')!;
 city.prompt='自行編輯的帳號人設';city.modules!.civic!.prompt='自行編輯的模組說明';
 hydratePublicAccounts(c,'zh-Hant');
 expect(school.prompt).toBe(defaultPublicAccounts('zh-Hant').find(account=>account.id===school.id)!.prompt);
 expect(school.modules!.civic!.prompt).toBe(defaultPublicAccounts('zh-Hant').find(account=>account.id===school.id)!.modules!.civic!.prompt);
 expect(school.bio).toBe(zhCatalog.publicAccountBios[school.id as keyof typeof zhCatalog.publicAccountBios]);
 expect(city.prompt).toBe('自行編輯的帳號人設');
 expect(city.modules!.civic!.prompt).toBe('自行編輯的模組說明');
 hydratePublicAccounts(c,'en');
 expect(school.prompt).toBe(defaultPublicAccounts('en').find(account=>account.id===school.id)!.prompt);
 expect(city.prompt).toBe('自行編輯的帳號人設');
});

test('older police defaults gain the expanded advisory without replacing an edited module',()=>{
 const c=structuredClone(defaultContent);c.publicAccounts=defaultPublicAccounts('ja');
 const police=c.publicAccounts.find(account=>account.id==='official-toyohashi-police')!;
 police.prompt=jaCatalog.publicAccountPrompts.legacy.identity['official-toyohashi-police'];
 police.modules!.advisory!.prompt=jaCatalog.publicAccountPrompts.legacy.modules['official-toyohashi-police'].advisory;
 hydratePublicAccounts(c,'zh-Hant');
 expect(police.prompt).toBe(zhCatalog.publicAccountPrompts.identity['official-toyohashi-police']);
 expect(police.modules!.advisory!.prompt).toBe(zhCatalog.publicAccountPrompts.modules['official-toyohashi-police'].advisory);
 police.modules!.advisory!.prompt='作者自訂警署宣導';
 hydratePublicAccounts(c,'en');
 expect(police.modules!.advisory!.prompt).toBe('作者自訂警署宣導');
});

test('character Twitter bios follow the selected language and preserve editor overrides',()=>{
 const anna=defaultContent.characters.find(character=>character.id==='anna')!;
 expect(socialSettings(anna,'ja').twitterBio).toBe(jaCatalog.characterTwitterBios.anna);
 expect(socialSettings(anna,'en').twitterBio).toBe(enCatalog.characterTwitterBios.anna);
 const old=structuredClone(anna);old.social={...socialSettings(anna),twitterBio:zhCatalog.characterTwitterBios.anna};
 expect(socialSettings(old,'en').twitterBio).toBe(enCatalog.characterTwitterBios.anna);
 old.social.twitterBio='My own bio';expect(socialSettings(old,'ja').twitterBio).toBe('My own bio');
});
