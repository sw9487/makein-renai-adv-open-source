import {genderProfile} from './character-gender';
import type { Character, Content, GameState } from './types';
import { roleStages } from './role-stages';
import { schoolUnavailable } from './calendar';
const academic = (date:string) => Number(date.slice(0,4))-(Number(date.slice(5,7))<4?1:0);
/** All authored dates use Kazuhiko's April–March academic year. */
export function stageDate(startDate:string,stage:{year:number;month:number;day?:number}) {
  const y=academic(startDate)+stage.year-1+(stage.month<4?1:0);
  return `${y}-${String(stage.month).padStart(2,'0')}-${String(stage.day??1).padStart(2,'0')}`;
}
function graduated(ch:Character,s:GameState,c:Content) {
  const t=ch.timeline;
  if(!t||!['tsuwabuki','ayame','middle'].includes(t.school))return false;
  const finalYear=4-t.baseGrade;
  return s.date>=stageDate(c.settings.startDate,{year:finalYear,month:3});
}
export function characterAvailable(ch:Character,s:GameState,c:Content,school:boolean|'middle'=false) {
  const year=academic(s.date)-academic(c.settings.startDate)+1;
  const t=ch.timeline;
  if(!t) return school==='middle'?false:!school || ch.year<=0 || ch.year+year-1<=3;
  const progress=(year-1)*12+(Number(s.date.slice(5,7))+8)%12;
  const debut=(t.debutYear-1)*12+(t.debutMonth+8)%12;
  if(progress<debut) return false;
  if(!school) return true;
  if(school==='middle')return t.school==='middle'&&t.baseGrade+year-1>=1&&t.baseGrade+year-1<=3&&!graduated(ch,s,c);
  return t.school==='staff' || (t.school==='tsuwabuki' && t.baseGrade+year-1>=1 && t.baseGrade+year-1<=3 && !graduated(ch,s,c));
}
export function schoolLabel(ch:Character,s:GameState,c:Content) {
  const year=academic(s.date)-academic(c.settings.startDate)+1;
  const t=ch.timeline;
  if(!t) return ch.role;
  const g=t.baseGrade+year-1;
  if(t.school==='staff') return '石蕗高中・教職員（確切年齡未核實）';
  if(t.school==='outside') return ch.role;
  if(g===3&&graduated(ch,s,c)) return `${t.school==='middle'?'桃園中學':t.school==='ayame'?'綾目高中':'石蕗高中'}已畢業・等待4月新學年（畢業日採遊戲3月1日安排）`;
  if(t.school==='middle') return g<=3?`桃園中學${g}年級・約${g+11}–${g+12}歲（學齡推算）`:`桃園中學已畢業・高中${g-3}年級學齡・升學去向未核實`;
  if(g===0) return '中學三年級（校名未核實）・下學年入讀石蕗高中';
  if(g>3) return `已高中畢業・比和彥高${t.baseGrade-1}屆`;
  return `${t.school==='ayame'?'綾目高中':'石蕗高中'}${g}年級・約${g+14}–${g+15}歲（學齡推算）`;
}
export function roleLabel(ch:Character,s:GameState,c:Content) {
  const year=academic(s.date)-academic(c.settings.startDate)+1;
  const progress=(year-1)*12+(Number(s.date.slice(5,7))+8)%12;
  const stages=ch.roles??roleStages[ch.id]??[];
  const latest=stages.filter(t=>stageDate(c.settings.startDate,t)<=s.date).sort((a,b)=>stageDate(c.settings.startDate,a).localeCompare(stageDate(c.settings.startDate,b))).at(-1);
  return latest?.role ?? ch.role.replace(/(?:[一二三123]年級|國[一二三]|高[一二三])[・\s]*/g,'');
}
export function currentProfile(ch:Character,s:GameState,c:Content) {
  const year=academic(s.date)-academic(c.settings.startDate)+1;
  const currentGrade=(ch.timeline?.baseGrade??ch.year)+year-1;
  return {name:ch.name,...genderProfile(ch),date:s.date,schoolAndAge:schoolLabel(ch,s,c),role:roleLabel(ch,s,c),
    relativeSchoolYears:ch.timeline?.school==='middle'?-2:ch.timeline?.school==='staff'?null:(ch.timeline?.baseGrade??1)-1,
    universityYear:['tamaki','koto'].includes(ch.id)&&currentGrade>3?currentGrade-3:undefined,
    available:characterAvailable(ch,s,c),romance:ch.romance,
    continuity:'歷史記憶保留當時日期；今天的學校、年級和職務只使用這份即時資料。未知生日不捏造精確年齡；未核實的升學去向不捏造。'};
}

/** The same effective distribution is used by the game and editor preview. */
export function encounterWeights(s:GameState,c:Content,weights:Record<string,number>,school=false,place=s.location){
 const campus=school&&c.places.find(p=>p.id===place)?.campus==='middle'?'middle':school;
 const closed=school&&schoolUnavailable(s.date);
 const rows=c.characters.filter(ch=>ch.id!=='kazuhiko').map(ch=>{
  const baseWeight=weights[ch.id]??0;
  let reason='';
  if(!characterAvailable(ch,s,c)) reason='尚未到登場時間';
  else if(closed) reason='今日非上課日，校舍關閉';
  else if(school&&!characterAvailable(ch,s,c,campus)) reason=campus==='middle'?'非桃園中學在校學生（含已畢業）':schoolLabel(ch,s,c).includes('已高中畢業')?'已畢業，校內不出現':'非石蕗在校學生';
  else if(place==='council'&&ch.timeline?.school!=='staff'&&(!roleLabel(ch,s,c).includes('學生會')||roleLabel(ch,s,c).startsWith('前'))) reason='當時未任學生會職務';
  else if(baseWeight<=0||!Number.isFinite(baseWeight)) reason='未設定出現權重';
  return {id:ch.id,baseWeight,effectiveWeight:reason?0:baseWeight,reason,probability:0};
 });
 const total=rows.reduce((sum,row)=>sum+row.effectiveWeight,0);
 for(const row of rows) row.probability=total?row.effectiveWeight/total:0;
 return rows;
}
