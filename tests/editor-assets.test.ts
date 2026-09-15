import {test,expect} from 'bun:test';
import {defaultContent} from '../core/content';
import {createGame,weightedPick} from '../core/engine';
import {encounterWeights} from '../core/timeline';
import {repairPortraits} from '../core/roster';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {socialSettings} from '../core/twitter';

test('every built-in scene and event references an existing local image',()=>{
 for(const url of [...defaultContent.places.map(p=>p.background),...defaultContent.events.map(e=>e.cg)]){
  expect(url).toStartWith('/assets/');
   const file=url.startsWith('/assets/authored/')?join(import.meta.dir,'../content/assets',url.slice('/assets/authored/'.length)):join(import.meta.dir,'../web/public',url);
  expect(existsSync(file)).toBe(true);
 }
});
test('every built-in character has an existing Twitter cover image',()=>{
 for(const character of defaultContent.characters){
  const cover=socialSettings(character).twitterCover!;
  expect(cover).toBe(`/assets/twitter-covers/${character.id}.jpg`);
  expect(existsSync(join(import.meta.dir,'../web/public',cover))).toBe(true);
 }
});
test('editor removes images without migration silently restoring them',()=>{
 const c=structuredClone(defaultContent);
 for(const id of ['riko','koharu','tamaki']){const ch=c.characters.find(ch=>ch.id===id)!;ch.sprites.normal='';ch.avatar='';}
 const next=repairPortraits(c);
 for(const id of ['riko','koharu','tamaki']){const ch=next.characters.find(ch=>ch.id===id)!;expect(ch.sprites.normal).toBe('');expect(ch.avatar).toBe('');}
});
test('effective encounter weights exclude pre-debut, graduated and retired students',()=>{
 const c=defaultContent,s=createGame(c);s.location='club';
 const weights={tamaki:100,koto:100,riko:100};
 s.date='2027-03-31';expect(encounterWeights(s,c,weights,true).find(r=>r.id==='riko')!.effectiveWeight).toBe(0);
 s.date='2027-04-01';expect(weightedPick(s,c,weights,true)).toBe('riko');
 s.location='council';s.date='2027-07-01';
 const rows=encounterWeights(s,c,{shikiya:100,hibari:100,tiara:100,riko:100},true);
 expect(rows.find(r=>r.id==='shikiya')!.effectiveWeight).toBe(0);
 expect(rows.find(r=>r.id==='hibari')!.effectiveWeight).toBe(0);
 expect(rows.find(r=>r.id==='riko')!.effectiveWeight).toBe(100);
 s.date='2027-07-03';expect(encounterWeights(s,c,{tiara:100},true).every(r=>r.effectiveWeight===0)).toBe(true);
});
test('editor uses image controls rather than editable image path fields',()=>{
 const editor=readFileSync(join(import.meta.dir,'../web/components/editor.tsx'),'utf8');
 expect(editor).not.toContain('label="背景圖片網址"');expect(editor).not.toContain('label="圖片網址"');
 expect(editor).toContain('<ImagePicker');
 const build=readFileSync(join(import.meta.dir,'../scripts/build.mjs'),'utf8');
 expect(build).not.toContain('dist/client/assets/authored');
});
