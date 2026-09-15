import {createHash} from 'node:crypto';
import type {Memory} from '../core/types';
/** Retrieval changes only the model view; full facts and evidence stay in player storage. */
export function importantMemoryView(memory:Memory,query:string,budget=8000){
  const terms=new Set(query.toLowerCase().match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2}/g)??[]);
  const ranked=(memory.important??[]).map((fact,index)=>({fact,index,score:[...terms].filter(term=>fact.text.toLowerCase().includes(term)).length*10+(fact.kind==='promise'?2:0)}))
    .sort((a,b)=>b.score-a.score||b.index-a.index);
  let size=0;
  return ranked.filter(item=>{const cost=JSON.stringify(item.fact).length;if(size+cost>budget)return false;size+=cost;return true;})
    .sort((a,b)=>a.index-b.index).map(({fact})=>{
      const {evidence,...value}=fact;
      return {...value,sourceId:createHash('sha256').update(JSON.stringify(fact)).digest('hex')};
    });
}
