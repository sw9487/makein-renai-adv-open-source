import type {GameState} from './types';

export function blocksDialoguePaging(requestBusy:boolean,imageGenerating:boolean,sceneTransition:boolean):boolean {
  return sceneTransition || (requestBusy && !imageGenerating);
}

export function shouldFadeBeforeAction(action:Record<string,unknown>,currentLocation?:string):boolean {
  return action.type==='new' || action.type==='advance' || action.type==='skip' || action.type==='date-confirm' ||
    action.type==='visit';
}

/** A manual retry is a new provider attempt, not a replay of the failed request. */
export function freshRetryAction(action:Record<string,unknown>):Record<string,unknown> {
  const {requestId: _failedRequestId,...retry}=action;
  return retry;
}

export function shouldOpenMap(s:GameState):boolean {
  if(s.ended || s.dialogue.choices?.length) return false;
  if(s.dialogue.navigation==='map') return true;
  // Older saves predate the explicit navigation intent.
  return !s.character && s.dialogue.speaker==='旁白' && [
    '週末沒有課。今天想去哪裡？',
    '下課鐘響了。離回家還有一些時間，去熟悉的地方看看吧。',
  ].includes(s.dialogue.text.replace(/&#x20;|&#32;/gi,' ').trim());
}
