import {test,expect} from 'bun:test';
import {createGame} from '../core/engine';
import {defaultContent} from '../core/content';
import {sharedPrevious,characterContext,visibleScene} from '../server/character-context';
import {sceneTimePrompt} from '../server/scene-context';

test('a different character receives neither previous location nor private conversation',()=>{
 const s=createGame(defaultContent);s.character='komari';s.location='private-bookstore';
 s.dialogue={speaker:'Komari',text:'private conversation'};
 expect(sharedPrevious(s,defaultContent,'kaju')).toBeUndefined();
 expect(visibleScene(s,'kaju')).toBeUndefined();
 expect(characterContext(s,defaultContent,'kaju')).not.toHaveProperty('place');
 expect(sceneTimePrompt(s,defaultContent,false)).not.toContain('private-bookstore');
 expect(sharedPrevious(s,defaultContent,'komari')?.dialogue).toHaveProperty('text','private conversation');
});
test('shared scene excludes unspoken thoughts and unchosen options',()=>{
 const s=createGame(defaultContent);s.character='kaju';
 s.dialogue={speaker:'Kaju',text:'aggregate secret',thought:'private thought',script:[{kind:'speech',speaker:'Kaju',text:'spoken aloud'},{kind:'thought',speaker:'Kaju',text:'private thought'}],choices:[{text:'unchosen action',delta:1,reply:'not happened'}]};
 const data=JSON.stringify(sharedPrevious(s,defaultContent,'kaju'));
 expect(data).toContain('spoken aloud');expect(data).not.toContain('private thought');expect(data).not.toContain('aggregate secret');expect(data).not.toContain('unchosen action');
});
