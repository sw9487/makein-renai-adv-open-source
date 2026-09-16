import patches from '../content/story-upgrade.json';
import type { Content, StoryLine } from './types';
import {repairKajuStories} from './kaju-story-repair';
import {addCanonEvents} from './canon-events';
import {addNovelEvents} from './novel-events';
import {addMomozono} from './momozono';
import {addContinuation} from './mainline-continuation';
import {addNovelBooks} from './novel-books';
import {addOfficialPlaces} from './official-places';
/** Upgrade only untouched built-in text, preserving custom editor scripts. */
export function upgradeStories(input:Content):Content {
 const c=structuredClone(input);
 for(const e of c.events){
  const patch=patches.find(p=>p.id===e.id&&p.previous===e.text);
  if(!patch||e.script?.length) continue;
  e.text=patch.text;e.script=patch.script as StoryLine[];
  if(patch.choices) e.choices=patch.choices;
 }
 return addOfficialPlaces(addNovelBooks(addContinuation(addMomozono(addNovelEvents(addCanonEvents(repairKajuStories(c)))))));
}
