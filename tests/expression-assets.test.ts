import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {basename,join} from 'node:path';

const assets=join(import.meta.dir,'..','content','assets');
const content=JSON.parse(readFileSync(join(import.meta.dir,'..','content','game.json'),'utf8'));
const addedExpressions=['awkward','flustered','flushed','smug','inviting','excited','disdainful','troubled','dazed','faint','breakdown'];

function dimensions(file:string):[number,number]{
 const bytes=readFileSync(file);
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
  return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 // One bundled normal portrait has a JPEG payload despite its .png suffix.
 if(bytes[0]===0xff&&bytes[1]===0xd8){
  let offset=2;
  while(offset<bytes.length-9){
   if(bytes[offset++]!==0xff)continue;
   while(bytes[offset]===0xff)offset++;
   const marker=bytes[offset++];
   if(marker===0xd9||marker===0xda)break;
   if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
   const length=bytes.readUInt16BE(offset);
   if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))
    return [bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];
   offset+=length;
  }
 }
 throw new Error(`Unsupported portrait format: ${file}`);
}

test('every bundled expression PNG uses its own character normal portrait canvas',()=>{
 let checked=0;
 for(const character of content.characters){
  const normal=dimensions(join(assets,character.sprites.normal.slice('/assets/authored/'.length)));
  for(const [expression,url] of Object.entries<string>(character.sprites)){
   if(expression==='normal'||!url)continue;
   const name=basename(url);
   if(!name.startsWith(`${character.id}-`)||!name.endsWith('-expression.png'))continue;
   const file=join(assets,url.slice('/assets/authored/'.length));
   expect(dimensions(file)).toEqual(normal);
   expect(readFileSync(file)[25]).toBe(6); // RGBA, not a flattened background
   checked++;
  }
 }
 expect(checked).toBeGreaterThan(0);
});

test('every character ships every added expression as a transparent PNG',()=>{
 for(const character of content.characters){
  for(const key of addedExpressions){
   const url=character.sprites[key];
   expect(url).toBe(`/assets/authored/sprites/${character.id}/${character.id}-${key}-expression.png`);
   const bytes=readFileSync(join(assets,url.slice('/assets/authored/'.length)));
   expect(bytes[25]).toBe(6);
   expect(dimensions(join(assets,url.slice('/assets/authored/'.length)))).toEqual(dimensions(join(assets,character.sprites.normal.slice('/assets/authored/'.length))));
  }
 }
});
