import {random} from '../core/engine';
import type {GameState} from '../core/types';
import {characterTool,choiceTool,type CharacterReply} from './character-tool';
import {prompt} from './prompt';

export function detailPolicy(s:GameState,id:string,turn:number,line:boolean){
 const eligible=(kind:string,gap:number)=>turn-Number(s.flags.find(f=>f.startsWith(`detail:${id}:${kind}:`))?.split(':').at(-1)??-100)>=gap;
 return {narration:!line&&eligible('narration',2)&&random(s)<0.7,thought:!line&&eligible('thought',5)&&random(s)<0.3};
}
export function detailTool(choices:boolean,policy:{narration:boolean;thought:boolean}){
 const tool=structuredClone(choices?choiceTool:characterTool);
 const props=tool.function.parameters.properties;
 if(!policy.narration)Object.assign(props.narration,{enum:[''],description:prompt('tool.detail.noNarration')});
 else Object.assign(props.narration,{maxLength:100,description:prompt('tool.detail.narration')});
 if(!policy.thought)Object.assign(props.thought,{type:['null'],description:prompt('tool.detail.noThought')});
 else Object.assign(props.thought,{maxLength:80,description:prompt('tool.detail.thought')});
 return tool;
}
export function trimDetails(r:CharacterReply,policy:{narration:boolean;thought:boolean}):CharacterReply{
 return {...r,narration:policy.narration?r.narration.slice(0,100):'',thought:policy.thought?r.thought?.slice(0,80)||null:null};
}
