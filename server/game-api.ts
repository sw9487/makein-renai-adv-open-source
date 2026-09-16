import {admittedRequest,requestScope} from './harness-request';
import {eventStream} from './harness-events';
import {imageSettings,illustrateScene} from './stable-diffusion';
import {imageJob,startImageJob,imageJobResult} from './image-jobs';
import {commitConcurrent} from './concurrent-state';
import {executeCharacterActions} from './character-actions';
import { act, createGame } from "@core/engine";
import { converse } from "./chat";
import {enlivenScene,listeningChoice,sceneSource} from './scene';
import { content, read, owner, token, json, sameOrigin, commit, commitNewStory, commitLoadedStory, insertInitialGame, saveGameSlot, ProgressConflictError, db } from "./repository";
import type { Content, GameState } from "@core/types";
import {repairHomeArrival} from '@core/home';
import {startContactGreeting,startProactiveLine} from './proactive-line';
import {twitterNotificationKey,withoutTwitter} from '../core/twitter';
import {resumeTwitter} from './twitter';
import {prompt} from './prompt';
import {answerDateInvitation,confirmDateInvitation,createDateInvitation,createDateInvitationMessage} from './date-invitation';
import {repairOfficialPlaceIds} from '@core/official-places';
import {socialAppEnabled} from '@core/social-apps';
const initialGames=new Map<string,Promise<GameState>>();
async function repairLoadedGame(id:string,source:GameState,c:Content){
 let state=source;
 for(let attempt=0;attempt<32;attempt++){
  const next=structuredClone(state);
  let changed=false;
  if(!next.runId){next.runId=crypto.randomUUID();changed=true;}
  if(repairOfficialPlaceIds(next))changed=true;
  if(repairHomeArrival(next,c))changed=true;
  const event=next.dialogue.choices?.length?c.events.find(item=>item.id===next.dialogue.eventId):undefined;
  if(event&&(next.dialogue.aiSource?next.dialogue.aiSource!==sceneSource(event):(next.dialogue.cg!==event.cg||next.dialogue.text!==event.text||JSON.stringify(next.dialogue.script)!==JSON.stringify(event.script)||JSON.stringify(next.dialogue.choices)!==JSON.stringify(event.choices)))){
   next.dialogue={...next.dialogue,aiSource:undefined,speaker:'旁白',text:event.text,script:event.script,choices:event.choices,cg:event.cg};
   changed=true;
  }
  if(!changed)return state;
  next.revision=state.revision+1;
  next.sceneRevision=(state.sceneRevision??state.revision)+1;
  try{await commit(id,next,state);return next;}
  catch(error){
   if(!(error instanceof Error)||error.message!=='進度已在另一個分頁更新，請重新整理。'||attempt===31)throw error;
   await new Promise(resolve=>setTimeout(resolve,Math.min(8,attempt+1)));
   const latest=await read<GameState|null>('game:'+id,null);if(!latest)throw Error('找不到進度。');state=latest;
  }
 }
 return state;
}
export async function GET(req: Request) {
  try {
    let id = owner(req);
    if(new URL(req.url).searchParams.has('events'))return id?eventStream(req,id):json({error:'請先載入遊戲。'},401);
    if(new URL(req.url).searchParams.get('line-inbox')==='1'){
      if(!id)return json({},401);
      const inbox=await read<GameState|null>('game:'+id,null);
      const revision=new URL(req.url).searchParams.get('revision');
      return json({state:revision!==null&&inbox?.revision===Number(revision)?null:inbox});
    }
    if(new URL(req.url).searchParams.get('image-job')==='1')return id?json(await imageJobResult(id)):json({error:'請重新載入遊戲。'},401);
    let headers: Record<string, string> = {};
    if (!id) {
      id = token();
      headers = {
        "Set-Cookie": `makeine_player=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
      };
    }
    if(new URL(req.url).searchParams.get('state-only')==='1')
      return json({state:await read<GameState|null>('game:'+id,null)},200,headers);
    const c = await content();
    let s = await read<GameState | null>("game:" + id, null);
    if (!s) {
      let pending=initialGames.get(id);
      if(!pending){
        pending=(async()=>{
          const existing=await read<GameState|null>('game:'+id,null);if(existing)return existing;
          const created=createGame(c);created.runId=crypto.randomUUID();
          const finishLine=startProactiveLine(id,created,c);
          try{
            await enlivenScene(created,c,undefined,false);
            await illustrateScene(created,c,false);
            const inserted=await insertInitialGame(id,created);
            finishLine(inserted);
            if(inserted)return created;
            const winner=await read<GameState|null>('game:'+id,null);if(!winner)throw Error('找不到進度。');return winner;
          }catch(error){finishLine(false);throw error;}
        })().finally(()=>initialGames.delete(id));
        initialGames.set(id,pending);
      }
      s=await pending;
    }
    if(!s)throw Error('找不到進度。');
    s=await repairLoadedGame(id,s,c);
    const saves = await Promise.all(
      [1, 2, 3, 4, 5, 6].map(async (slot) => {
        const state = await read<GameState | null>(`save:${id}:${slot}`, null);
        return {
          slot,
          date: state?.date,
          phase: state?.phase,
          ending: state?.ending,
        };
      }),
    );
    const imageState=await imageJobResult(id);
    const images=await imageSettings();
    resumeTwitter(id,s,c);
    return json({ content: c, state: s, saves, imagePending:imageState.imagePending,notice:imageState.notice,imageStatus:imageState.imageStatus,imageUrl:imageState.imageUrl, images:{enabled:images.enabled,automatic:images.automatic} }, 200, headers);
  } catch {
    return json({ error: "讀取資料失敗。請確認資料庫遷移已套用。" }, 500);
  }
}
export async function POST(req:Request){
  try{
    sameOrigin(req);const id=owner(req);if(!id)return json({error:'請先載入遊戲。'},401);
    const raw=await req.clone().text();if(raw.length>20000)return json({error:'操作資料過大。'},400);
    const input=JSON.parse(raw);
    if(input.requestId===undefined)return performPOST(req); // Old installed clients remain compatible.
    return await admittedRequest(id,input,()=>performPOST(new Request(req.url,{method:'POST',headers:req.headers,body:raw})));
  }catch(e){return json({error:e instanceof Error?e.message:'操作失敗。'},400);}
}
async function performPOST(req: Request) {
  try {
    sameOrigin(req);
    const id = owner(req);
    if (!id) return json({ error: "請重新載入遊戲以建立存檔。" }, 401);
    const raw = await req.text();
    if (raw.length > 20000) throw Error("操作資料過大。");
    const a = JSON.parse(raw);
    if(imageJob(id)?.pending&&!(a.type==='chat'&&a.channel==='line')&&a.type!=='line-read'){
      if(a.type==='generate-image')return json({imagePending:true});
      throw Error('圖片仍在生成中，請等待完成後再操作。');
    }
    const c = await content();
    const old = await read<GameState | null>("game:" + id, null);
    if (!old) throw Error("找不到進度。");
    if (a.runId !== undefined && a.runId !== old.runId)
      return json({error:"遊戲已讀檔或重新開始，請重新整理後再操作。",code:'PROGRESS_CONFLICT'},409);
    if ((a.sceneRevision!==undefined?a.sceneRevision!==(old.sceneRevision??old.revision):a.revision!==old.revision)&&!(a.type==='chat'&&a.channel==='line')&&a.type!=='line-read'&&a.type!=='social-settings') throw new ProgressConflictError("進度已更新，請重新整理後再操作。");
    if(a.type==='line-read'){
      if(!socialAppEnabled(old,'line'))throw Error('LINE 已停用。');
      if(typeof a.character!=='string'||!old.contacts.includes(a.character))throw Error(prompt('error.lineContactInvalid'));
      const next=structuredClone(old),readAt=Date.now();let changed=false;
      for(const message of next.messages[a.character]??[])if(message.from===a.character&&!message.readByPlayerAt){message.readByPlayerAt=readAt;changed=true;}
      if(!changed)return json({state:old});
      const saved=await commitConcurrent(id,next,old,true);return json({state:saved});
    }
    if (a.type === "save" || a.type === "load") {
      if (!Number.isInteger(a.slot) || a.slot < 1 || a.slot > 6) throw Error("存檔欄位無效。");
      if (a.type === "save") {
        return json({state:await saveGameSlot(id,a.slot,old)});
      }
      const saved = await read<GameState | null>(`save:${id}:${a.slot}`, null);
      if (!saved) throw Error("這個欄位還沒有存檔。");
      repairOfficialPlaceIds(saved);
      return json({ state: await commitLoadedStory(id,saved,old) });
    }
    if (a.type === "new") {
      const s = createGame(c);
      s.socialApps=structuredClone(old.socialApps??{line:true,twitter:true});
      s.runId=crypto.randomUUID();
      s.revision = old.revision + 1;
      s.sceneRevision=(old.sceneRevision??old.revision)+1;
      let image: {notice?:string} = {};
      const finishLine=startProactiveLine(id,s,c);
      try {
        await enlivenScene(s,c,undefined,false,req.signal);
        image=await illustrateScene(s,c,false,req.signal);
      await commitNewStory(id,s,old);
      finishLine(true);
      } catch(e) {finishLine(false);throw e;}
      const current=await read<GameState>('game:'+id,s);
      return json({ state: current, notice:image.notice, twitterReadKey:twitterNotificationKey(current.twitter!) });
    }
    if(a.type==='social-settings'){
      if(!['line','twitter'].includes(a.app)||typeof a.enabled!=='boolean')throw Error('社群設定無效。');
      if(a.app==='line'&&!a.enabled&&(old.pendingDate||old.pendingDateInvitation))throw Error('請先完成目前的 LINE 邀約。');
      const next=structuredClone(old);
      next.socialApps={line:socialAppEnabled(old,'line'),twitter:socialAppEnabled(old,'twitter'),[a.app]:a.enabled};
      if(a.app==='twitter'&&a.enabled)for(const job of Object.values(next.twitter?.jobs??{}))if(job.status==='scheduled'&&(job.date!==next.date||job.phase!==next.phase))job.status='done';
      const saved=await commitConcurrent(id,next,old,true);
      if(a.app==='twitter'&&a.enabled)resumeTwitter(id,saved,c);
      return json({state:saved});
    }
    if(a.type==='generate-image'){
      if(!(await imageSettings()).enabled)throw Error('Stable Diffusion 尚未啟用。');
      await startImageJob(id,old,c);
      return json({imagePending:true});
    }
    if(a.type==='date-invite'){
      if(!socialAppEnabled(old,'line'))throw Error('LINE 已停用。');
      const invited=await createDateInvitation(old,c,String(a.character??''),String(a.place??''),req.signal);
      return json({state:await commitConcurrent(id,invited,old)});
    }
    if(a.type==='date-invite-create'){
      if(!socialAppEnabled(old,'line'))throw Error('LINE 已停用。');
      const invited=await createDateInvitationMessage(old,c,String(a.character??''),String(a.place??''),req.signal);
      return json({state:await commitConcurrent(id,invited,old)});
    }
    if(a.type==='date-invite-answer'){
      if(!socialAppEnabled(old,'line'))throw Error('LINE 已停用。');
      const answered=await answerDateInvitation(old,c,req.signal);
      return json({state:await commitConcurrent(id,answered,old)});
    }
    if(a.type==='date-confirm'){
      if(!socialAppEnabled(old,'line'))throw Error('LINE 已停用。');
      const s=confirmDateInvitation(old,c);
      await enlivenScene(s,c,old,false,req.signal);
      const image=await illustrateScene(s,c,false,req.signal);
      return json({state:await commitConcurrent(id,s,old),notice:image.notice});
    }
    if (a.type === "chat") {
      const actionText = typeof a.action === "string" ? a.action.trim() : "";
      if (a.action !== undefined && actionText.length > 500) throw Error("動作請輸入500字以內。");
      if (typeof a.text !== "string" || a.text.length > 1500)
        throw Error("請輸入1–1500字訊息。");
      if (!a.text.trim() && !actionText) throw Error("請輸入台詞或動作。");
      if (!["line", "talk"].includes(a.channel)) throw Error("對話管道無效。");
      if(a.channel==='line'&&!socialAppEnabled(old,'line'))throw Error('LINE 已停用。');
      const execute=async(onPartial?:Parameters<typeof converse>[6],signal?:AbortSignal,onAccepted?:(state:GameState)=>void)=>{
      let baseline=old;
      if(a.channel==='line'){
        const sent=structuredClone(old),now=Date.now();
        sent.messages[a.character]=[...(sent.messages[a.character]??[]),{id:crypto.randomUUID(),phase:sent.phase,from:'player',text:a.text.trim(),date:sent.date,created:now,readByCharacterAt:now}].slice(-100);
        sent.revision++;
        baseline=await commitConcurrent(id,sent,old,true);
        onAccepted?.(baseline);
      }
      const result = await converse(baseline, c, a.character, a.text.trim(), a.channel, actionText, onPartial,signal,a.channel==='line');
      if(a.channel==='talk'){const image=await illustrateScene(result.state,c,false,signal);result.notice=image.notice;}
      result.state=await commitConcurrent(id, result.state, baseline,a.channel==='line');
      if(a.channel==='line'&&(result.performance.actions?.length||result.performance.twitterPost))requestScope.exit(()=>void (async()=>{
        try{
          const actionBase=await read<GameState|null>('game:'+id,null);if(!actionBase||actionBase.runId!==baseline.runId)return;
          const actionState=structuredClone(actionBase);
          await executeCharacterActions(actionState,c,a.character,result.performance);
          actionState.revision=actionBase.revision+1;actionState.sceneRevision=actionBase.sceneRevision??actionBase.revision;
          const saved=await commitConcurrent(id,actionState,actionBase,true);resumeTwitter(id,saved,c);
        }catch(error){console.error('Failed to execute deferred character actions',error instanceof Error?error.message:error);}
      })());
      // The committed game state is the user-visible completion boundary. A
      // transcript is auxiliary history and must not leave LINE saying
      // "sending/replying" while it waits for another pool checkout.
      void db()
        .prepare("INSERT INTO transcripts (id,owner,character,text,created) VALUES (?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          id,
          a.character,
          JSON.stringify({
            date: old.date,
            channel: a.channel,
            action: actionText || undefined,
            user: a.text,
            assistant: result.performance.respond===false ? undefined : result.reply,
            mode: result.mode,
          }),
          Date.now(),
        )
        .run()
        .catch(error=>console.error("Failed to persist conversation transcript",error));
      return result;
      };
      if(req.headers.get('accept')?.includes('text/event-stream')){
        const encoder=new TextEncoder(),abort=new AbortController();let closed=false;
        const stream=new ReadableStream<Uint8Array>({
          start(controller){
            const send=(event:string,data:unknown)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(withoutTwitter(data))}\n\n`));};
            send('start',{});
            const heartbeat=setInterval(()=>{if(!closed)controller.enqueue(encoder.encode(': keepalive\n\n'));},10000);
            void execute(reply=>send('delta',reply),AbortSignal.any([req.signal,abort.signal]),state=>send('accepted',{state}))
              .then(result=>send('done',result))
              .catch(e=>send('error',{error:e instanceof Error?e.message:'串流失敗，請重試。',...(e instanceof ProgressConflictError?{code:e.code}:{})}))
              .finally(()=>{clearInterval(heartbeat);if(!closed){closed=true;controller.close();}});
          },cancel(){closed=true;abort.abort();}
        });
        return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
      }
      return json(await execute());
    }
    const s = act(old, c, a);
    let image: {notice?:string} = {};
    const contactId=a.type==='contact'&&!old.contacts.includes(s.character)?s.character:'';
    const finishGreeting=contactId?startContactGreeting(id,s,c,contactId):(_ok:boolean)=>{};
    const finishLine=startProactiveLine(id,s,c,old);
    try {
      if(['visit','advance','choose','home-evening','skip'].includes(a.type))
        await enlivenScene(s,c,old,a.type==='choose'&&listeningChoice(old,a.index),req.signal);
      image=JSON.stringify(s.dialogue)!==JSON.stringify(old.dialogue)?await illustrateScene(s,c,false,req.signal):{};
    const merged=await commitConcurrent(id, s, old);
    finishLine(true);finishGreeting(true);
    return json({ state: merged, notice:image.notice });
    } catch(e) {finishLine(false);finishGreeting(false);throw e;}
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "操作失敗。",...(e instanceof ProgressConflictError?{code:e.code}:{}) }, e instanceof ProgressConflictError?409:400);
  }
}
