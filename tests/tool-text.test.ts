import {expect,test} from 'bun:test';
import {cleanToolText} from '../core/tool-text';
import {parseCharacterReply} from '../server/character-tool';
import {partialReply} from '../server/character-stream';
import {dialogueLines} from '../core/dialogue';
import {memoryText} from '../core/engine';
const leaked='記得也跟我分享一下。","narration":"", "thought":null}';
const envelope=(speech:string)=>({choices:[{message:{tool_calls:[{function:{name:'present_character_reply',arguments:JSON.stringify({speech,narration:'',thought:null})}}]}}]});

test('embedded empty tool tails are removed before saving and when displaying older scenes',()=>{
 expect(parseCharacterReply(envelope(leaked)).speech).toBe('記得也跟我分享一下。');
 expect(dialogueLines({speaker:'綾野光希',kind:'chat',text:leaked})[0].text).toBe('記得也跟我分享一下。');
 expect(dialogueLines({speaker:'綾野光希',text:leaked,script:[{kind:'speech',speaker:'綾野光希',text:leaked}]})[0].text).toBe('記得也跟我分享一下。');
 expect(partialReply(JSON.stringify({speech:leaked,narration:'',thought:null})).speech).toBe('記得也跟我分享一下。');
});
test('legacy JSON memory rows are converted to plain prose before reaching the model',()=>{
 expect(memoryText('{"speech":"今天好冷。","narration":"她呵了一口白煙。"}')).toBe('今天好冷。\n（旁白：她呵了一口白煙。）');
 expect(memoryText('{"speech":"","narration":"她點點頭。"}')).toBe('（旁白：她點點頭。）');
 expect(memoryText('{"scene":[{"kind":"speech","speaker":"杏菜","text":"吃飯了喔。"},{"kind":"narration","text":"她端來兩碗飯。"}]}')).toBe('杏菜：「吃飯了喔。」\n\n她端來兩碗飯。');
 expect(memoryText('已經是純文字。')).toBe('已經是純文字。');
});
test('unknown embedded tool objects are rejected rather than displayed as speech',()=>{
 expect(()=>parseCharacterReply(envelope('好啊。"narration":"她點頭"'))).toThrow();
 expect(parseCharacterReply(envelope('他說「好啊」，我就答應了。')).speech).toBe('他說「好啊」，我就答應了。');
});

test('expression labels in older speech are display-cleaned, never interpreted as dialogue',()=>{
 expect(cleanToolText('（表情：normal）所以……你剛才沒有笑我吧？')).toBe('所以……你剛才沒有笑我吧？');
 expect(cleanToolText('「（表情：shy）我就知道了。」')).toBe('我就知道了。');
 expect(cleanToolText('(expression: angry) Please stop.')).toBe('Please stop.');
 expect(cleanToolText('今天聊到表情：normal，真有趣。')).toBe('今天聊到表情：normal，真有趣。');
 const reply=parseCharacterReply({choices:[{message:{tool_calls:[{function:{name:'present_character_reply',arguments:JSON.stringify({speech:'（表情：shy）真的？',narration:'',thought:null,expression:'happy'})}}]}}]});
 expect(reply.speech).toBe('真的？');
 expect(reply.expression).toBe('happy');
});
