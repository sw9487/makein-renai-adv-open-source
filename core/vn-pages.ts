import type {Dialogue,StoryLine,GameState} from './types';
import {dialogueLines} from './dialogue';
/** Background refreshes must not restart the current scene's reading cursor. */
export function preserveReadingDialogue(previous:GameState|undefined,next:GameState):GameState {
 if(previous&&previous.date===next.date&&previous.phase===next.phase&&previous.location===next.location&&previous.character===next.character&&JSON.stringify(previous.dialogue)===JSON.stringify(next.dialogue))
  return {...next,dialogue:previous.dialogue};
 return next;
}
export function novelPages(dialogue:Dialogue,playerName:string):StoryLine[]{
 let lines=dialogueLines(dialogue);
 if(dialogue.kind==='chat'){
  if(dialogue.replyStart!==undefined&&Number.isInteger(dialogue.replyStart)&&dialogue.replyStart>=0&&dialogue.replyStart<lines.length){
   lines=lines.slice(dialogue.replyStart);
  }else{
  let last=-1;for(let i=lines.length-1;i>=0;i--)if(lines[i].kind==='speech'&&lines[i].speaker===playerName){last=i;break;}
  if(last>=0)lines=lines.slice(last+1);
  }
 }
 return lines.flatMap(line=>{
  const text=Array.from(line.text),pages:StoryLine[]=[];
  while(text.length){let end=Math.min(120,text.length);
   if(end<text.length){for(let i=end-1;i>60;i--)if(/[。！？；\n]/.test(text[i])){end=i+1;break;}}
   pages.push({...line,text:text.splice(0,end).join('')});
  }return pages;
 });
}
