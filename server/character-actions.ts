import type {Content,GameState} from '../core/types';
import type {CharacterAction,CharacterReply} from './character-tool';
import {socialAppEnabled} from '../core/social-apps';
import {prompt} from './prompt';
import {appendCharacterLine,applyCharacterTwitterFollow,publishCharacterTwitterPost} from './twitter';

/** Execute the character's independently validated tool intents in declared order.
 * The caller owns a cloned game state, so a failing step discards the entire turn. */
export function executeCharacterActions(s:GameState,c:Content,actor:string,reply:Pick<CharacterReply,'actions'|'twitterPost'>){
 const actions:CharacterAction[]=[...(reply.actions??[])];
 // Keep the older one-post field working for models/saves that still return it.
 if(reply.twitterPost&&!actions.some(action=>action.kind==='twitter_post'))actions.push({kind:'twitter_post',target:'',text:reply.twitterPost});
 if(actions.length>4)throw Error(prompt('error.characterActions'));
 for(const action of actions){
  if(action.kind==='line_message'){
   if(!socialAppEnabled(s,'line')||!s.contacts.includes(actor)||action.target!=='kazuhiko')throw Error(prompt('error.characterActions'));
   appendCharacterLine(s,c,actor,action.text);
   continue;
  }
  if(!socialAppEnabled(s,'twitter'))throw Error(prompt('error.characterActions'));
  if(action.kind==='twitter_post'){
   if(!publishCharacterTwitterPost(s,c,actor,action.text))throw Error(prompt('error.characterActions'));
   continue;
  }
  applyCharacterTwitterFollow(s,c,actor,action.target,action.kind==='twitter_unfollow');
 }
}
