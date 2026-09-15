import {test,expect} from 'bun:test';
import {calendarPromptContext,schoolCalendar,schoolCalendarRules,schoolClosed,schoolUnavailable} from '../core/calendar';
import {act,createGame,dayPhaseNames,tick} from '../core/engine';
import {defaultContent} from '../core/content';

test('school calendar models openings, vacations, New Year, Golden Week and ordinary days',()=>{
 expect(schoolCalendarRules).toEqual({
  summerVacationStart:'07-21',winterVacationStart:'12-24',springVacationStart:'03-25',
  goldenWeekStart:'04-29',goldenWeekEnd:'05-05',newYearHolidayStart:'01-01',newYearHolidayEnd:'01-03',
  openingDayCandidates:['04-08','09-01','01-07'],
 });
 expect(schoolCalendar('2026-04-08')).toMatchObject({dayType:'opening-day',label:'開學日',schoolOpen:true,openingDay:true});
 expect(schoolCalendar('2026-05-01')).toMatchObject({dayType:'golden-week',label:'黃金周',schoolOpen:false});
 expect(schoolCalendar('2026-07-21')).toMatchObject({dayType:'summer-vacation',label:'暑假',schoolOpen:false});
 expect(schoolCalendar('2026-09-01')).toMatchObject({dayType:'opening-day',label:'開學日',schoolOpen:true});
 expect(schoolCalendar('2026-12-24')).toMatchObject({dayType:'winter-vacation',label:'寒假',schoolOpen:false});
 expect(schoolCalendar('2027-01-01')).toMatchObject({label:'日本新年假期・寒假',holiday:'日本新年假期',vacation:'寒假',schoolOpen:false});
 expect(schoolCalendar('2027-01-07')).toMatchObject({dayType:'opening-day',schoolOpen:true});
 expect(schoolCalendar('2027-02-11')).toMatchObject({dayType:'public-holiday',holiday:'建國紀念之日',schoolOpen:false});
 expect(schoolCalendar('2027-06-01')).toMatchObject({dayType:'school-day',label:'上課日',schoolOpen:true});
 expect(calendarPromptContext('2026-07-21').factualConstraint).toContain('no regular classes');
});

test('vacations use free-day phases and close school locations in actual gameplay',()=>{
 const s=createGame(defaultContent,0);s.date='2026-07-20';s.phase=2;s.dialogue.choices=undefined;
 tick(s,defaultContent);
 expect(s.date).toBe('2026-07-21');expect(s.location).toBe('home');expect(s.dialogue.text).toContain('暑假');
 expect(dayPhaseNames(s.date)).toEqual(['上午','午後','夜晚']);expect(schoolClosed(s.date)).toBe(true);
 expect(schoolUnavailable(s.date)).toBe(false);
 const club=act(s,defaultContent,{type:'visit',place:'club'});expect(club.location).toBe('club');
 const holiday=structuredClone(s);holiday.date='2027-02-11';holiday.flags=holiday.flags.filter(flag=>!flag.startsWith('visited:'));
 expect(schoolUnavailable(holiday.date)).toBe(true);expect(()=>act(holiday,defaultContent,{type:'visit',place:'club'})).toThrow('校舍休息');
});
