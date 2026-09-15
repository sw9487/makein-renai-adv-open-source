import {test,expect} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultContent} from '../core/content';
import {createGame} from '../core/engine';
import {converse} from '../server/chat';
import {initializeRuntime} from '../server/runtime';

test('a character can turn a conflict in talk or LINE into an in-character Twitter post',async()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'social-bridge-')),port:19520,env:{AI_API_URL:'https://example.com/v1',AI_API_KEY:'test',AI_MODEL:'test'}}),original=globalThis.fetch;
 try{
  globalThis.fetch=(async()=>Response.json({choices:[{message:{tool_calls:[{function:{name:'present_character_reply',arguments:JSON.stringify({memoryFacts:[],needs_narration:false,needs_thought:false,speech:'今は少し頭を冷やしたい。',narration:'',thought:null,affectionDelta:-1,twitterPost:'言葉にしないと伝わらない。でも今は少しだけ時間がほしい。'})}}]}}]})) as unknown as typeof fetch;
  const s=createGame(defaultContent);s.character='anna';s.met.push('anna');delete s.dialogue.choices;
  const result=await converse(s,defaultContent,'anna','どうして分かってくれないんだ。','talk');
  expect(Object.values(result.state.twitter!.posts)).toContainEqual(expect.objectContaining({author:'anna',text:'言葉にしないと伝わらない。でも今は少しだけ時間がほしい。'}));
 }finally{globalThis.fetch=original;close();}
});
