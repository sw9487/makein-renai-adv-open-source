import {test,expect} from 'bun:test';
import {defaultContent} from '../core/content';
import {createGame,act,weightedPick,eventEligible} from '../core/engine';
import {encounterWeights} from '../core/timeline';
import {momozonoVisit,momozonoPackId} from '../core/momozono';
import {upgradeStories} from '../core/story';
import {validateContent} from '../server/validation';

test('Momozono allows only current middle school students and respects debut and graduation',()=>{
 const s=createGame(defaultContent,1);s.location='momozono';s.phase=1;s.date='2027-02-10';
 const weights={kaju:5,asami:4,satoshi:3,anna:100,amanatsu:100};
 const available=encounterWeights(s,defaultContent,weights,true).filter(r=>r.effectiveWeight>0).map(r=>r.id).sort();
 expect(available).toEqual(['asami','kaju','satoshi']);
 for(let i=0;i<20;i++)expect(available).toContain(weightedPick(s,defaultContent,weights,true));
 s.date='2026-07-13';expect(encounterWeights(s,defaultContent,weights,true).filter(r=>r.effectiveWeight>0).map(r=>r.id)).toEqual(['kaju']);
 s.date='2028-03-01';expect(weightedPick(s,defaultContent,weights,true)).toBe('');
 s.date='2027-02-13';expect(weightedPick(s,defaultContent,weights,true)).toBe('');
});
test('school visit follows Valentine scene, awards CG and cannot occur at Tsuwabuki',()=>{
 let s=act(createGame(defaultContent,1),defaultContent,{type:'choose',index:0});s.date='2027-02-10';s.phase=1;s.location='momozono';
 expect(eventEligible(s,defaultContent,momozonoVisit)).toBe(false);
 s.completed.push('novel-valentine-suspicion');
 expect(eventEligible(s,defaultContent,momozonoVisit)).toBe(true);
 expect(eventEligible(s,defaultContent,{...momozonoVisit,place:'classroom'})).toBe(false);
 s=act(s,defaultContent,{type:'visit',place:'momozono'});
 expect(s.dialogue.eventId).toBe(momozonoVisit.id);
 s=act(s,defaultContent,{type:'choose',index:0});expect(s.gallery).toContain(momozonoVisit.id);
});
test('campus survives editor save and one-time migration respects deletions',()=>{
 const old=structuredClone(defaultContent);old.storyPacks=old.storyPacks?.filter(id=>id!==momozonoPackId);old.places=old.places.filter(p=>p.id!=='momozono');old.events=old.events.filter(e=>e.id!==momozonoVisit.id);
 const upgraded=upgradeStories(old);expect(upgraded.places.find(p=>p.id==='momozono')?.campus).toBe('middle');
 expect(validateContent(upgraded).places.find(p=>p.id==='momozono')?.campus).toBe('middle');
 upgraded.places=upgraded.places.filter(p=>p.id!=='momozono');upgraded.events=upgraded.events.filter(e=>e.place!=='momozono');
 expect(upgradeStories(validateContent(upgraded)).places.some(p=>p.id==='momozono')).toBe(false);
});
