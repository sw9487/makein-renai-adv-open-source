import {test,expect} from 'bun:test';
import {lineMessage} from '../core/line';
import {lineReadBaseline} from '../core/line-inbox';
import {createGame,act} from '../core/engine';
import {defaultContent} from '../core/content';
test('contact exchange creates a system notice and legacy notices render consistently',()=>{
 const s=act(createGame(defaultContent),defaultContent,{type:'choose',index:0});s.affection[s.character]=10;s.contacts=s.contacts.filter(id=>id!==s.character);
 const result=act(s,defaultContent,{type:'contact'});const name=defaultContent.characters.find(ch=>ch.id===s.character)!.name;
 expect(result.messages[s.character].at(-1)).toMatchObject({from:'system',text:`您與 ${name} 成為了朋友`});
 expect(lineMessage({from:s.character,text:'加到了。以後也可以在這裡聯絡。 &#x20;',date:s.date},s.character,name).from).toBe('system');
 expect(lineMessage({from:s.character,text:'今天好嗎？',date:s.date},s.character,name).from).toBe(s.character);
});

test('new-story LINE baseline acknowledges only messages already present in the fresh run',()=>{
 const s=createGame(defaultContent);
 s.messages={
  kaju:[{id:'incoming-1',from:'kaju',text:'早安',date:s.date},{id:'sent-1',from:'player',text:'早安',date:s.date}],
  anna:[{id:'system-1',from:'system',text:'成為朋友',date:s.date}],
 };
 expect(lineReadBaseline(s.messages)).toEqual({kaju:'incoming-1'});
});
