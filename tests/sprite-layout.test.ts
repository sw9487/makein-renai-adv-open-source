import {expect,test} from 'bun:test';
import {fitSprite,fitSpriteOnReference,type SpriteBounds} from '../core/sprite-layout';

function headPoint(rect:ReturnType<typeof fitSprite>,bounds:SpriteBounds){
 return {
  x:rect.left+(bounds.headX??bounds.x+bounds.width/2)*rect.width/bounds.imageWidth,
  y:rect.top+bounds.y*rect.height/bounds.imageHeight,
 };
}

test('portraits with different canvas dimensions and transparent padding share visible size and anchor',()=>{
 const normal:SpriteBounds={x:50,y:130,width:250,height:1000,imageWidth:386,imageHeight:1135};
 const shy:SpriteBounds={x:90,y:40,width:510,height:2090,imageWidth:731,imageHeight:2149};
 for(const bounds of [normal,shy]){
  const rect=fitSprite(bounds,900,700);
  const scale=rect.height/bounds.imageHeight;
  expect(rect.top+bounds.y*scale).toBeCloseTo(0);
  expect(rect.top+(bounds.y+bounds.height)*scale).toBeCloseTo(700);
  expect(rect.left+(bounds.x+bounds.width/2)*scale).toBeCloseTo(450);
 }
});

test('wide portraits remain inside the available sprite stage',()=>{
 const bounds:SpriteBounds={x:10,y:30,width:1800,height:900,imageWidth:1850,imageHeight:1000};
 const rect=fitSprite(bounds,600,700),scale=rect.height/bounds.imageHeight;
 expect(Math.round(bounds.width*scale)).toBe(600);
 expect(Math.round(rect.top+(bounds.y+bounds.height)*scale)).toBe(700);
});

test('conversation framing keeps a character equally tall across expressions',()=>{
 const normal:SpriteBounds={x:50,y:130,width:250,height:1000,imageWidth:386,imageHeight:1135};
 const shy:SpriteBounds={x:90,y:40,width:510,height:2090,imageWidth:731,imageHeight:2149};
 const ratio=normal.height/normal.imageHeight;
 for(const bounds of [normal,shy]){
  const rect=fitSprite(bounds,900,700,'conversation',ratio);
  const scale=rect.height/bounds.imageHeight;
  expect(rect.top+(bounds.y+bounds.height)*scale).toBeCloseTo(700*(1.9-0.17));
  expect(bounds.height*scale).toBeCloseTo(700*1.9*ratio);
  expect(rect.left+(bounds.x+bounds.width/2)*scale).toBeCloseTo(450);
 }
});

test('shorter original portraits stay shorter while their low framing moves up without clipping tall heads',()=>{
 const tall:SpriteBounds={x:18,y:0,width:331,height:1134,imageWidth:386,imageHeight:1135};
 const short:SpriteBounds={x:0,y:230,width:386,height:904,imageWidth:386,imageHeight:1135};
 const tallRect=fitSprite(tall,900,700,'conversation',tall.height/tall.imageHeight);
 const shortRect=fitSprite(short,900,700,'conversation',short.height/short.imageHeight);
 const tallScale=tallRect.height/tall.imageHeight,shortScale=shortRect.height/short.imageHeight;
 const tallHead=tallRect.top+tall.y*tallScale,shortHead=shortRect.top+short.y*shortScale;
 expect(shortHead).toBeGreaterThan(tallHead+120);
 expect(tallHead).toBeGreaterThanOrEqual(-1);
 expect(tallRect.top+(tall.y+tall.height)*tallScale).toBeGreaterThan(700*1.9-5);
 expect(shortRect.top+(short.y+short.height)*shortScale).toBeCloseTo(700*(1.9-0.17));
});

test('expression sheets keep their heads aligned with the original despite different alpha padding',()=>{
 const normal:SpriteBounds={x:42,y:128,width:261,height:1004,imageWidth:386,imageHeight:1135,headX:172};
 const happy:SpriteBounds={x:75,y:37,width:540,height:2091,imageWidth:731,imageHeight:2151,headX:365};
 const sad:SpriteBounds={x:99,y:80,width:484,height:2005,imageWidth:731,imageHeight:2149,headX:363};
 const ratio=normal.height/normal.imageHeight;
 const normalRect=fitSprite(normal,900,700,'conversation',ratio);
 const happyRect=fitSpriteOnReference(happy,happy,900,700,ratio,normal);
 const sadRect=fitSpriteOnReference(sad,happy,900,700,ratio,normal);
 const originalHead=headPoint(normalRect,normal);
 for(const [rect,bounds] of [[happyRect,happy],[sadRect,sad]] as const){
  expect(headPoint(rect,bounds).x).toBeCloseTo(originalHead.x);
  expect(headPoint(rect,bounds).y).toBeCloseTo(originalHead.y);
 }
 // Pose changes do not independently zoom the sheet.
 expect(sadRect.width).toBeCloseTo(happyRect.width,0);
 expect(sadRect.height).toBeCloseTo(happyRect.height);
});

test('old and normalized PNG sizes cannot change one character expression display size',()=>{
 const normal:SpriteBounds={x:42,y:128,width:261,height:1004,imageWidth:386,imageHeight:1135,headX:172};
 const normalized:SpriteBounds={x:39,y:19,width:286,height:1104,imageWidth:386,imageHeight:1135,headX:192.5};
 const cachedOld:SpriteBounds={x:75,y:37,width:540,height:2091,imageWidth:731,imageHeight:2151,headX:365};
 const ratio=normal.height/normal.imageHeight;
 const reference=fitSpriteOnReference(normalized,normalized,900,700,ratio,normal);
 const oldInNewFrame=fitSpriteOnReference(cachedOld,normalized,900,700,ratio,normal);
 expect(headPoint(oldInNewFrame,cachedOld).y).toBeCloseTo(headPoint(reference,normalized).y);
 expect(headPoint(oldInNewFrame,cachedOld).x).toBeCloseTo(headPoint(reference,normalized).x);
 expect(oldInNewFrame.height).toBeCloseTo(reference.height);
 expect(oldInNewFrame.width).toBeCloseTo(reference.width,0);
 const newInOldFrame=fitSpriteOnReference(normalized,cachedOld,900,700,ratio,normal);
 const oldReference=fitSpriteOnReference(cachedOld,cachedOld,900,700,ratio,normal);
 expect(newInOldFrame.height).toBeCloseTo(oldReference.height);
 expect(newInOldFrame.width).toBeCloseTo(oldReference.width,0);
 expect(headPoint(newInOldFrame,normalized).x).toBeCloseTo(headPoint(oldReference,cachedOld).x);
 expect(headPoint(newInOldFrame,normalized).y).toBeCloseTo(headPoint(oldReference,cachedOld).y);
});

test('an underfilled full-body expression matches the visible reference without clipping its canvas',()=>{
 const reference:SpriteBounds={x:0,y:11,width:379,height:1110,imageWidth:386,imageHeight:1135,headX:190};
 const short:SpriteBounds={x:6,y:367,width:374,height:768,imageWidth:386,imageHeight:1135,headX:195};
 const normal:SpriteBounds={...reference};
 const frame=fitSpriteOnReference(reference,reference,900,700,1,normal);
 const fixed=fitSpriteOnReference(short,reference,900,700,1,normal);
 expect(short.height*(fixed.height/short.imageHeight)).toBeCloseTo(reference.height*(frame.height/reference.imageHeight));
 expect(headPoint(fixed,short).y).toBeCloseTo(headPoint(frame,reference).y);
 expect(fixed.width).toBeLessThan(900);
});
