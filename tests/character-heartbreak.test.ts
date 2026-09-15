import {test,expect} from 'bun:test';
import {defaultContent} from '../core/content';
import {promptFor} from '../server/prompt-catalog';
import {repairPortraits} from '../core/roster';

test('default Lemon and Komari prompts identify the love triangle without inventing former partners',()=>{
 for(const id of ['lemon','komari'])expect(defaultContent.characters.find(ch=>ch.id===id)!.prompt).toBe('i18n:character.'+id);
 const lemon=promptFor('zh-Hant','character.lemon'),komari=promptFor('zh-Hant','character.komari');
 expect(lemon).toContain('綾野光希');expect(lemon).toContain('朝雲千早');expect(lemon).toContain('不是光希和你交往');
 expect(komari).toContain('玉木慎太郎');expect(komari).toContain('月之木古都');expect(komari).toContain('你的感情沒有成為雙向戀情');
 for(const language of ['ja','en'] as const)for(const id of ['lemon','komari'])expect(promptFor(language,'character.'+id)).toContain(language==='ja'?'元彼':'ex-boyfriend');
 const legacy=structuredClone(defaultContent);legacy.characters.find(ch=>ch.id==='lemon')!.prompt='i18n:character.default';legacy.characters.find(ch=>ch.id==='komari')!.prompt='我的自訂設定';
 const upgraded=repairPortraits(legacy);expect(upgraded.characters.find(ch=>ch.id==='lemon')!.prompt).toBe('i18n:character.lemon');expect(upgraded.characters.find(ch=>ch.id==='komari')!.prompt).toBe('我的自訂設定');
});
