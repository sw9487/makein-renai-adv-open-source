import {test,expect} from 'bun:test';
import {novelPages,preserveReadingDialogue} from '../core/vn-pages';
import {createGame} from '../core/engine';
import {defaultContent} from '../core/content';
import type {StoryLine} from '../core/types';
test('focus refresh preserves dialogue identity while applying updated progress',()=>{
 const previous=createGame(defaultContent),fresh=structuredClone(previous);
 fresh.revision++;fresh.affection.anna=42;
 const next=preserveReadingDialogue(previous,fresh);
 expect(next.dialogue).toBe(previous.dialogue);
 expect(next.affection.anna).toBe(42);expect(next.revision).toBe(fresh.revision);
 fresh.dialogue.text+='新劇情';
 expect(preserveReadingDialogue(previous,fresh).dialogue).toBe(fresh.dialogue);
 const moved=structuredClone(previous);moved.phase++;
 expect(preserveReadingDialogue(previous,moved).dialogue).toBe(moved.dialogue);
 expect(preserveReadingDialogue(undefined,fresh)).toBe(fresh);
});
test('novel pages preserve all text and speaker identity without long page overflow',()=>{
 const text='今天一起回家。'.repeat(50)+'🌸';
 const pages=novelPages({speaker:'佳樹',text,script:[{kind:'speech',speaker:'佳樹',text}]},'溫水和彥');
 expect(pages.map(p=>p.text).join('')).toBe(text);
 expect(pages.every(p=>Array.from(p.text).length<=120&&p.speaker==='佳樹')).toBe(true);
});
test('current conversation pages exclude player messages and earlier turns but preserve narration, speech and thought',()=>{
 const pages=novelPages({kind:'chat',speaker:'佳樹',text:'回覆',script:[{kind:'speech',speaker:'溫水',text:'舊訊息'},{kind:'speech',speaker:'佳樹',text:'舊回覆'},{kind:'speech',speaker:'溫水',text:'新訊息'},{kind:'narration',text:'她抬頭'},{kind:'speech',speaker:'佳樹',text:'新回覆'},{kind:'thought',speaker:'佳樹',text:'內心'}]},'溫水');
 expect(pages.map(p=>p.text)).toEqual(['她抬頭','新回覆','內心']);
});

test('explicit reply boundary preserves all reply parts after action-only turns and history trimming',()=>{
 const history:StoryLine[]=Array.from({length:110},()=>({kind:'speech',speaker:'佳樹',text:'已讀過的台詞'}));
 const complete:StoryLine[]=[...history,{kind:'narration',text:'遞出茶杯'},{kind:'narration',text:'她接過杯子'},{kind:'speech',speaker:'佳樹',text:'謝謝'},{kind:'thought',speaker:'佳樹',text:'好溫暖'}];
 const script=complete.slice(-100);
 const pages=novelPages({kind:'chat',speaker:'佳樹',text:'謝謝',script,replyStart:script.length-3},'溫水');
 expect(pages.map(p=>p.text)).toEqual(['她接過杯子','謝謝','好溫暖']);
 expect(script.some(line=>line.text==='已讀過的台詞')).toBe(true);
});
