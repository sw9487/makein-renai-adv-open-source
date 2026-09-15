import type {Content,GameState} from '../core/types';
import {sceneContext} from './scene-context';

/** A player scene is visible only to its confirmed participant. No guessed attendance. */
export function visibleScene(s:GameState,id:string){
  if(s.character!==id)return undefined;
  const script=s.dialogue.script?.filter(line=>line.kind!=='thought');
  // Do not include unchosen replies, internal thoughts, or aggregate text containing thoughts.
  return script?{script}:{speaker:s.dialogue.speaker,text:s.dialogue.text,narration:s.dialogue.narration};
}
export function characterContext(s:GameState,c:Content,id:string){
  const {place,...time}=sceneContext(s,c);
  return {...time,...(s.character===id?{place}:{})};
}
export function sharedPrevious(previous:GameState|undefined,c:Content,id:string){
  if(!previous||previous.character!==id)return undefined;
  return {...characterContext(previous,c,id),dialogue:visibleScene(previous,id)};
}
