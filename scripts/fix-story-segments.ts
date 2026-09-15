import { writeFileSync } from 'node:fs';
import type {Content,StoryLine} from '../core/types';
const path=new URL('../content/game.json',import.meta.url);
const c:Content=await Bun.file(path).json();
const patchPath=new URL('../content/story-upgrade.json',import.meta.url);
const patches=await Bun.file(patchPath).json();
for(const e of c.events){
 if(e.id==='anna-first') continue;
 const paragraphs=e.text.split('\n\n');
 if(paragraphs.length!==3) continue;
 const lines:StoryLine[]=[{kind:'narration',text:paragraphs[0]}];
 for(const segment of paragraphs[1].split(/(「[^」]+」)/g).filter(Boolean)) lines.push(segment.startsWith('「')?{kind:'speech',speaker:c.characters.find(ch=>ch.id===e.character)!.name,text:segment.slice(1,-1)}:{kind:'narration',text:segment});
 lines.push({kind:'narration',text:paragraphs[2]});e.script=lines;
 const p=patches.find((p:{id:string})=>p.id===e.id);if(p)p.script=lines;
}
writeFileSync(path,JSON.stringify(c,null,2)+'\n');
writeFileSync(patchPath,JSON.stringify(patches,null,2)+'\n');
