import { bindings, db, runtimeConfig } from "./runtime";
import type { Content, GameState } from "../core/types";
import { defaultContent } from "../core/content";
import {hydratePublicAccounts} from '../core/twitter-public';
import {hydrateCharacterDefaults} from '../core/character-defaults';
import {hydrateContentDefaults} from '../core/content-defaults';
import {requestLanguage} from './request-locale';
import { upgradeRoster, repairPortraits } from '../core/roster';
import { upgradeStories } from '../core/story';
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {settleCommittedState} from './harness-request';
import {appendEvent,notifyEvents} from './harness-events';
import {withoutTwitter} from '../core/twitter';
import {prompt} from './prompt';
import type {DatabaseExecutor} from './database';
export { bindings, db };
export class ProgressConflictError extends Error{
 readonly code='PROGRESS_CONFLICT';
}
function gameCore(state:GameState){
 const stored=structuredClone(state);
 if(stored.twitter)delete stored.twitter.jobs;
 if(db().dialect==='postgres'){
  stored.messages={};stored.memories={};stored.log=[];
  if(stored.twitter)stored.twitter.posts={};
 }
 return stored;
}
async function hydrateGame(owner:string,state:GameState,executor:DatabaseExecutor=db()){
 const runId=state.runId??'';
 const jobs=await executor.query<{job_id:string;value:string}>('SELECT job_id,value FROM twitter_jobs WHERE owner=? AND run_id=?',[owner,runId]);
 if(state.twitter&&(state.twitter.jobs!==undefined||jobs.rows.length))state.twitter.jobs={...state.twitter.jobs,...Object.fromEntries(jobs.rows.map(row=>[row.job_id,JSON.parse(row.value)]))};
 if(db().dialect==='postgres'){
  const threads=await executor.query<{character:string;value:string}>('SELECT character,value FROM line_threads WHERE owner=? AND run_id=?',[owner,runId]);
  const memories=await executor.query<{character:string;value:string}>('SELECT character,value FROM character_memories WHERE owner=? AND run_id=?',[owner,runId]);
  const posts=await executor.query<{post_id:string;value:string}>('SELECT post_id,value FROM twitter_posts WHERE owner=? AND run_id=?',[owner,runId]);
  const logs=await executor.query<{value:string}>('SELECT value FROM game_logs WHERE owner=? AND run_id=?',[owner,runId]);
  state.messages={...state.messages,...Object.fromEntries(threads.rows.map(row=>[row.character,JSON.parse(row.value)]))};
  state.memories={...state.memories,...Object.fromEntries(memories.rows.map(row=>[row.character,JSON.parse(row.value)]))};
  if(state.twitter)state.twitter.posts={...state.twitter.posts,...Object.fromEntries(posts.rows.map(row=>[row.post_id,JSON.parse(row.value)]))};
  if(logs.rows[0])state.log=JSON.parse(logs.rows[0].value);
 }
 return state;
}
const commitQueues=new Map<string,Promise<void>>();
async function serializeCommit<T>(owner:string,work:()=>Promise<T>){
 const previous=commitQueues.get(owner)??Promise.resolve();let release!:()=>void;
 const current=new Promise<void>(resolve=>{release=resolve;});commitQueues.set(owner,current);
 await previous;
 try{return await work();}
 finally{release();if(commitQueues.get(owner)===current)commitQueues.delete(owner);}
}
async function syncMap(executor:DatabaseExecutor,table:string,idColumn:string,owner:string,runId:string,next:Record<string,unknown>,old:Record<string,unknown>){
 for(const id of Object.keys(old))if(!(id in next))await executor.query(`DELETE FROM ${table} WHERE owner=? AND run_id=? AND ${idColumn}=?`,[owner,runId,id]);
 for(const [id,value] of Object.entries(next)){
  if(JSON.stringify(old[id])===JSON.stringify(value))continue;
  await executor.query(`INSERT INTO ${table}(owner,run_id,${idColumn},value,updated) VALUES(?,?,?,?,?) ON CONFLICT(owner,run_id,${idColumn}) DO UPDATE SET value=excluded.value,updated=excluded.updated`,[owner,runId,id,JSON.stringify(value),Date.now()]);
 }
}
async function syncPostgresSections(executor:DatabaseExecutor,owner:string,runId:string,next:GameState,old:Partial<GameState>){
 await syncMap(executor,'twitter_posts','post_id',owner,runId,next.twitter?.posts??{},old.twitter?.posts??{});
 await syncMap(executor,'line_threads','character',owner,runId,next.messages,old.messages??{});
 await syncMap(executor,'character_memories','character',owner,runId,next.memories,old.memories??{});
 if(JSON.stringify(next.log)!==JSON.stringify(old.log))await executor.query('INSERT INTO game_logs(owner,run_id,value,updated) VALUES(?,?,?,?) ON CONFLICT(owner,run_id) DO UPDATE SET value=excluded.value,updated=excluded.updated',[owner,runId,JSON.stringify(next.log),Date.now()]);
}
export async function read<T>(key: string, fallback: T): Promise<T> {
  const row = await db()
    .prepare("SELECT value FROM records WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  if(!row)return fallback;
  const value=JSON.parse(row.value);
  return (key.startsWith('game:')?await hydrateGame(key.slice(5),value):value) as T;
}
export async function write(key: string, value: unknown) {
  if(key.startsWith('game:')){
    const owner=key.slice(5),state=value as GameState,runId=state.runId??'';
    await db().transaction(async tx=>{
      await tx.query('INSERT INTO records(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated',[key,JSON.stringify(gameCore(state)),Date.now()]);
      await tx.query('DELETE FROM twitter_jobs WHERE owner=?',[owner]);
      for(const [jobId,job] of Object.entries(state.twitter?.jobs??{}))await tx.query('INSERT INTO twitter_jobs(owner,run_id,job_id,value,updated) VALUES(?,?,?,?,?)',[owner,runId,jobId,JSON.stringify(job),Date.now()]);
      if(db().dialect==='postgres'){
       for(const table of ['twitter_posts','line_threads','character_memories','game_logs'])await tx.query(`DELETE FROM ${table} WHERE owner=?`,[owner]);
       await syncPostgresSections(tx,owner,runId,state,{} as GameState);
      }
    });
    return;
  }
  if(key.startsWith('image-job:')){
    const owner=key.slice('image-job:'.length),job=value as any;
    await db().transaction(async tx=>{
      await tx.query('INSERT INTO records(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated',[key,JSON.stringify(value),Date.now()]);
      const game=(await tx.query<{value:string}>('SELECT value FROM records WHERE key=?',['game:'+owner])).rows[0];
      await appendEvent(owner,game?JSON.parse(game.value).runId??'':'','image.status',{imageStatus:job.status,imagePending:job.pending,imageUrl:job.url,notice:job.notice},tx);
    });notifyEvents(owner);return;
  }
  await db()
    .prepare(
      "INSERT INTO records (key,value,updated) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated",
    )
    .bind(key, JSON.stringify(value), Date.now())
    .run();
}
/** Initial GET requests may run simultaneously; only the first generated run may become the save. */
export async function insertInitialGame(owner:string,state:GameState){
 return db().transaction(async tx=>{
  const result=await tx.query<{key:string}>('INSERT INTO records(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO NOTHING RETURNING key',['game:'+owner,JSON.stringify(gameCore(state)),Date.now()]);
  if(result.rows.length!==1)return false;
  for(const [jobId,job] of Object.entries(state.twitter?.jobs??{}))await tx.query('INSERT INTO twitter_jobs(owner,run_id,job_id,value,updated) VALUES(?,?,?,?,?)',[owner,state.runId??'',jobId,JSON.stringify(job),Date.now()]);
  if(db().dialect==='postgres')await syncPostgresSections(tx,owner,state.runId??'',state,{} as GameState);
  return true;
 });
}
export function sourceContent(): Content {
  const config = runtimeConfig();
  const path = config.projectDir
    ? join(config.projectDir, "content/game.json")
    : config.packageDir
      ? join(config.packageDir, "dist/content.json")
      : "";
  const bundled =
    path && existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as Content)
      : defaultContent;
  const result=structuredClone(bundled);
  return hydratePublicAccounts(hydrateContentDefaults(hydrateCharacterDefaults(result,requestLanguage()),requestLanguage()),requestLanguage());
}
export async function content() {
  const result=upgradeStories(repairPortraits(upgradeRoster(await read<Content>("content", sourceContent()))));
  return hydratePublicAccounts(hydrateContentDefaults(hydrateCharacterDefaults(result,requestLanguage()),requestLanguage()),requestLanguage());
}
export async function commit(owner: string, s: GameState, old: GameState,options?:{resetRun?:boolean}) {
  // Completed workers are durable scheduling markers, but their full candidate
  // snapshots are useless after their time slot. Keeping those arrays made one
  // active save exceed 1.6 MB and multiplied every compare-and-swap transfer.
  for(const [jobId,job] of Object.entries(s.twitter?.jobs??{})){
    const expired=job.date<s.date||(job.date===s.date&&job.phase<s.phase);
    const baseSlotJob=jobId===`${job.date}:${job.phase}:${job.actor}`;
    if(job.status==='done'&&(expired||!baseSlotJob))
      job.posts=[];
  }
  await serializeCommit(owner,()=>db().transaction(async tx=>{
    const stored=JSON.stringify(gameCore(s));
    const result=await tx.query<{key:string}>("UPDATE records SET value=?,updated=? WHERE key=? AND CAST(json_extract(value,'$.revision') AS BIGINT)=? AND COALESCE(json_extract(value,'$.runId'),'')=? RETURNING key",[stored,Date.now(),'game:'+owner,old.revision,old.runId??'']);
    if(result.rows.length!==1)throw new ProgressConflictError('進度已在另一個分頁更新，請重新整理。');
    const reset=!!options?.resetRun||old.runId!==s.runId,runId=s.runId??'';
    if(reset)await tx.query('DELETE FROM twitter_jobs WHERE owner=?',[owner]);
    await syncMap(tx,'twitter_jobs','job_id',owner,runId,s.twitter?.jobs??{},reset?{}:old.twitter?.jobs??{});
    if(db().dialect==='postgres'){
      if(reset)for(const table of ['twitter_posts','line_threads','character_memories','game_logs'])await tx.query(`DELETE FROM ${table} WHERE owner=?`,[owner]);
      await syncPostgresSections(tx,owner,runId,s,reset?{}:old);
    }
    if(options?.resetRun)await tx.query('DELETE FROM records WHERE key=?',['image-job:'+owner]);
    await settleCommittedState(owner,s,tx);
    await appendEvent(owner,s.runId??'',JSON.stringify(old.messages)!==JSON.stringify(s.messages)?'line.received':'game.changed',{revision:s.revision},tx);
    const archived = new Set(Object.entries(old.memories).flatMap(([character,memory])=>(memory.archive??[]).map(message=>JSON.stringify({character,message}))));
    for(const [character,memory] of Object.entries(s.memories)){
      for(const message of memory.archive??[]){
        const identity=JSON.stringify({character,message});
        if(archived.has(identity))continue;
        const key='memory-source:'+owner+':'+(s.runId??'')+':'+new Bun.CryptoHasher('sha256').update(identity).digest('hex');
        await tx.query('INSERT OR IGNORE INTO records(key,value,updated) VALUES(?,?,?)',[key,identity,Date.now()]);
      }
    }
  }));
  notifyEvents(owner);
}
/** A new story replaces the old run, but background LINE/Twitter writes may finish while its scene is prepared. */
export async function commitNewStory(owner:string,next:GameState,baseline:GameState){
 for(let attempt=0;attempt<32;attempt++){
  const current=await read<GameState|null>('game:'+owner,null);
  if(!current)throw Error('找不到進度。');
  if(current.runId!==baseline.runId||(current.sceneRevision??current.revision)!==(baseline.sceneRevision??baseline.revision))
   throw new ProgressConflictError('進度已更新，請重新整理後再操作。');
  next.revision=current.revision+1;
  next.sceneRevision=(current.sceneRevision??current.revision)+1;
  next.socialApps=structuredClone(current.socialApps??{line:true,twitter:true});
  try{await commit(owner,next,current,{resetRun:true});return next;}
  catch(error){if(!(error instanceof Error)||error.message!=='進度已在另一個分頁更新，請重新整理。'||attempt===31)throw error;await new Promise(resolve=>setTimeout(resolve,Math.min(8,attempt+1)));}
 }
 throw Error('進度儲存失敗。');
}
/** Loading is a scene replacement; retry background writes but never overwrite another scene action. */
export async function commitLoadedStory(owner:string,snapshot:GameState,baseline:GameState){
 for(let attempt=0;attempt<32;attempt++){
  const current=await read<GameState|null>('game:'+owner,null);
  if(!current)throw Error('找不到進度。');
  if(current.runId!==baseline.runId||(current.sceneRevision??current.revision)!==(baseline.sceneRevision??baseline.revision))
   throw new ProgressConflictError(prompt('game.error.sceneChanged'));
  const next=structuredClone(snapshot);
  next.socialApps=structuredClone(current.socialApps??{line:true,twitter:true});
  next.runId=crypto.randomUUID();
  next.flags=next.flags.filter(flag=>!flag.startsWith('line-batch:'));
  next.revision=current.revision+1;
  next.sceneRevision=(current.sceneRevision??current.revision)+1;
  next.seenEndings=[...new Set([...current.seenEndings,...next.seenEndings])];
  try{await commit(owner,next,current,{resetRun:true});return next;}
  catch(error){if(!(error instanceof Error)||error.message!=='進度已在另一個分頁更新，請重新整理。'||attempt===31)throw error;await new Promise(resolve=>setTimeout(resolve,Math.min(8,attempt+1)));}
 }
 throw Error('進度儲存失敗。');
}
/** Copy the current save atomically so a background notification cannot make a slot stale. */
export async function saveGameSlot(owner:string,slot:number,baseline:GameState){
 return db().transaction(async tx=>{
  const row=(await tx.query<{value:string}>('SELECT value FROM records WHERE key=?',['game:'+owner])).rows[0];
  if(!row)throw Error('找不到進度。');
  const current=await hydrateGame(owner,JSON.parse(row.value) as GameState,tx);
  if(current.runId!==baseline.runId||(current.sceneRevision??current.revision)!==(baseline.sceneRevision??baseline.revision))
   throw new ProgressConflictError(prompt('game.error.sceneChanged'));
  await tx.query('INSERT INTO records(key,value,updated) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated',[`save:${owner}:${slot}`,JSON.stringify(current),Date.now()]);
  return current;
 });
}
export function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
export function owner(req: Request) {
  const x = cookie(req, "makeine_player");
  return /^[a-f0-9]{64}$/.test(x) ? x : "";
}
export function token() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || (origin !== new URL(req.url).origin && origin !== runtimeConfig().devOrigin))
    throw Error("不接受跨網站操作。");
}
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  data=withoutTwitter(data);
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export function safeUrl(value: string) {
  if (value === "") return true;
  if (/^\/(assets|api\/media)\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export async function isEditor(req: Request) {
  const url = new URL(req.url);
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return true;
  const t = cookie(req, "makeine_editor");
  if (!/^[a-f0-9]{64}$/.test(t)) return false;
  return (await read<number>("editor-session:" + t, 0)) > Date.now();
}
export type ApiSettings = { url: string; key: string; model: string;contextTokens?:number };
export async function apiSettings(): Promise<ApiSettings> {
  const stored = await read<Partial<ApiSettings>>("api-settings", {});
  return {
    url: stored.url ?? String(bindings.AI_API_URL ?? ""),
    key: stored.key ?? String(bindings.AI_API_KEY ?? ""),
    contextTokens:stored.contextTokens??32768,
    model: stored.model ?? String(bindings.AI_MODEL ?? ""),
  };
}
export function validateApiUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw Error("API URL 必須是沒有帳密、查詢或片段的 HTTPS 網址。");
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local") ||
    url.hostname.includes(":") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
  )
    throw Error("API URL 請使用公開服務的網域名稱。");
  return value.replace(/\/+$/, "");
}
