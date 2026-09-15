import {test,expect} from 'bun:test';
import {parseCharacterReply} from '../server/character-tool';
const parse=(speech:string,narration:string,thought:string|null=null)=>parseCharacterReply({choices:[{message:{tool_calls:[{function:{name:'present_character_reply',arguments:JSON.stringify({needs_narration:narration!=='',needs_thought:thought!==null,speech,narration,thought,affectionDelta:0})}}]}}]});
test('narration cannot speak as character; dialogue and inner thoughts can use first person',()=>{
 expect(()=>parse('你好','我走近你。')).toThrow('第一人稱');
 expect(()=>parse('你好','「她走近你。」')).toThrow();
 expect(()=>parse('好喔。（拍拍你的背）','她微笑。')).toThrow('動作');
 expect(parse('我有在聽。','佳樹抬起頭，望向你。','我有點放心。')).toEqual({speech:'我有在聽。',narration:'佳樹抬起頭，望向你。',thought:'我有點放心。',affectionDelta:0});
});