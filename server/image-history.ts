import {db,write} from './repository';
type Status='queued'|'running'|'succeeded'|'failed'|'interrupted';
export type ImageHistory={id:string;status:Status;created:number;url?:string;caption:string;notice?:string};
const active=new Set<string>();
export async function trackImage(caption:string,work:(status:(value:'queued'|'running')=>Promise<void>)=>Promise<string>){
  const job:ImageHistory={id:crypto.randomUUID(),created:Date.now(),status:'queued',caption};
  active.add(job.id);
  const save=()=>write('sd-history:'+job.id,job);
  try{
    await save();
    const url=await work(async status=>{job.status=status;await save();});
    job.url=url;job.status='succeeded';await save();return url;
  }catch(error){job.status='failed';job.notice='生圖未完成，請檢查服務狀態後重試。';await save();throw error;}
  finally{active.delete(job.id);}
}
export async function imageHistory():Promise<ImageHistory[]>{
  const result=await db().query<{value:string}>("SELECT value FROM records WHERE key LIKE 'sd-history:%' ORDER BY updated DESC LIMIT 30");
  const jobs:ImageHistory[]=result.rows.map(row=>JSON.parse(row.value));
  for(const job of jobs){
    if(['queued','running'].includes(job.status)&&!active.has(job.id)){
      job.status='interrupted';job.notice='服務曾中斷，SD 可能仍在生成。請先檢查 SD，不會自動重送。';
      await write('sd-history:'+job.id,job);
    }
  }
  return jobs;
}
