import {test,expect} from 'bun:test';
import {partialReply,streamCharacter} from '../server/character-stream';
import {readSSE} from '../core/sse';
test('SSE handles split UTF8, CRLF and multiple frames',async()=>{
 const bytes=new TextEncoder().encode('event: delta\r\ndata: 中文\r\n\r\ndata: [DONE]\n\n');
 const stream=new ReadableStream<Uint8Array>({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}});
 const frames=[];for await(const f of readSSE(stream))frames.push(f);
 expect(frames).toEqual([{event:'delta',data:'中文'},{event:'message',data:'[DONE]'}]);
});
test('partial tool fields decode escapes without mixing narration or thoughts into speech',()=>{
 expect(partialReply('{"speech":"你好\\n世')).toEqual({speech:'你好\n世',narration:'',thought:null});
 expect(partialReply('{"speech":"你好\\u4')).toEqual({speech:'你好',narration:'',thought:null});
 expect(partialReply('{"speech":"你好","narration":"動作","thought":"內心"}',true)).toEqual({speech:'你好',narration:'',thought:null});
});
test('stream emits partial reply before completion and rejects a truncated result',async()=>{
 const chunks=[
  {choices:[{delta:{tool_calls:[{index:0,function:{name:'present_character_reply',arguments:'{"speech":"你好'}}]}}]},
  {choices:[{delta:{tool_calls:[{index:0,function:{arguments:'，謝謝","narration":"點頭","thought":null}'}}]},finish_reason:'tool_calls'}]},
 ];
 const response=(complete:boolean)=>new Response(chunks.slice(0,complete?2:1).map(c=>'data: '+JSON.stringify(c)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
 const seen:any[]=[];const result=await streamCharacter(response(true),false,r=>seen.push(r));
 expect(seen[0].speech).toBe('你好');expect(result.speech).toBe('你好，謝謝');expect(result.narration).toBe('點頭');
 await expect(streamCharacter(response(false),false,()=>{})).rejects.toThrow('中斷');
});
test('stream accepts plain content when the model skips tool calling',async()=>{
 const data='data: '+JSON.stringify({choices:[{delta:{content:'她說：「今晚一起吃飯嗎？」'}}]})+'\n\n'+'data: [DONE]\n\n';
 const body=new Response(data,{headers:{'content-type':'text/event-stream'}});
 const result=await streamCharacter(body,false,()=>{});
 expect(result.speech).toBe('她說：「今晚一起吃飯嗎？」');expect(result.narration).toBe('');expect(result.thought).toBe(null);
});
test('LINE does not preview a reply before the final respond decision',async()=>{
 const args=JSON.stringify({speech:'',narration:'',thought:null,respond:false,conversationClosed:true});
 const body=new Response('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,function:{name:'present_character_reply',arguments:args}}]},finish_reason:'tool_calls'}]})+'\n\n',{headers:{'content-type':'text/event-stream'}});
 const partials:any[]=[];
 const result=await streamCharacter(body,true,reply=>partials.push(reply));
 expect(partials).toEqual([]);
 expect(result).toMatchObject({speech:'',respond:false,conversationClosed:true});
});
