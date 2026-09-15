export type SchoolDayType='school-day'|'opening-day'|'weekend'|'public-holiday'|'summer-vacation'|'winter-vacation'|'spring-vacation'|'golden-week';

/** Authoritative school-calendar dates shared by game logic and the editor. */
export const schoolCalendarRules={
 summerVacationStart:'07-21',
 winterVacationStart:'12-24',
 springVacationStart:'03-25',
 goldenWeekStart:'04-29',
 goldenWeekEnd:'05-05',
 newYearHolidayStart:'01-01',
 newYearHolidayEnd:'01-03',
 openingDayCandidates:['04-08','09-01','01-07'] as const,
} as const;

const utc=(date:string)=>new Date(date+'T12:00:00Z');
const iso=(year:number,month:number,day:number)=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const weekday=(date:string)=>utc(date).getUTCDay();
const nthMonday=(year:number,month:number,n:number)=>{
 const first=weekday(iso(year,month,1));
 return iso(year,month,1+(8-first)%7+(n-1)*7);
};
const vernalEquinox=(year:number)=>Math.floor(20.8431+.242194*(year-1980)-Math.floor((year-1980)/4));
const autumnEquinox=(year:number)=>Math.floor(23.2488+.242194*(year-1980)-Math.floor((year-1980)/4));

function nationalHolidays(year:number){
 const holidays=new Map<string,string>([
  [iso(year,1,1),'元日'],[nthMonday(year,1,2),'成人之日'],[iso(year,2,11),'建國紀念之日'],[iso(year,2,23),'天皇誕生日'],
  [iso(year,3,vernalEquinox(year)),'春分之日'],[iso(year,4,29),'昭和之日'],[iso(year,5,3),'憲法紀念日'],[iso(year,5,4),'綠之日'],[iso(year,5,5),'兒童節'],
  [nthMonday(year,7,3),'海之日'],[iso(year,8,11),'山之日'],[nthMonday(year,9,3),'敬老之日'],[iso(year,9,autumnEquinox(year)),'秋分之日'],
  [nthMonday(year,10,2),'運動之日'],[iso(year,11,3),'文化之日'],[iso(year,11,23),'勤勞感謝之日'],
 ]);
 for(const [date,name] of [...holidays])if(weekday(date)===0){
  const next=utc(date);do next.setUTCDate(next.getUTCDate()+1);while(holidays.has(next.toISOString().slice(0,10)));
  holidays.set(next.toISOString().slice(0,10),name+'補假');
 }
 for(let month=1;month<=12;month++)for(let day=2;day<=30;day++){
  const date=iso(year,month,day),previous=iso(year,month,day-1),next=iso(year,month,day+1);
  if(!holidays.has(date)&&holidays.has(previous)&&holidays.has(next))holidays.set(date,'國民假日');
 }
 return holidays;
}

function firstSchoolWeekday(year:number,month:number,day:number){
 const holidays=nationalHolidays(year),date=utc(iso(year,month,day));
 while([0,6].includes(date.getUTCDay())||holidays.has(date.toISOString().slice(0,10)))date.setUTCDate(date.getUTCDate()+1);
 return date.toISOString().slice(0,10);
}

export function schoolCalendar(date:string){
 const year=Number(date.slice(0,4)),day=weekday(date),weekend=[0,6].includes(day),holidays=nationalHolidays(year);
 const [aprilCandidate,septemberCandidate,januaryCandidate]=schoolCalendarRules.openingDayCandidates.map(value=>value.split('-').map(Number));
 const aprilOpening=firstSchoolWeekday(year,aprilCandidate[0],aprilCandidate[1]),septemberOpening=firstSchoolWeekday(year,septemberCandidate[0],septemberCandidate[1]),januaryOpening=firstSchoolWeekday(year,januaryCandidate[0],januaryCandidate[1]);
 const openingDay=date===aprilOpening||date===septemberOpening||date===januaryOpening;
 const dateInYear=(monthDay:string)=>`${year}-${monthDay}`;
 const goldenWeek=date>=dateInYear(schoolCalendarRules.goldenWeekStart)&&date<=dateInYear(schoolCalendarRules.goldenWeekEnd);
 const summer=date>=dateInYear(schoolCalendarRules.summerVacationStart)&&date<septemberOpening;
 const winter=date>=dateInYear(schoolCalendarRules.winterVacationStart)||date<januaryOpening;
 const spring=date>=dateInYear(schoolCalendarRules.springVacationStart)&&date<aprilOpening;
 const holidayName=date>=dateInYear(schoolCalendarRules.newYearHolidayStart)&&date<=dateInYear(schoolCalendarRules.newYearHolidayEnd)?'日本新年假期':holidays.get(date)??'';
 const dayType:SchoolDayType=openingDay?'opening-day':goldenWeek?'golden-week':summer?'summer-vacation':winter?'winter-vacation':spring?'spring-vacation':holidayName?'public-holiday':weekend?'weekend':'school-day';
 const vacationName=dayType==='summer-vacation'?'暑假':dayType==='winter-vacation'?'寒假':dayType==='spring-vacation'?'春假':dayType==='golden-week'?'黃金周':'';
 const schoolOpen=openingDay||dayType==='school-day';
 const schoolAccessible=schoolOpen||(!weekend&&!holidayName&&['summer-vacation','winter-vacation','spring-vacation'].includes(dayType));
 const label=openingDay?'開學日':holidayName&&vacationName?`${holidayName}・${vacationName}`:vacationName||holidayName||(weekend?'週末':'上課日');
 const schoolTerm=summer?'summer_vacation':winter?'winter_vacation':spring?'spring_vacation':goldenWeek?'golden_week':date<januaryOpening?'winter_vacation':date<aprilOpening?'third_term':date<dateInYear(schoolCalendarRules.summerVacationStart)?'first_term':date<septemberOpening?'summer_vacation':date<dateInYear(schoolCalendarRules.winterVacationStart)?'second_term':'winter_vacation';
 return {date,weekday:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day],dayType,label,schoolOpen,schoolAccessible,schoolTerm,openingDay,weekend,holiday:holidayName||undefined,vacation:vacationName||undefined};
}

export const schoolClosed=(date:string)=>!schoolCalendar(date).schoolOpen;
export const schoolUnavailable=(date:string)=>!schoolCalendar(date).schoolAccessible;

/** Compact, authoritative facts shared by every LLM feature. */
export function calendarPromptContext(date:string){
 const day=schoolCalendar(date);
 return {...day,factualConstraint:day.schoolOpen
  ?'The school calendar says students attend school today. Do not call today a vacation, weekend, or school holiday.'
  :'The school calendar says there are no regular classes today. Do not claim students are currently attending normal classes; respect the named holiday or vacation.'};
}
