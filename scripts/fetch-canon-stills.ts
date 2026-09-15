import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const dir=join(import.meta.dir,'../content/assets/cg');
mkdirSync(dir,{recursive:true});
const results=[];
const selected:Record<number,number>={2:3,5:3,10:1};
for(let episode=2;episode<=11;episode++){
  const page=`https://makeine-anime.com/story/?id=ep${String(episode).padStart(2,'0')}`;
  const response=await fetch(page);if(!response.ok)throw Error(`Page ${episode}: ${response.status}`);
  const html=await response.text();
  const matches=[...html.matchAll(/<img src="(SYS\/CONTENTS\/[^" ]+)"/g)];
  if(!matches.length)throw Error(`No stills for ${episode}`);
  const source=new URL(matches[selected[episode]??0][1],'https://makeine-anime.com/story/').href;
  const image=await fetch(source);if(!image.ok)throw Error(`Image ${episode}: ${image.status}`);
  const bytes=new Uint8Array(await image.arrayBuffer());
  const ext=bytes[0]===0x89?'png':bytes[0]===0xff?'jpg':null;
  if(!ext)throw Error('Unexpected image format');
  const name=`00000000-0000-4000-8000-000000000${300+episode}.${ext}`;
  writeFileSync(join(dir,name),bytes);
  results.push({episode,page,source,url:'/assets/authored/cg/'+name,candidates:matches.map(m=>new URL(m[1],'https://makeine-anime.com/story/').href)});
}
writeFileSync(join(import.meta.dir,'../content/canon-stills.json'),JSON.stringify(results,null,2)+'\n');
console.log(`Saved ${results.length} official episode stills.`);
