import {test,expect} from 'bun:test';
import {parseCharacterReply} from '../server/character-tool';

const reply=(value:object)=>({choices:[{message:{tool_calls:[{function:{name:'present_character_reply',arguments:JSON.stringify(value)}}]}}]});

test('decision fields control narration and thought',()=>{
  // LLM decides needs_narration=true → narration filled → accepted
  const r=parseCharacterReply(reply({
    needs_narration:true,needs_thought:false,
    speech:'「謝謝你幫我。」',narration:'她低下頭，手指輕絞著裙襬。',thought:null,affectionDelta:1
  }));
  expect(r).toEqual({speech:'「謝謝你幫我。」',narration:'她低下頭，手指輕絞著裙襬。',thought:null,affectionDelta:1});
});

test('LLM can decide no narration or thought needed',()=>{
  const r=parseCharacterReply(reply({
    needs_narration:false,needs_thought:false,
    speech:'「嗯，我會在意的。」',narration:'',thought:null,affectionDelta:0
  }));
  expect(r).toEqual({speech:'「嗯，我會在意的。」',narration:'',thought:null,affectionDelta:0});
});

test('needs_narration=true with empty narration is rejected',()=>{
  expect(()=>parseCharacterReply(reply({
    needs_narration:true,needs_thought:false,
    speech:'「嗯。」',narration:'',thought:null,affectionDelta:0
  }))).toThrow('宣告需要動作');
});

test('needs_narration=false with narration content is rejected',()=>{
  expect(()=>parseCharacterReply(reply({
    needs_narration:false,needs_thought:false,
    speech:'「嗯。」',narration:'她點點頭。',thought:null,affectionDelta:0
  }))).toThrow('宣告不需要動作');
});

test('needs_thought=true with null thought is rejected',()=>{
  expect(()=>parseCharacterReply(reply({
    needs_narration:false,needs_thought:true,
    speech:'「嗯。」',narration:'',thought:null,affectionDelta:0
  }))).toThrow('宣告需要心聲');
});

test('needs_thought=false with thought content is rejected',()=>{
  expect(()=>parseCharacterReply(reply({
    needs_narration:false,needs_thought:false,
    speech:'「嗯。」',narration:'',thought:'他其實不知道',affectionDelta:0
  }))).toThrow('宣告不需要心聲');
});

test('LINE always strips narration and thought regardless of decision',()=>{
  const r=parseCharacterReply(reply({
    needs_narration:true,needs_thought:true,
    speech:'「嗯，收到。」',narration:'她點點頭。',thought:'他真好',affectionDelta:0
  }),true);
  expect(r).toEqual({speech:'「嗯，收到。」',narration:'',thought:null,affectionDelta:0});
});

test('plain text fallback works without decision fields',()=>{
  const r=parseCharacterReply({choices:[{message:{content:'她說：「好喔。」'}}]});
  expect(r.speech).toBe('她說：「好喔。」');
  expect(r.narration).toBe('');
  expect(r.thought).toBe(null);
});