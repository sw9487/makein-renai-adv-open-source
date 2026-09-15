import type {GameState} from '../core/types';
import {read,commit,ProgressConflictError} from './repository';
import {prompt} from './prompt';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function appended(old:any[],next:any[]){
 for(let n=Math.min(old.length,next.length);n>0;n--)if(equal(old.slice(-n),next.slice(0,n)))return next.slice(n);
 return next;
}
function mergeSetChanges(old:any[],next:any[],current:any[]){
 const contains=(items:any[],value:any)=>items.some(item=>equal(item,value));
 return [...current.filter(value=>!contains(old,value)||contains(next,value)),...next.filter(value=>!contains(old,value))]
  .filter((value,index,all)=>all.findIndex(item=>equal(item,value))===index);
}
function mergeMessages(old:any[],next:any[],current:any[],merge:(a:any,b:any,c:any,path:string[])=>any,path:string[]){
 const keyed=(messages:any[])=>{
  const seen=new Map<string,number>();
  return messages.map(message=>{
   const identity=message.id?`id:${message.id}`:`legacy:${JSON.stringify([message.from,message.text,message.date,message.phase])}`;
   const occurrence=seen.get(identity)??0;seen.set(identity,occurrence+1);
   return {key:`${identity}:${occurrence}`,message};
  });
 };
 const before=new Map(keyed(old).map(item=>[item.key,item.message]));
 const incoming=new Map(keyed(next).map(item=>[item.key,item.message]));
 const persisted=new Map(keyed(current).map(item=>[item.key,item.message]));
 const order=[...persisted.keys(),...incoming.keys()].filter((key,index,all)=>all.indexOf(key)===index);
 return order.map(key=>{
  const a=before.get(key),b=incoming.get(key),c=persisted.get(key);
  if(b===undefined)return c;
  if(c===undefined)return b;
  return merge(a,b,c,[...path,key]);
 }).filter(Boolean).slice(-100);
}
export function mergeConcurrentState(old:GameState,next:GameState,current:GameState):GameState{
 const merge=(a:any,b:any,c:any,path:string[]):any=>{
  if(equal(a,b))return c;
  if(equal(a,c))return b;
  if(path[0]==='messages'&&['readByPlayerAt','readByCharacterAt'].includes(path.at(-1)??'')&&typeof b==='number'&&typeof c==='number')return Math.min(b,c);
  if(path[0]==='twitter'&&path[1]==='jobs'&&path.at(-1)==='due'&&typeof b==='number'&&typeof c==='number')return Math.min(b,c);
  if(path[0]==='twitter'&&path[1]==='jobs'&&path.at(-1)==='status'&&typeof b==='string'&&typeof c==='string')return c;
  if(path[0]==='twitter'&&path[1]==='threadSeen'&&typeof b==='number'&&typeof c==='number')return Math.max(b,c);
  if(path[0]==='twitter'&&path[1]==='onlineCount'&&typeof b==='number'&&typeof c==='number')return Math.max(b,c);
  if(path[0]==='twitter'&&path[1]==='networkVersion'&&typeof b==='number'&&typeof c==='number')return Math.max(b,c);
  if(path[0]==='twitter'&&path[1]==='npcInteractions'&&typeof b==='number'&&typeof c==='number')return (c??0)+(b??0)-(a??0);
  if(typeof b==='number'&&(path[0]==='affection'||(path[0]==='memories'&&path.at(-1)==='turns')))return Math.max(0,Math.min(path[0]==='affection'?100:Infinity,(c??0)+(b??0)-(a??0)));
  if((b===null||typeof b!=='object')&&equal(b,c))return b;
  if(path[0]==='memories'&&path.at(-1)==='summary'&&typeof b==='string'&&typeof c==='string'){
   const addition=typeof a==='string'&&b.startsWith(a)?b.slice(a.length).trim():b;
   return addition&&addition!==c?`${c}\n${addition}`.trim():c;
  }
  if(Array.isArray(b)&&Array.isArray(c)){
   if(path[0]==='flags')return [...new Set([...c.filter(v=>!(a??[]).includes(v)||b.includes(v)),...b.filter(v=>!(a??[]).includes(v))])];
   if(path[0]==='messages')return mergeMessages(a??[],b,c,merge,path);
   if(path[0]==='twitter'&&['online','typing'].includes(path[1]))return mergeSetChanges(a??[],b,c);
   if(path[0]==='twitter'&&path[1]==='jobs'&&path.at(-1)==='posts')return [...c,...b].filter((value,index,all)=>all.findIndex(item=>equal(item,value))===index);
   if(['met','contacts','completed','gallery','seenEndings'].includes(path[0])||path.at(-1)==='facts')return [...new Set([...c,...b])];
   if(path.at(-1)==='important')return [...c,...appended(a??[],b)].filter((v,i,all)=>all.findIndex(x=>equal(x,v))===i);
   if(path.at(-1)==='archive')return [...c,...appended(a??[],b)].slice(-200);
   if(path.at(-1)==='recent'||path[0]==='log')return [...c,...appended(a??[],b)].slice(path.at(-1)==='recent'?-40:-500);
  }
  if(b&&c&&typeof b==='object'&&typeof c==='object'&&!Array.isArray(b)){
   const result={...c};for(const k of new Set([...Object.keys(a??{}),...Object.keys(b)]))result[k]=merge(a?.[k],b[k],c[k],[...path,k]);return result;
  }
  throw new ProgressConflictError(prompt('game.error.concurrentChange'));
 };
 const result=merge({...old,revision:0},{...next,revision:0},{...current,revision:0},[]);
 if(result.twitter?.online)result.twitter.onlineCount=result.twitter.online.length;
 result.revision=current.revision+1;return result;
}
export async function commitConcurrent(owner:string,next:GameState,old:GameState,background=false){
 for(let attempt=0;attempt<32;attempt++){
  const current=await read<GameState|null>('game:'+owner,null);if(!current)throw Error('找不到進度。');
  if(old.runId!==current.runId)throw new ProgressConflictError(prompt('game.error.sceneChanged'));
  if(!background&&(current.sceneRevision??current.revision)!==(old.sceneRevision??old.revision))throw new ProgressConflictError(prompt('game.error.sceneChanged'));
  const merged=mergeConcurrentState(old,next,current);
  merged.sceneRevision=background?(current.sceneRevision??current.revision):(current.sceneRevision??current.revision)+1;
  try{await commit(owner,merged,current);return merged;}catch(e){if(!(e instanceof Error)||e.message!=='進度已在另一個分頁更新，請重新整理。'||attempt===31)throw e;await new Promise(resolve=>setTimeout(resolve,Math.min(8,attempt+1)));}
 }
 throw Error('進度儲存失敗。');
}
