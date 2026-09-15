import {characterGender} from './character-gender';
import type { Character, Content, StoryEvent } from './types';
import { portraitAssets } from './portrait-assets';
import { roleStages } from './role-stages';
import portraitUrls from '../content/portrait-urls.json';
import releaseContent from '../content/game.json';

const anime = 'https://makeine-anime.com/character/';
const wiki = 'https://w.atwiki.jp/aniwotawiki/pages/56784.html';
export const defaultCharacterPrompts:Record<string,string>={anna:'i18n:character.anna',lemon:'i18n:character.lemon',komari:'i18n:character.komari'};
const imageIds: Record<string, number> = {kazuhiko:1,anna:2,lemon:3,komari:4,kaju:5,koto:6,tamaki:7,sosuke:8,karen:9,mitsuki:10,chihaya:11,amanatsu:12,konuki:13,shikiya:14,asami:15,hibari:16,tiara:17};
// Official navigation thumbnails 06/07 are reversed relative to full-body images.
const avatarIds:Record<string,number> = {...imageIds,tamaki:6,koto:7};
const bundledSprites=new Map(releaseContent.characters.map(character=>[character.id,character.sprites]));
export function repairPortraits(input:Content):Content {
  const c=structuredClone(input);
  for(const ch of c.characters) {
    for(const [oldName,newName] of [['00000000-0000-4000-8000-000000000021.jpg','00000000-0000-4000-8000-000000000021.png'],['00000000-0000-4000-8000-000000000025.jpg','00000000-0000-4000-8000-000000000025.png']]){
      if(ch.avatar?.endsWith(oldName))ch.avatar=ch.avatar.replace(oldName,newName);
      for(const key of Object.keys(ch.sprites))if(ch.sprites[key].endsWith(oldName))ch.sprites[key]=ch.sprites[key].replace(oldName,newName);
    }
    if(ch.id==='koharu'&&ch.sprites.normal.endsWith('000000000025.png'))for(const crop of [ch.spriteCrop,ch.avatarCrop])if(crop?.imageWidth===2480){
      const scaleX=1697/2480,scaleY=2400/3508;
      crop.x*=scaleX;crop.width*=scaleX;crop.y*=scaleY;crop.height*=scaleY;
      if(crop.outline)crop.outline=crop.outline.map((n,i)=>n*(i%2?scaleY:scaleX));
      crop.imageWidth=1697;crop.imageHeight=2400;
    }
    ch.roles ??= structuredClone(roleStages[ch.id]??[]);
    if(ch.id==='riko'&&ch.roles.length===3&&ch.roles.every((t,i)=>t.role===['入學前','文藝部新入部員','文藝部部員'][i]&&t.year===i+1&&t.month===4)) ch.roles=structuredClone(roleStages.riko);
    const oldPortrait=ch.id==='hiroto'?'00000000-0000-4000-8000-000000000022.png':ch.id==='koharu'?'00000000-0000-4000-8000-000000000024.jpg':'';
    if(oldPortrait && ch.sprites.normal.endsWith(oldPortrait)) Object.assign(ch,structuredClone(portraitAssets[ch.id]));
    if(!['tamaki','koto'].includes(ch.id)) continue;
    if(/^https:\/\/makeine-anime.com\/assets\/img\/character\/img_main0[67]\.png$/.test(ch.sprites.normal))
      ch.sprites.normal=`https://makeine-anime.com/assets/img/character/img_main${String(imageIds[ch.id]).padStart(2,'0')}.png`;
    if(ch.avatar===undefined || /^https:\/\/makeine-anime.com\/assets\/img\/character\/thumb_chara0[67]_on\.png$/.test(ch.avatar))
      ch.avatar=`https://makeine-anime.com/assets/img/character/thumb_chara${String(avatarIds[ch.id]).padStart(2,'0')}_on.png`;
  }
  const urls:Record<string,string>=portraitUrls;
  for(const a of c.assets) a.url=urls[a.url]??a.url;
  for(const p of c.places) p.background=urls[p.background]??p.background;
  for(const e of c.events) e.cg=urls[e.cg]??e.cg;
  for(const ch of c.characters){
    // Upgrade generic built-in defaults only; explicit editor prompts remain authoritative.
    if(defaultCharacterPrompts[ch.id]&&ch.prompt==='i18n:character.default')ch.prompt=defaultCharacterPrompts[ch.id];
    if(ch.id==='hiroto'&&ch.source==='使用者提供的動畫截圖；製作說明見 content/ARTWORK.md') ch.source='';
    const fullSchool=(text:string)=>text.replace(/桃園國中|國中/g,ch.id==='riko'?'中學（校名未核實）':'桃園中學').replace(/國([一二三])/g,(_,year)=>`${ch.id==='riko'?'中學':'桃園中學'}${year}年級`);
    ch.role=fullSchool(ch.role);ch.bio=fullSchool(ch.bio);ch.prompt=fullSchool(ch.prompt);
    if(ch.timeline) ch.timeline.note=fullSchool(ch.timeline.note);
    if(ch.avatar) ch.avatar=urls[ch.avatar]??ch.avatar;
    for(const key of Object.keys(ch.sprites)) ch.sprites[key]=urls[ch.sprites[key]]??ch.sprites[key];
    const builtIn=bundledSprites.get(ch.id);
    // Bring old saves forward only when their base portrait still matches the shipped one.
    // Never replace a player's custom portrait or their manually overridden expressions.
    if(builtIn&&ch.sprites.normal===builtIn.normal)
      for(const [key,url] of Object.entries(builtIn))if(key!=='normal'&&!ch.sprites[key])ch.sprites[key]=url;
    ch.prompt=ch.prompt.replace('桃園中學園藝社學生','與佳樹同屆的學生（學校與職務依即時身分資料）').replace('有時忘了和彥是自己班上的學生','有時對学生的名字健忘；任教班級只依即時職務').replace('綾目高中的學生會成員','與弘人自小相識的人（學校與職務依即時身分資料）');
  }
  for(const ch of c.characters)ch.gender=characterGender(ch);
  return c;
}
const extra: Character[] = [
  {id:'hiroto',name:'櫻井弘人',reading:'さくらい ひろと',color:'#7997bd',role:'學生會・會計',bio:'與和彥同年級。放虎原雲雀的表弟，負責整理學生會的帳目與協調工作；與水島小春自小相識。',prompt:'i18n:character.roster.hiroto',sprites:{normal:''},romance:false,year:1,source:wiki},
  {id:'riko',name:'白玉莉子',reading:'しらたま リコ',color:'#d88fa3',role:'文藝社・後輩',bio:'比和彥低一屆。主角群升高二時，才以高一新生身分加入文藝社。外表乖巧、行動積極；與姊姊及其婚約相關的失戀是第7卷的核心，不能在初遇時就假設已與溫水相戀。',prompt:'i18n:character.roster.riko',sprites:{normal:''},romance:true,year:0,source:'https://gagagabunko.jp/special/makeine/'},
  {id:'satoshi',name:'橘聰',reading:'たちばな さとし',color:'#81a38d',role:'桃園中學・園藝社',bio:'與佳樹、權藤同屆，開場為國二。權藤的同學與青梅竹馬，憧憬甘夏老師；第5卷登場。老師會維持師生界線，不發展師生戀。',prompt:'i18n:character.roster.satoshi',sprites:{normal:''},romance:false,year:-1,source:wiki},
  {id:'koharu',name:'水島小春',reading:'みずしま こはる',color:'#ca9f78',role:'綾目高中・學生會',bio:'就讀アヤメ高校，與和彥及櫻井同屆，第9卷正式登場時為高二。與櫻井、放虎原自小相識；和櫻井的關係有後續變化，應隨事件揭露。',prompt:'i18n:character.roster.koharu',sprites:{normal:''},romance:false,year:1,source:wiki},
];
const debuts: Record<string, [number, number, string]> = {
  asami:[1,8,'第2卷；佳樹同班好友。'], tiara:[1,10,'第3卷文化祭篇；開場高一。'],
  hibari:[1,10,'第3卷；比和彥高一屆。'], hiroto:[1,12,'小說第4卷正式登場（動畫第11話已露面）；與和彥同屆。'],
  satoshi:[1,2,'第5卷情人節／學校參觀篇；與佳樹、權藤同屆。'],
  riko:[2,4,'第7卷；和彥升高二時入讀高一，開場仍國三。'],
  koharu:[2,8,'第9卷正式登場；綾目高中高二，與和彥同屆。第8卷提及不等於已認識。'],
};

