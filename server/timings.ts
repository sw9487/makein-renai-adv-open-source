type Timing={stage:string;started:number;durationMs:number;ok:boolean};
const completed:Timing[]=[];
export function recentTimings(){return completed.map(item=>({...item}));}
export async function timed<T>(stage:string,work:()=>Promise<T>):Promise<T>{
  const started=Date.now();let ok=false;
  try{const result=await work();ok=true;return result;}
  finally{completed.push({stage,started,durationMs:Date.now()-started,ok});if(completed.length>100)completed.shift();}
}
