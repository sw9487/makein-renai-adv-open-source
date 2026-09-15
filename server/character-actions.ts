import type {Content,GameState} from '../core/types';
import type {CharacterAction,CharacterReply} from './character-tool';
import {socialAppEnabled} from '../core/social-apps';
import {prompt} from './prompt';
import {appendCharacterLine,applyCharacterTwitterFollow,publishCharacterTwitterPost} from './twitter';
import {requestImage} from './stable-diffusion';

/** Execute the character's independently validated tool intents in declared order.
 * The caller owns a cloned game state, so a failing step discards the entire turn. */
export async function executeCharacterActions(s:GameState,c:Content,actor:string,reply:Pick<CharacterReply,'actions'|'twitterPost'>,signal?:AbortSignal){
 const actions:CharacterAction[]=[...(reply.actions??[])];
 // Keep the older one-post field working for models/saves that still return it.
 if(reply.twitterPost&&!actions.some(action=>action.kind==='twitter_post'))actions.push({kind:'twitter_post',target:'',text:reply.twitterPost,image:false});
 if(actions.length>4)throw Error(prompt('error.characterActions'));
 for(const action of actions){
  if(action.kind==='line_message'){
   if(!socialAppEnabled(s,'line')||!s.contacts.includes(actor)||action.target!=='kazuhiko')throw Error(prompt('error.characterActions'));
   const generated=action.image?await requestImage(s,c,'line',action.text,actor,signal,undefined,{allowCharacterlessLine:true,proactiveLine:true}):{};
   appendCharacterLine(s,c,actor,action.text,generated);
   continue;
  }
  if(!socialAppEnabled(s,'twitter'))throw Error(prompt('error.characterActions'));
  if(action.kind==='twitter_post'){
   const generated=action.image?await requestImage(s,c,'line',action.text,actor,signal,undefined,{allowCharacterlessLine:true,proactiveLine:true}):{};
   if(!publishCharacterTwitterPost(s,c,actor,action.text,generated))throw Error(prompt('error.characterActions'));
   continue;
  }
  applyCharacterTwitterFollow(s,c,actor,action.target,action.kind==='twitter_unfollow');
 }
}
