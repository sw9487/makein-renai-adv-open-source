import type {TwitterState} from './twitter';

/** Stable topic IDs are stored on police posts and jobs, independently of UI language. */
export const policeAdvisoryTopics=[
 'fraud','heat','drunk_driving','organized_crime','gangs','smuggling',
 'robbery','burglary','fire','heavy_rain','typhoon','cold',
 'traffic','cybercrime','stalking','school_routes','disaster_readiness',
] as const;
export type PoliceAdvisoryTopic=typeof policeAdvisoryTopics[number];

/** Recognize old untagged posts and catch an obvious mismatch with a scheduled topic. */
export function inferPoliceAdvisoryTopic(text:string):PoliceAdvisoryTopic|undefined{
 const patterns:[PoliceAdvisoryTopic,RegExp][]=[
  ['drunk_driving',/飲酒運転|酒気帯び|酒後駕車|酒駕|drunk driv|drink.driv/i],
  ['typhoon',/台風|颱風|typhoon/i],
  ['heavy_rain',/大雨|豪雨|暴雨|豪大雨|heavy rain|flood/i],
  ['heat',/熱中症|水分補給|水分を[取摂と]|水を飲|こまめに水分|中暑|補充水分|補水|多喝水|炎熱|heatstroke|hydrat/i],
  ['cold',/低体温|防寒|寒波|保暖|失溫|嚴寒|hypothermia|keep warm/i],
  ['organized_crime',/組織犯罪|組織的犯罪|organized crime/i],
  ['gangs',/暴走族|暴力団|反社会的勢力|黑道|暴走集團|幫派|gang violence|biker gang/i],
  ['smuggling',/密輸|走私|smuggl/i],
  ['robbery',/強盗|路上強盗|搶劫|強盜|robber/i],
  ['burglary',/空き巣|侵入窃盗|住居侵入|潛入行竊|入室盜竊|竊盜|burglar|break.in/i],
  ['fire',/火災|火事|放火|消防|防火|fire safety|house fire|arson/i],
  ['cybercrime',/サイバー犯罪|不正アクセス|網路犯罪|網絡犯罪|駭客|cybercrime|hacking/i],
  ['stalking',/ストーカー|つきまとい|尾隨|跟蹤騷擾|stalk/i],
  ['school_routes',/通学路|登下校|校園安全|上下學|上學路|school route/i],
  ['fraud',/詐欺|詐騙|特殊詐欺|振り込め|フィッシング|scam|fraud|phishing/i],
  ['traffic',/交通安全|歩行者|横断歩道|車間距離|行車安全|交通事故|pedestrian|road safety/i],
  ['disaster_readiness',/防災|避難訓練|非常持出|避難所|防災準備|疏散準備|disaster preparedness|emergency kit/i],
 ];
 return patterns.find(([,pattern])=>pattern.test(text))?.[0];
}

export function policeAdvisoryUsedTopics(t:TwitterState,date:string,actor:string):Set<string>{
 return new Set<string>(Object.values(t.posts).filter(post=>post.author===actor&&post.date===date&&!post.replyTo&&!post.quoteTo)
  .map(post=>post.advisoryTopic??inferPoliceAdvisoryTopic(post.text)).filter((topic):topic is PoliceAdvisoryTopic=>policeAdvisoryTopics.includes(topic as PoliceAdvisoryTopic)));
}

export function choosePoliceAdvisoryTopic(t:TwitterState,date:string,actor:string,draw=Math.random,ignoreJob?:string):PoliceAdvisoryTopic|undefined{
 const used=policeAdvisoryUsedTopics(t,date,actor);
 for(const [id,job] of Object.entries(t.jobs??{}))if(id!==ignoreJob&&job.actor===actor&&job.date===date&&!job.trigger&&['scheduled','running'].includes(job.status)&&job.advisoryTopic)used.add(job.advisoryTopic as PoliceAdvisoryTopic);
 const month=Number(date.slice(5,7));
 const seasonal=(topic:PoliceAdvisoryTopic)=>topic==='heat'?month>=5&&month<=9:topic==='cold'?month>=11||month<=3:topic==='typhoon'||topic==='heavy_rain'?month>=5&&month<=10:true;
 const available=policeAdvisoryTopics.filter(topic=>seasonal(topic)&&!used.has(topic));
 if(!available.length)return;
 const lastUsed=(topic:PoliceAdvisoryTopic)=>Object.values(t.posts).filter(post=>post.author===actor&&(post.advisoryTopic??inferPoliceAdvisoryTopic(post.text))===topic).reduce((latest,post)=>post.date>latest?post.date:latest,'');
 const oldest=available.map(topic=>({topic,last:lastUsed(topic)})).sort((a,b)=>a.last.localeCompare(b.last));
 const least=oldest.filter(item=>item.last===oldest[0].last);
 return least[Math.floor(Math.max(0,Math.min(0.999999,draw()))*least.length)].topic;
}
