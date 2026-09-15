import type {Content,Place,StoryEvent,StoryLine} from './types';
export const momozonoPackId='momozono-school-v1';
const background='/assets/authored/backgrounds/00000000-0000-4000-8000-000000000110.png';
export const momozono:Place={id:'momozono',name:'桃園中學',subtitle:'佳樹與朋友們的校園・園藝社花圃',school:true,campus:'middle',background,weights:{kaju:5,asami:4,satoshi:3}};
const script:StoryLine[]=[
  {kind:'narration',text:'佳樹的巧克力讓你在意得坐立難安。聽了檸檬的提議，你來到桃園中學的參觀活動，原本只想確認妹妹平常和誰來往，走進校門後卻先被園藝社的花圃吸引。'},
  {kind:'narration',text:'花盆旁擺著整理好的工具。遠處的學生正交換今天的工作，這是你在家裡很少看見的日常：佳樹不是只會等哥哥回家，也有自己熟悉的人與地方。'},
  {kind:'speech',speaker:'溫水佳樹',text:'哥哥大人？怎麼來了也沒有先告訴佳樹。這邊是園藝社照顧的花，別踩到旁邊的小苗喔。'},
  {kind:'narration',text:'她認出你時並沒有露出想像中的慌張。反而是你，原先準備好的調查問題忽然一句也接不上，只好先把腳從花圃邊緣挪開。'},
  {kind:'speech',speaker:'溫水佳樹',text:'想看哪裡？佳樹可以帶路。還是說……哥哥有別的事情想問？'},
  {kind:'narration',text:'你終於站進她的生活裡。接下來要怎麼問，決定了這趟參觀會是一次理解，還是一場讓人難堪的盤查。'},
];
export const momozonoVisit:StoryEvent={id:'novel-momozono-visit',title:'桃園中學參觀・妹妹的另一種日常',character:'kaju',place:'momozono',month:2,minYear:1,maxYear:1,minAffection:0,prerequisite:'novel-valentine-suspicion',kind:'canon-inspired',repeatable:false,cg:background,script,text:script.map(l=>l.kind==='speech'?`${l.speaker}：「${l.text}」`:l.text).join('\n\n'),reference:'小說第5卷桃園中學調查題材。依使用者提供的第4～9卷主線整理改編；出版社簡介已核對的調查起點：https://gagagabunko.jp/lineup/202303.html。參觀對話、選項及回應為同人新寫，不是原文或巧克力收件人揭露。背景為本專案 imagegen 原創。',choices:[
  {text:'我有點擔心，所以想看看妳平常生活的地方。',delta:3,reply:'佳樹聽完你的解釋，帶你沿著花圃慢慢走。你開始問她照顧的是哪些植物，話題也終於從自己的猜測，轉向她真正想分享的日常。'},
  {text:'先帶我參觀吧，巧克力的事情等等再聊。',delta:1,reply:'佳樹點頭，把參觀路線指給你看。你沒有急著要求答案，先聽她介紹校園裡熟悉的角落。'},
  {text:'先告訴我那個男生是誰，我就是來確認這件事。',delta:-3,reply:'佳樹停下腳步，請你別在其他學生面前這樣追問。你終於注意到周圍的視線，也發現自己的擔心已經讓她感到為難。'},
]};
export function addMomozono(c:Content):Content {
  if(c.storyPacks?.includes(momozonoPackId))return c;
  if(!c.places.some(p=>p.id===momozono.id))c.places.push(structuredClone(momozono));
  if(!c.events.some(e=>e.id===momozonoVisit.id))c.events.unshift(structuredClone(momozonoVisit));
  if(!c.assets.some(a=>a.id==='scene-momozono'))c.assets.push({id:'scene-momozono',title:'桃園中學・校門與園藝社花圃',url:background,source:'',note:'imagegen 生成的原創日本中學情境背景；非官方動畫截圖、小說插圖或實景照片。生成提示見 docs/momozono-map.md。'});
  c.storyPacks=[...(c.storyPacks??[]),momozonoPackId];
  return c;
}
