import {test,expect} from 'bun:test';
import {defaultContent} from '../core/content';
import {createGame,tick,act} from '../core/engine';
import {characterAvailable} from '../core/timeline';

test('weekday encounter uses a 75% roll and keeps the conversation in school time',()=>{
  for(const seed of [0,1800]){
    const s=createGame(defaultContent,seed);
    s.date='2026-09-06';s.phase=2;s.seed=seed;
    tick(s,defaultContent);
    expect(s.phase).toBe(0);
    expect(s.location).toBe('classroom');
    if(seed===0){
      expect(s.dialogue.choices?.length).toBe(3);
      const ch=defaultContent.characters.find(c=>c.id===s.character)!;
      expect(ch.id).not.toBe('kazuhiko');
      expect(characterAvailable(ch,s,defaultContent,true)).toBe(true);
      const reply=act(s,defaultContent,{type:'choose',index:0});
      expect(reply.phase).toBe(0);
      expect(act(reply,defaultContent,{type:'advance'}).dialogue.text).toContain('下課鐘響了');
    }else expect(s.dialogue.choices).toBeUndefined();
  }
});

test('weekends do not generate classroom encounters',()=>{
  const s=createGame(defaultContent,0);s.date='2026-09-04';s.phase=2;
  tick(s,defaultContent);
  expect(s.location).toBe('home');
  expect(s.dialogue.choices).toBeUndefined();
});
