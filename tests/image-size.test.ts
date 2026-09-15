import {test,expect} from 'bun:test';
import {imageDimensions} from '../core/image-size';
test('presets generate exact landscape story and portrait LINE dimensions',()=>{
 for(const [preset,width,height] of [['large',3840,2160],['medium',1920,1080],['small',768,512]] as const){
  expect(imageDimensions(preset)).toEqual({width,height});
  expect(imageDimensions(preset,true)).toEqual({width:height,height:width});
 }
});
