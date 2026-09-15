import {test,expect} from 'bun:test';
import {defaultContent} from '../core/content';
import {createGame} from '../core/engine';
import {currentProfile} from '../core/timeline';
import {genderProfile} from '../core/character-gender';
test('character profiles provide explicit gender and honor editor overrides',()=>{
 const ch=defaultContent.characters.find(c=>c.id==='mitsuki')!;
 expect(currentProfile(ch,createGame(defaultContent),defaultContent)).toMatchObject({gender:'male',pronoun:'他'});
 expect(genderProfile({...ch,gender:'female'}).pronoun).toBe('她');
 expect(genderProfile({...ch,id:'custom',gender:undefined}).pronoun).toBe('對方');
 expect(genderProfile({...ch,gender:'unspecified'}).pronoun).toBe('對方');
});
