import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {db,runtimeConfig} from './runtime';
import {readSSE} from '../core/sse';
import {withoutTwitter} from '../core/twitter';
import type {DatabaseExecutor} from './database';

export const requestScope=new AsyncLocalStorage<{owner:string;id:string}>();
type Result={body:any;code:number};
const active=new Map<string,Promise<Result>>();
const admissionLocks=new Map<string,Promise<void>>();
function canonical(value:any):string{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function admittedRequest(owner:string,input:Record<string,unknown>,work:()=>Promise<Response>){
  const id=input.requestId;
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id))return Response.json({error:'requestId 格式不正確。'},{status:400});
  const run=String(input.runId??'');
  const {revision,sceneRevision,...intent}=input;
  const digest=createHash('sha256').update(canonical(intent)).digest('hex');
  const sql=db(),key=runtimeConfig().dataDir+':'+owner+':'+id;
  const previous=admissionLocks.get(key)??Promise.resolve();
  let unlock!:()=>void;
  const lock=new Promise<void>(resolve=>{unlock=resolve;});
  admissionLocks.set(key,lock);
  await previous;
  let row:any;
  let settle!:(value:Result)=>void;
  let completion:Promise<Result>|undefined;
  try{
    row=(await sql.query<any>('SELECT * FROM harness_requests WHERE owner=? AND request_id=?',[owner,id])).rows[0];
    if(!row){
      await sql.query("INSERT INTO harness_requests VALUES (?,?,?,?, 'running',NULL,NULL,?)",[owner,id,run,digest,Date.now()]);
      await sql.query("DELETE FROM harness_requests WHERE owner=? AND status='succeeded' AND updated<?",[owner,Date.now()-12*60*60*1000]);
      completion=new Promise<Result>(resolve=>{settle=resolve;});active.set(key,completion);
    }
  }finally{unlock();if(admissionLocks.get(key)===lock)admissionLocks.delete(key);}
  if(row){
    if(row.digest!==digest)return Response.json({error:'相同 requestId 不能用於不同操作。'},{status:409});
    const current=(await sql.query<any>('SELECT value FROM records WHERE key=?',['game:'+owner])).rows[0];
    const resultingRun=row.result?JSON.parse(row.result)?.state?.runId:undefined;
    if(current&&run&&JSON.parse(current.value).runId!==(resultingRun??run))
      return Response.json({error:'此請求屬於讀檔前的遊戲，不能在目前進度重播。'},{status:409});
    const pending=active.get(key);
    if(pending){const r=await pending;return Response.json(r.body,{status:r.code});}
    if(row.result)return Response.json(JSON.parse(row.result),{status:row.code??200});
    await sql.query("UPDATE harness_requests SET status='unknown',updated=? WHERE owner=? AND request_id=?",[Date.now(),owner,id]);
    return Response.json({error:'上次操作的結果尚未確認，為避免重複執行，請先重新整理進度並檢查生圖紀錄。',requestId:id,unknown:true},{status:409});
  }
  const finish=async(r:Result)=>{
    // A committed state is authoritative even if trailing response/transcript work failed.
    const saved=(await sql.query<any>('SELECT status,result FROM harness_requests WHERE owner=? AND request_id=?',[owner,id])).rows[0];
    if(r.code>=400&&saved?.status==='committed')r={body:JSON.parse(saved.result),code:200};
    await sql.query('UPDATE harness_requests SET status=?,result=?,code=?,updated=? WHERE owner=? AND request_id=?',[r.code<400?'succeeded':'failed',JSON.stringify(r.body),r.code,Date.now(),owner,id]);
    settle(r);active.delete(key);
  };
  try{
    const response=await requestScope.run({owner,id},work);
    const copy=response.clone();
    void (async()=>{
      try{
        if(copy.headers.get('content-type')?.includes('text/event-stream')&&copy.body){
          let result:Result|undefined;
          for await(const frame of readSSE(copy.body)){
            if(frame.event==='done')result={body:JSON.parse(frame.data),code:200};
            if(frame.event==='error'){
              const body=JSON.parse(frame.data);
              result={body,code:body.code==='PROGRESS_CONFLICT'?409:400};
            }
          }
          await finish(result??{body:{error:'串流結果不完整，請檢查進度。'},code:409});
        }else await finish({body:await copy.json(),code:copy.status});
      }catch{await finish({body:{error:'操作結果未能完整讀取，請檢查進度。'},code:409});}
    })().catch(()=>{settle({body:{error:'工作紀錄無法保存，請檢查進度。'},code:409});active.delete(key);});
    return response;
  }catch(error){
    const r={body:{error:error instanceof Error?error.message:'操作失敗。'},code:400};await finish(r);
    return Response.json(r.body,{status:r.code});
  }
}

/** Called inside the same SQLite transaction as the game state update. */
export async function settleCommittedState(owner:string,state:unknown,executor:DatabaseExecutor=db()){
  const scope=requestScope.getStore();if(!scope||scope.owner!==owner)return;
  await executor.query("UPDATE harness_requests SET status='committed',result=?,code=200,updated=? WHERE owner=? AND request_id=? AND status='running'",[JSON.stringify(withoutTwitter({state})),Date.now(),owner,scope.id]);
}