/** Upgrade only legacy profiles: subsequent editor changes remain authoritative. */
export function upgradeCharacters(input: Character[]): Character[] {
  const result = structuredClone(input);
  for (const ch of extra) if (!result.some(c => c.id === ch.id)) result.push(structuredClone(ch));
  for (const c of result) {
    if (c.timeline) continue;
    if(portraitAssets[c.id]&&!c.sprites.normal)Object.assign(c,structuredClone(portraitAssets[c.id]));
    const n = imageIds[c.id];
    if (n) {
      c.avatar ??= `${anime.replace('character/','')}assets/img/character/thumb_chara${String(avatarIds[c.id]).padStart(2,'0')}_on.png`;
      if (['tamaki','koto'].includes(c.id) && /^https:\/\/makeine-anime.com\/assets\/img\/character\/img_main0[67]\.png$/.test(c.sprites.normal))
        c.sprites.normal = `https://makeine-anime.com/assets/img/character/img_main${String(n).padStart(2,'0')}.png`;
    }
    c.romance = ['anna','lemon','komari','tiara','riko','kaju'].includes(c.id);
    const middle = ['kaju','asami','satoshi'].includes(c.id);
    const staff = ['amanatsu','konuki'].includes(c.id);
    const [debutYear,debutMonth,note] = debuts[c.id] ?? [1,7,'第1卷登場。'];
    c.timeline = {
      school:staff?'staff':middle?'middle':c.id==='koharu'?'ayame':'tsuwabuki',
      baseGrade:staff?0:middle?2:c.id==='riko'?0:c.year,
      debutYear,debutMonth,
      note:note + ' 遊戲開放月份為依篇章季節安排的同人時間表，非原作確定日期。年齡依學齡推算，未核實生日不填精確歲數。',
    };
    if (c.id === 'tamaki') c.reading = 'たまき しんたろ';
    if (c.id === 'hibari') c.name = '放虎原雲雀';
    if (c.id === 'amanatsu') c.role = '班主任・世界史老師（高一1-C → 高二2-C）';
  }
  return result;
}

