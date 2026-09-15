import {Database} from 'bun:sqlite';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
// Exact corrections only; no global pronoun substitution in player dialogue.
const database=new Database(join(homedir(),'.makein-renai-adv','game.sqlite'));
const original='我嘴上雖然嘟嚷著，還是張開雙臂，輕輕抱了你一下，然後退開半步，歪頭看著你。';
const corrected='佳樹嘴上雖然嘟嚷著，仍張開雙臂，輕輕抱了你一下，然後退開半步，歪頭看著你。';
const rows=database.query("SELECT key,value FROM records WHERE key LIKE 'game:%' OR key LIKE 'save:%'").all() as {key:string;value:string}[];
const pattern=/[「“]?我嘴上雖然嘟[嚷囔]著，還是張開雙臂，輕輕抱了你一下，然後退開半步，歪頭看著你。[」”]?/g;
const affected=rows.filter(row=>new RegExp(pattern.source).test(row.value));
if(affected.length){
 const backup=join(tmpdir(),`makein-narration-backup-${Date.now()}.json`);
 await Bun.write(backup,JSON.stringify(affected));
 database.transaction(()=>{for(const row of affected){
  const repair=(value:any):any=>{
   if(typeof value==='string')return value.replace(pattern,corrected);
   if(Array.isArray(value))return value.map(repair);
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,repair(v)]));
   return value;
  };
  const state=repair(JSON.parse(row.value));state.revision++;
  database.query('UPDATE records SET value=?,updated=? WHERE key=? AND value=?').run(JSON.stringify(state),Date.now(),row.key,row.value);
 }})();
 console.log({correctedSaves:affected.length,backup});
}else console.log({correctedSaves:0});
database.close();
