import type {Dialogue, StoryLine} from './types';
import {cleanToolText} from './tool-text';

export function dialogueLines(dialogue:Dialogue):StoryLine[] {
  if(dialogue.script?.length)return dialogue.script.map(line=>line.kind==='speech'?{...line,text:cleanToolText(line.text)}:line);
  const lines:StoryLine[]=[];
  if(dialogue.narration)lines.push({kind:'narration',text:dialogue.narration});
  if(dialogue.text)lines.push({kind:dialogue.kind==='chat'||dialogue.narration!==undefined?'speech':'narration',speaker:dialogue.speaker,text:cleanToolText(dialogue.text)});
  if(dialogue.thought)lines.push({kind:'thought',speaker:dialogue.speaker,text:dialogue.thought});
  return lines;
}

export function appendConversation(dialogue:Dialogue,player:string,speaker:string,text:string,reply:{speech:string;narration:string;thought:string|null;expression?:string},action?:string):StoryLine[] {
  const lines=[...dialogueLines(dialogue)];
  if(action)lines.push({kind:'narration',text:action});
  if(text)lines.push({kind:'speech' as const,speaker:player,text});
  if(reply.narration)lines.push({kind:'narration',text:reply.narration});
  lines.push({kind:'speech',speaker,text:reply.speech,...(reply.expression?{expression:reply.expression}:{})});
  if(reply.thought)lines.push({kind:'thought',speaker,text:reply.thought});
  // Keep the active scene bounded. Older dialogue remains in the game's log.
  return lines.slice(-100);
}
