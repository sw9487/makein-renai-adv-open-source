import type {Content,GameState} from '../core/types';
import {dayPhaseNames} from '../core/engine';
import {calendarPromptContext} from '../core/calendar';
import {prompt} from './prompt';

export function sceneContext(s:GameState,c:Content){
 return {date:s.date,phase:s.phase,timeOfDay:dayPhaseNames(s.date)[s.phase],calendar:calendarPromptContext(s.date),place:c.places.find(p=>p.id===s.location)?.name??s.location};
}

export function sceneTimePrompt(s:GameState,c:Content,includePlace=true){
 const now=sceneContext(s,c);
 return prompt(includePlace?'scene.time.place':'scene.time',{date:now.date,time:now.timeOfDay,place:now.place})+'\nCALENDAR_FACTS='+JSON.stringify(now.calendar);
}
