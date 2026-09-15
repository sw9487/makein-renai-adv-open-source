import { test, expect } from 'bun:test';
import { defaultContent } from '../core/content';
import { createGame, weightedPick, eventEligible, getEnding } from '../core/engine';
import { characterAvailable, schoolLabel } from '../core/timeline';
import { upgradeRoster } from '../core/roster';
import { repairPortraits } from '../core/roster';
import { validateContent } from '../server/validation';
import urls from '../content/portrait-urls.json';

test('roster has 21 distinct people and the six requested romance routes',()=>{
  expect(new Set(defaultContent.characters.map(c=>c.id)).size).toBe(21);
  expect(defaultContent.characters.filter(c=>c.romance).map(c=>c.id).sort()).toEqual(['anna','kaju','komari','lemon','riko','tiara']);
  expect(defaultContent.characters.find(c=>c.id==='tamaki')!.sprites.normal).toBe(urls['https://makeine-anime.com/assets/img/character/img_main07.png']);
  expect(defaultContent.characters.find(c=>c.id==='koto')!.sprites.normal).toBe(urls['https://makeine-anime.com/assets/img/character/img_main06.png']);
  expect(defaultContent.characters.find(c=>c.id==='tamaki')!.avatar).toBe(urls['https://makeine-anime.com/assets/img/character/thumb_chara06_on.png']);
  expect(defaultContent.characters.find(c=>c.id==='koto')!.avatar).toBe(urls['https://makeine-anime.com/assets/img/character/thumb_chara07_on.png']);
});
test('portrait repair corrects already-migrated content and preserves custom replacements',()=>{
  const c=structuredClone(defaultContent),ch=c.characters.find(ch=>ch.id==='tamaki')!;
  ch.avatar='https://makeine-anime.com/assets/img/character/thumb_chara07_on.png';
  expect(repairPortraits(c).characters.find(ch=>ch.id==='tamaki')!.avatar).toBe(urls['https://makeine-anime.com/assets/img/character/thumb_chara06_on.png']);
  ch.avatar='https://example.com/custom.png';
  expect(repairPortraits(c).characters.find(ch=>ch.id==='tamaki')!.avatar).toBe(ch.avatar);
  for(const id of ['hiroto','riko','satoshi','koharu']) {
    const character=c.characters.find(ch=>ch.id===id)!;
    expect(character.sprites.normal).toStartWith('/assets/authored/');
    expect(validateContent(c).characters.find(ch=>ch.id===id)!.avatarCrop).toEqual(character.avatarCrop);
  }
});
test('Riko cannot meet, trigger events, or enroll before April of the second academic year',()=>{
  const c=defaultContent,s=createGame(c),ch=c.characters.find(c=>c.id==='riko')!;
  s.date='2027-03-31'; s.location='club';
  expect(characterAvailable(ch,s,c)).toBe(false);
  expect(weightedPick(s,c,{riko:100},true)).toBe('');
  expect(eventEligible(s,c,c.events.find(e=>e.id==='riko-first')!)).toBe(false);
  s.date='2027-04-01';
  expect(characterAvailable(ch,s,c,true)).toBe(true);
  expect(schoolLabel(ch,s,c)).toContain('1年級');
  expect(eventEligible(s,c,c.events.find(e=>e.id==='riko-first')!)).toBe(true);
});
test('winter debut is in the following calendar year; graduates and other schools are excluded',()=>{
  const c=defaultContent,s=createGame(c);
  const ch=(id:string)=>c.characters.find(c=>c.id===id)!;
  s.date='2026-12-15'; expect(characterAvailable(ch('satoshi'),s,c)).toBe(false);
  s.date='2027-02-01'; expect(characterAvailable(ch('satoshi'),s,c)).toBe(true);
  expect(characterAvailable(ch('kaju'),s,c,true)).toBe(false);
  s.date='2027-04-01'; expect(characterAvailable(ch('tamaki'),s,c,true)).toBe(false);
  expect(characterAvailable(ch('tamaki'),s,c)).toBe(true);
  expect(schoolLabel(ch('kaju'),s,c)).toContain('桃園中學3');
  s.date='2027-08-02'; expect(characterAvailable(ch('koharu'),s,c)).toBe(true);
  expect(characterAvailable(ch('koharu'),s,c,true)).toBe(false);
});
test('legacy content upgrades once, preserving edited profiles and new portable metadata',()=>{
  const c=structuredClone(defaultContent);
  c.characters=c.characters.filter(ch=>!['riko','hiroto','satoshi','koharu'].includes(ch.id));
  for(const ch of c.characters) delete ch.timeline;
  c.characters[1].prompt='自訂 prompt';
  const result=upgradeRoster(c);
  expect(result.characters[1].prompt).toBe('自訂 prompt');
  result.characters[1].timeline!.debutMonth=9;
  expect(upgradeRoster(result)).toBe(result);
  expect(validateContent(result).characters[1].timeline!.debutMonth).toBe(9);
  expect(validateContent(result).characters[1].avatar).toBe(urls['https://makeine-anime.com/assets/img/character/thumb_chara02_on.png']);
});
test('kaju romance endings work correctly with route and affection',()=>{
  const c=defaultContent,s=createGame(c);
  // love ending: high affection + trust + route
  s.route='kaju';s.affection.kaju=80;s.flags=['kaju-trust'];
  expect(getEnding(s,c).id).toBe('love:kaju');
  // bittersweet ending: route set but low affection
  s.affection.kaju=30;
  expect(getEnding(s,c).id).toBe('bittersweet:kaju');
  // kaju route takes priority over other romance route
  s.affection.kaju=80;s.affection.shikiya=100;s.flags.push('shikiya-trust');
  expect(getEnding(s,c).id).toBe('love:kaju');
});
