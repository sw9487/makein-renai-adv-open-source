import type {Content,GameState} from '../core/types';
import {illustrateScene} from './stable-diffusion';
import {read,write} from './repository';
import {runtimeConfig} from './runtime';
import {commitConcurrent} from './concurrent-state';
type Job={pending:boolean;notice?:string;status:'queued'|'running'|'succeeded'|'failed'|'interrupted';url?:string;created:number};
const jobs=new Map<string,Job>();
const key=(owner:string)=>runtimeConfig().dataDir+':'+owner;
export function imageJob(owner:string){return jobs.get(key(owner));}
export async function startImageJob(owner:string,old:GameState,c:Content){
 if(imageJob(owner)?.pending)return;
 const job:Job={pending:true,status:'queued',created:Date.now()};jobs.set(key(owner),job);
 await write('image-job:'+owner,job);
 void (async()=>{
  try{
   const s=structuredClone(old);
   const result=await illustrateScene(s,c,true,undefined,async status=>{job.status=status;await write('image-job:'+owner,job);});
   job.notice=result.notice;job.url=result.url;
   // Save the result before touching progress so a conflict cannot lose the image.
   await write('image-job:'+owner,job);
   if(result.url){s.revision++;await commitConcurrent(owner,s,old);}
   job.status=result.url?'succeeded':'failed';
  }catch{job.status='failed';job.notice='圖片工作未能更新進度；若圖片已完成，可從工作結果開啟。';}
  finally{job.pending=false;await write('image-job:'+owner,job);jobs.delete(key(owner));}
 })().catch(()=>{jobs.delete(key(owner));});
}
export async function imageJobResult(owner:string){
 let job=imageJob(owner)??await read<Job|null>('image-job:'+owner,null);
 if(job?.pending&&!imageJob(owner)){
  job={...job,pending:false,status:'interrupted',notice:'上次生圖工作因服務重啟而中斷，SD 可能仍在執行。請確認 SD 狀態後再手動重試；系統不會自動重送。'};
  await write('image-job:'+owner,job);
 }
 return {imagePending:!!job?.pending,notice:job?.notice,imageStatus:job?.status,imageUrl:job?.url,state:await read<GameState|null>('game:'+owner,null)};
}
