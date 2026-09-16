import {db,runtimeConfig} from './runtime';
import type {DatabaseExecutor} from './database';
const listeners=new Map<string,Set<()=>void>>();
const channel=(owner:string)=>runtimeConfig().dataDir+':'+owner;
const eventRetentionMs=24*60*60*1000;
const eventRetentionCount=2000;

export async function appendEvent(owner:string,runId:string,type:string,payload:unknown,executor:DatabaseExecutor=db()){
  const now=Date.now();
  await executor.query('INSERT INTO harness_events(owner,run_id,type,payload,created) VALUES(?,?,?,?,?)',[owner,runId,type,JSON.stringify(payload),now]);
  await executor.query('DELETE FROM harness_events WHERE owner=? AND (created<? OR seq < COALESCE((SELECT seq FROM harness_events WHERE owner=? ORDER BY seq DESC LIMIT 1 OFFSET ?),0))',[owner,now-eventRetentionMs,owner,eventRetentionCount-1]);
}
export function notifyEvents(owner:string){for(const wake of listeners.get(channel(owner))??[])wake();}
export function eventStream(req:Request,owner:string){
  const database=db(),key=channel(owner),encoder=new TextEncoder();
  let cursor=Number(req.headers.get('last-event-id')??0),closed=false;
  if(!Number.isSafeInteger(cursor)||cursor<0)cursor=0;
  let cleanup=()=>{};
  return new Response(new ReadableStream<Uint8Array>({
    start(controller){
      const send=(event:string,value:unknown,id?:number)=>{
        if(closed)return;
        if((controller.desiredSize??1)<-64){cleanup();controller.close();return;}
        controller.enqueue(encoder.encode(`${id===undefined?'':`id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      let draining=false;
      const drain=async()=>{
        if(closed||draining)return;draining=true;
        try{
          const rows=(await database.query<any>('SELECT seq,run_id,type,payload FROM harness_events WHERE owner=? AND seq>? ORDER BY seq LIMIT 100',[owner,cursor])).rows;
          for(const row of rows){if(closed)break;const seq=Number(row.seq);send('change',{runId:row.run_id,type:row.type,...JSON.parse(row.payload)},seq);cursor=seq;}
          if(rows.length===100&&!closed)queueMicrotask(()=>void drain());
        }catch{cleanup();controller.close();}finally{draining=false;}
      };
      const initialize=async()=>{
        const range=(await database.query<any>('SELECT MIN(seq) AS first,MAX(seq) AS last FROM harness_events WHERE owner=?',[owner])).rows[0]??{};
        const first=Number(range.first??0),last=Number(range.last??0);
        if(cursor&&(cursor<first||cursor>last)){cursor=last;send('sync',{},cursor);}
        if(!cursor){cursor=last;send('sync',{},cursor);}
        await drain();
      };
      const set=listeners.get(key)??new Set();const wake=()=>void drain();set.add(wake);listeners.set(key,set);
      const heartbeat=setInterval(()=>{if(!closed){void drain();send('heartbeat',{});}},15000);
      const abort=()=>{cleanup();try{controller.close();}catch{}};
      cleanup=()=>{if(closed)return;closed=true;clearInterval(heartbeat);set.delete(wake);if(!set.size)listeners.delete(key);req.signal.removeEventListener('abort',abort);};
      req.signal.addEventListener('abort',abort,{once:true});
      void initialize().catch(()=>{cleanup();try{controller.close();}catch{}});
      if(req.signal.aborted)abort();
    },cancel(){cleanup();},
  }),{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
