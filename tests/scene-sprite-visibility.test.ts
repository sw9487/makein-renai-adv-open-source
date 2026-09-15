import {expect,test} from 'bun:test';
import {sceneShowsSprite} from '../web/components/game';

test('generated story CG hides the separate character sprite',()=>{
  expect(sceneShowsSprite('/api/media/generated-scene.png')).toBe(false);
  expect(sceneShowsSprite('/assets/authored/cg/story.png')).toBe(true);
  expect(sceneShowsSprite()).toBe(true);
});
