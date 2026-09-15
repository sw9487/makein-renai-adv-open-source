import {test,expect} from 'bun:test';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {defaultContent} from '../core/content';
import {novelEvents,novelSources,novelPackId} from '../core/novel-events';
import {act,createGame,eventEligible} from '../core/engine';
import {upgradeStories} from '../core/story';
import {validateContent} from '../server/validation';

test('six novel events are playable in their assigned academic year and unlock CGs',()=>{
  expect(novelEvents).toHaveLength(6);
  expect(novelSources.map(s=>s.volume)).toEqual([4,5,6,7,8,9]);
  for(const original of novelEvents){
    const e=defaultContent.events.find(e=>e.id===original.id)!;
    let s=act(createGame(defaultContent,1),defaultContent,{type:'choose',index:0});
    const year=2025+e.minYear+(e.month<4?1:0);
    s.date=`${year}-${String(e.month).padStart(2,'0')}-10`;
    while([0,6].includes(new Date(s.date+'T12:00:00Z').getUTCDay()))s.date=s.date.slice(0,8)+String(Number(s.date.slice(8))+1);
    s.phase=1;s.location=e.place;s.completed.push(e.prerequisite);
    expect(eventEligible(s,defaultContent,e)).toBe(true);
    const before=structuredClone(s);before.completed=before.completed.filter(id=>id!==e.prerequisite);
    expect(eventEligible(before,defaultContent,e)).toBe(false);
    const nextYear={...s,date:s.date.replace(String(year),String(year+1))};
    expect(eventEligible(nextYear,defaultContent,e)).toBe(false);
    const opened=act(s,defaultContent,{type:'visit',place:e.place});
    expect(opened.dialogue.eventId).toBe(e.id);
    expect(opened.dialogue.script!.length).toBeGreaterThanOrEqual(5);
    const good=act(opened,defaultContent,{type:'choose',index:0});
    expect(good.completed).toContain(e.id);expect(good.gallery).toContain(e.id);
    expect(good.affection[e.character]).toBeGreaterThan(opened.affection[e.character]??0);
    const bad=structuredClone(opened);bad.affection[e.character]=20;
    expect(act(bad,defaultContent,{type:'choose',index:2}).affection[e.character]).toBeLessThan(20);
    expect(e.reference).toContain('https://gagagabunko.jp/lineup/');
    expect(existsSync(join(import.meta.dir,'../content/assets',e.cg.slice('/assets/authored/'.length)))).toBe(true);
  }
});

test('novel pack adds to existing anime pack once, preserving editor choices',()=>{
  const old=structuredClone(defaultContent);
  old.storyPacks=old.storyPacks?.filter(id=>id!==novelPackId);
  old.events=old.events.filter(e=>!e.id.startsWith('novel-'));
  const upgraded=upgradeStories(old);
  expect(upgraded.events.filter(e=>novelEvents.some(n=>n.id===e.id))).toHaveLength(6);
  expect(upgraded.events.filter(e=>e.id.startsWith('canon-'))).toHaveLength(10);
  upgraded.events=upgraded.events.filter(e=>e.id!==novelEvents[0].id);
  upgraded.events.find(e=>e.id===novelEvents[1].id)!.title='Author edit';
  const saved=upgradeStories(validateContent(upgraded));
  expect(saved.events.some(e=>e.id===novelEvents[0].id)).toBe(false);
  expect(saved.events.find(e=>e.id===novelEvents[1].id)!.title).toBe('Author edit');
});
