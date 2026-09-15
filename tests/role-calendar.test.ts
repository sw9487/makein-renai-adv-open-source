import {test,expect} from 'bun:test';
import {defaultContent as c} from '../core/content';
import {createGame} from '../core/engine';
import {stageDate,schoolLabel,roleLabel,characterAvailable} from '../core/timeline';
import {validateContent} from '../server/validation';
const ch=(id:string)=>c.characters.find(x=>x.id===id)!;
const at=(date:string)=>({...createGame(c),date});
test('academic dates are anchored to Kazuhiko, including January–March and shifted start years',()=>{
 expect(stageDate('2026-07-13',{year:1,month:2})).toBe('2027-02-01');
 expect(stageDate('2027-02-13',{year:2,month:4,day:8})).toBe('2027-04-08');
 expect(schoolLabel(ch('tamaki'),at('2026-10-01'),c)).toContain('3年級');
 expect(schoolLabel(ch('shikiya'),at('2026-10-01'),c)).toContain('2年級');
 expect(schoolLabel(ch('kaju'),at('2027-02-01'),c)).toContain('桃園中學2年級');
 expect(roleLabel(ch('kaju'),at('2027-02-01'),c)).toContain('副會長');
 expect(schoolLabel(ch('riko'),at('2027-04-01'),c)).toContain('石蕗高中1年級');
});
test('graduation removes school access and school office before April promotion',()=>{
 for(const id of ['tamaki','koto']){
  expect(characterAvailable(ch(id),at('2027-02-28'),c,true)).toBe(true);
  expect(characterAvailable(ch(id),at('2027-03-01'),c,true)).toBe(false);
  expect(schoolLabel(ch(id),at('2027-03-01'),c)).toContain('已畢業');
 }
 expect(roleLabel(ch('kaju'),at('2028-03-01'),c)).not.toContain('副會長');
 for(const id of ['shikiya','hibari'])expect(characterAvailable(ch(id),at('2028-03-01'),c,true)).toBe(false);
});
test('all 21 profiles have dated roles; invalid calendar day is rejected and valid day retained',()=>{
 expect(c.characters.length).toBe(21);
 const grades:Record<string,number>={kazuhiko:1,anna:1,lemon:1,komari:1,kaju:2,tamaki:3,koto:3,sosuke:1,karen:1,mitsuki:1,chihaya:1,amanatsu:0,konuki:0,shikiya:2,asami:2,hibari:2,tiara:1,hiroto:1,riko:0,satoshi:2,koharu:1};
 for(const character of c.characters){
  expect(character.timeline!.baseGrade).toBe(grades[character.id]);
  expect(character.roles!.length).toBeGreaterThan(0);
  for(const year of [1,2,3])expect(schoolLabel(character,at(stageDate(c.settings.startDate,{year,month:4})),c)).not.toContain('undefined');
 }
 const copy=structuredClone(c);copy.characters[0].roles![0].day=31;copy.characters[0].roles![0].month=2;
 expect(()=>validateContent(copy)).toThrow();
 copy.characters[0].roles![0].day=8;
 expect(validateContent(copy).characters[0].roles![0].day).toBe(8);
});
