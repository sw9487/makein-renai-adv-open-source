import {test,expect} from 'bun:test';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {defaultContent} from '../core/content';
import {canonEvents,canonPackId,addCanonEvents} from '../core/canon-events';
import {createGame,act,eventEligible} from '../core/engine';
import {upgradeStories} from '../core/story';
import {validateContent} from '../server/validation';

test('ten sourced events can be visited, chosen and added to the gallery in order',()=>{
  expect(canonEvents).toHaveLength(10);
  expect(new Set(canonEvents.map(e=>e.cg)).size).toBe(10);
  let s=act(createGame(defaultContent,1),defaultContent,{type:'choose',index:0});
  for(const e of canonEvents){
    s.date=`2026-${String(e.month).padStart(2,'0')}-13`;
    while([0,6].includes(new Date(s.date+'T12:00:00Z').getUTCDay()))s.date=s.date.slice(0,8)+String(Number(s.date.slice(8))+1);
    s.phase=1;s.flags=s.flags.filter(f=>!f.startsWith('visited:'));
    s.location=e.place;
    expect(eventEligible(s,defaultContent,e)).toBe(true);
    const opened=act(s,defaultContent,{type:'visit',place:e.place});
    expect(opened.dialogue.eventId).toBe(e.id);
    expect(opened.dialogue.script!.length).toBeGreaterThanOrEqual(4);
    s=act(opened,defaultContent,{type:'choose',index:0});
    expect(s.completed).toContain(e.id);expect(s.gallery).toContain(e.id);
    expect(eventEligible(s,defaultContent,e)).toBe(false);
    expect(eventEligible({...s,date:s.date.replace('2026','2027'),completed:[]},defaultContent,e)).toBe(false);
    expect(e.reference).toContain('https://makeine-anime.com/story/');
    const file=join(import.meta.dir,'../content/assets',e.cg.slice('/assets/authored/'.length));
    expect(existsSync(file)).toBe(true);
    const bytes=readFileSync(file);expect(bytes[0]).toBe(0xff);expect(bytes.length).toBeGreaterThan(10000);
  }
});

test('legacy editor data receives the pack once and retains later edits and deletions',()=>{
  const old=structuredClone(defaultContent);delete old.storyPacks;
  old.events=old.events.filter(e=>!e.id.startsWith('canon-'));
  const first=upgradeStories(old);
  expect(first.storyPacks).toContain(canonPackId);
  expect(first.events.filter(e=>e.id.startsWith('canon-'))).toHaveLength(10);
  first.events=first.events.filter(e=>e.id!==canonEvents[0].id);
  first.events.find(e=>e.id===canonEvents[1].id)!.title='Custom title';
  const saved=validateContent(first);
  const next=upgradeStories(saved);
  expect(next.events.some(e=>e.id===canonEvents[0].id)).toBe(false);
  expect(next.events.find(e=>e.id===canonEvents[1].id)!.title).toBe('Custom title');
  expect(next.events.find(e=>e.id===canonEvents[1].id)!.maxYear).toBe(1);
  expect(addCanonEvents(next)).toEqual(next);
});
