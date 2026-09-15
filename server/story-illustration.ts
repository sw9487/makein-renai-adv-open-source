import {createHash} from 'node:crypto';
import type {GameState} from '../core/types';

// Narrative beats, not elapsed seconds: slow providers never acquire a deadline.
export function admitStoryIllustration(s:GameState){
  const {cg,...dialogue}=s.dialogue;
  const scene=createHash('sha256').update(JSON.stringify({date:s.date,phase:s.phase,location:s.location,dialogue})).digest('hex');
  const previous=s.storyIllustration;
  if(previous?.scene===scene)return false;
  const remaining=Math.max(0,(previous?.remaining??0)-1);
  s.storyIllustration={scene,remaining,recent:previous?.recent??[]};
  if(cg||previous&&previous.remaining>0)return false;
  // Also space refusals and failed attempts, preventing a decision request each beat.
  s.storyIllustration.remaining=3;
  return true;
}

export function rememberStoryIllustration(s:GameState,caption:string){
  if(!s.storyIllustration)admitStoryIllustration(s);
  s.storyIllustration!.remaining=3;
  s.storyIllustration!.recent=[...s.storyIllustration!.recent,{date:s.date,phase:s.phase,place:s.location,caption}].slice(-4);
}