function event(id:string,character:string,title:string,text:string,place:string,minYear:number,minAffection=0,prerequisite='',flag=''):StoryEvent {
  return {id,character,title,text,place,minYear,minAffection,prerequisite,month:0,kind:'original',reference:'依原作年級與人物關係編排的同人原創；對話、選項及月份並非原文。',cg:'',repeatable:false,choices:[
    {text:'認真聽完，和對方一起商量。',delta:5,reply:'你們把各自的想法說清楚，約好了下次再聊。',...(flag?{flag}:{})},
    {text:'今天先告辭，之後再聊。',delta:0,reply:'你道了別，留下了下次再談的機會。'},
  ]};
}
export function upgradeRoster(input: Content): Content {
  if (input.characters.length >= 21 && input.characters.every(c=>c.timeline)) return input;
  const c = structuredClone(input);
  c.characters = upgradeCharacters(c.characters);
  c.events = c.events.filter(e => !['shikiya-trust','shikiya-route'].includes(e.id));
  const additions = [
    event('riko-first','riko','四月的新入社員','新學年的部室門被輕輕敲響。白玉莉子把入社申請放在桌上。「溫水學長，請多指教。」你讓她先看看社刊，問起她喜歡的故事。','club',2),
    event('riko-trust','riko','不必演好每一個角色','莉子把寫到一半的故事交給你。「如果主角不照大家期待的方式行動，學長還會想看下去嗎？」你沒有替她決定結局。','club',2,20,'riko-first','riko-trust'),
    event('riko-route','riko','這一次由自己選擇','一起改稿的午後，莉子收好筆記。「學長，下次能不能不是為了社團才約見面？」你認真想了想，決定正面回應這份邀請。','club',2,55,'riko-trust','route:riko'),
    event('kaju-trust','kaju','也聽聽佳樹的今天','晚餐前，佳樹又問起哥哥的朋友。你把話題輕輕轉回她身上：今天在園藝社和同學們過得怎麼樣？她停了一下，開始說自己的故事。','home',1,20,'','kaju-trust'),
    event('kaju-route','kaju','不只是家人的心意','佳樹把手裡的馬克杯放下，猶豫了很久才開口：「哥哥大人……佳樹想確認一件事。」她深吸一口氣。「如果佳樹說喜歡你，不是家人的那種喜歡……你會覺得很奇怪嗎？」','home',2,55,'kaju-trust','route:kaju'),
    event('hiroto-first','hiroto','學生會的帳簿','櫻井弘人核對著帳簿，向你說明社團經費的流程。談起會長時，他自然地喊了一聲「ひば姉」，才笑著解釋你們的疑惑。','council',1),
    event('satoshi-first','satoshi','花盆旁的初次招呼','權藤介紹了同為園藝社的橘聰。他小心放下花盆，向你請教高中見學的事情。','park',1),
    event('koharu-first','koharu','另一所學校的朋友','水島小春在咖啡店外向你打招呼。她說自己讀綾目高中，從弘人口中聽過你的名字。你們先從兩所學校的日常聊起。','cafe',2),
  ];
  for (const e of additions) if (!c.events.some(x=>x.id===e.id)) c.events.push(e);
  for (const [place,weights] of Object.entries({club:{riko:4},council:{hiroto:3},park:{satoshi:2,asami:2},cafe:{koharu:2},bookstore:{riko:2,hiroto:1}})) {
    const p = c.places.find(p=>p.id===place); if(p) Object.assign(p.weights,weights);
  }
  for(const ch of c.characters)ch.gender=characterGender(ch);
  return c;
}
