import {describe,test,expect} from 'bun:test';
import {execFileSync} from 'node:child_process';
import {serviceCatalog as catalog} from '../core/service-i18n';
import {translatedServiceText,serviceError,localizeServicePayload,type ServiceLanguage} from '../core/service-i18n';
import {localizeResponse} from '../server/response-locale';
import {withRequestLocale,requestLanguage} from '../server/request-locale';
import jaCatalog from '../web/locales/ja.json';
import zhTwCatalog from '../web/locales/zh-TW.json';
import enCatalog from '../web/locales/en.json';
import {cliLanguage,cliText} from '../cli/i18n.mjs';
import {twitterPostPending} from '../core/twitter';
import {startServer} from '../server/http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

describe('service and UI i18n',()=>{
 test('every service entry has three translations and matching parameters',()=>{
  const sources=new Set<string>();
  const params=(text:string)=>[...text.matchAll(/\{(\d+)\}/g)].map(m=>m[1]).sort();
  for(const row of catalog){
   expect(row).toHaveLength(4);expect(sources.has(row[0])).toBe(false);sources.add(row[0]);
   for(const text of row){expect(text.trim().length).toBeGreaterThan(0);expect(params(text)).toEqual(params(row[0]));}
  }
 });
 test('the source audit rejects uncovered API/domain error literals',()=>{
  expect(execFileSync(process.execPath,['scripts/audit-i18n.ts','check'],{encoding:'utf8'})).toContain('0 uncovered');
 },30000);
 test('all three languages localize route errors and preserve interpolation',()=>{
  const languages:ServiceLanguage[]=['zh-Hant','en','ja'];
  for(const language of languages){
   expect(serviceError('API route or method not found',language)).toBe(catalog.find(row=>row[0]==='API route or method not found')![{'zh-Hant':3,en:1,ja:2}[language]]);
   expect(serviceError('查詢模型失敗（429），請確認 API URL 已填到 /v1。',language)).toContain('429');
  }
  expect(serviceError('NPC 互動次數必須介於 0 到 20。','en')).toBe('The NPC interaction limit must be from 0 to 20.');
 });
 test('nested image failures translate the reason as well as the wrapper',()=>{
  const text=serviceError('圖片生成未完成：LLM HTTP 429：服務限流，請稍後重試。遊戲可繼續。','en');
  expect(text).toContain('LLM HTTP 429: Rate limited');expect(text).not.toMatch(/[\u3400-\u9fff]/);
 });
 test('unknown native/provider errors use a localized safe fallback',()=>{
  expect(serviceError('SyntaxError: secret=private-token','en')).toBe('The operation failed. Please try again.');
  expect(serviceError('TypeError: failed to fetch','ja')).toContain('操作に失敗');
 });
 test('payload localization never mutates saves, posts, images, names or model text',()=>{
  const value={notice:'操作完成。',state:{dialogue:{text:'操作完成。'},messages:[{text:'Not found'}]},twitter:{posts:{p:{text:'操作完成。',image:'/api/media/test.png',imageStatus:'準備配圖'}},accounts:{a:{name:'完成'}},notices:{n:{text:'八奈見杏菜開始追蹤你。',accountId:'anna'}}}};
  const next=localizeServicePayload(value,'en');
  expect(next.notice).toBe('Operation complete.');expect(next.state).toEqual(value.state);
  expect(next.twitter.posts.p.text).toBe('操作完成。');expect(next.twitter.posts.p.image).toBe('/api/media/test.png');
  expect(next.twitter.posts.p.imageStatus).toBe('準備配圖');expect((next.twitter.posts.p as any).imageStatusLabel).toBe('Preparing image');expect(next.twitter.accounts).toEqual(value.twitter.accounts);
  expect(next.twitter.notices.n.text).toBe('八奈見杏菜 started following you.');expect(value.notice).toBe('操作完成。');
 });
 test('cached/replayed results can be rendered in a different language',()=>{
  const value={error:'請先登入 editor。'};
  const english=localizeServicePayload(value,'en');
  expect(localizeServicePayload(english,'ja').error).toBe('先にエディターにログインしてください。');
  expect(value.error).toBe('請先登入 editor。');
 });
 test('AI status, knowledge errors and image history are localized',()=>{
  const data=localizeServicePayload({status:'missing',message:catalog.find(row=>row[0].startsWith('尚未完成 LLM'))![0],knowledge:[{error:'Error: Knowledge 路徑無效。',description:'使用者文字'}],jobs:[{notice:'生圖未完成，請檢查服務狀態後重試。',caption:'使用者文字'}]},'en');
  expect(data.message).toContain('LLM API setup');expect(data.knowledge[0].error).toBe('Invalid knowledge path.');
  expect(data.jobs[0].notice).toContain('Image generation');expect(data.jobs[0].caption).toBe('使用者文字');
 });
 test('JSON responses preserve status and security/session headers',async()=>{
  const response=await withRequestLocale(new Request('http://localhost/api/twitter',{headers:{'X-Makeine-Language':'en'}}),()=>localizeResponse(Response.json({error:'找不到帳號。'},{status:404,headers:{'Set-Cookie':'test=value','X-Frame-Options':'DENY'}})));
  expect(response.status).toBe(404);expect(response.headers.get('Content-Language')).toBe('en');
  expect(response.headers.get('Set-Cookie')).toBe('test=value');expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(await response.json()).toEqual({error:'Account not found.'});
 });
 test('SSE handles split UTF-8/chunks and preserves ids and dialogue deltas',async()=>{
  const source='id: 42\r\nevent: error\r\nretry: 1500\r\ndata: {"error":"請先載入遊戲。"}\r\n\r\nevent: delta\ndata: {"text":"請先載入遊戲。"}\n\n';
  const bytes=new TextEncoder().encode(source);
  const body=new ReadableStream<Uint8Array>({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}});
  const response=await localizeResponse(new Response(body,{headers:{'Content-Type':'text/event-stream'}}),'en');
  const text=await response.text();expect(text).toContain('id: 42');expect(text).toContain('retry: 1500');
  expect(text).toContain('"error":"Load the game first."');expect(text).toContain('"text":"請先載入遊戲。"');
 });
 test('EventSource uses explicit language and concurrent subscribers remain isolated',async()=>{
  const run=(language:string)=>withRequestLocale(new Request('http://localhost/api/game?events=1&language='+language),async()=>{await Promise.resolve();return requestLanguage();});
  expect(await Promise.all([run('en'),run('ja'),run('zh-Hant')])).toEqual(['en','ja','zh-Hant']);
 });
 test('accessibility labels and Twitter UI text use keyed translations',()=>{
  expect(jaCatalog.service.close_toast).toBe('通知を閉じる');
  expect(zhTwCatalog.service.loading).toBe('載入中');
  expect(enCatalog.messages['twitter.likeReply']).toBe('Like reply');
 });
 test('legacy image pending state survives localization',()=>{
  const post={id:'p',author:'anna',text:'x',date:'2026-07-14',phase:0,created:1,likes:{},reposts:{},imageStatus:'準備配圖'};
  for(const language of ['en','ja','zh-Hant'] as const)expect(twitterPostPending(localizeServicePayload({twitter:{posts:{p:post}}},language).twitter.posts.p)).toBe(true);
 });
 test('CLI locale selection and parameterized output',()=>{
  expect(cliLanguage({MAKEIN_LANGUAGE:'zh-Hant'})).toBe('zh-Hant');
  expect(cliLanguage({LANG:'en_US.UTF-8'})).toBe('en');expect(cliLanguage({LC_ALL:'ja_JP.UTF-8'})).toBe('ja');
  expect(cliText('Port 9487 已被占用。請先關閉該服務，或使用 --port 指定其他連接埠。','en')).toContain('Port 9487 is in use');
  expect(cliText('未知參數：--wrong。使用 --help 查看用法。','ja')).toContain('--wrong');
 });
 test('real HTTP routes localize errors, cached AI status, invalid JSON and missing media',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'i18n-http-'));
  const app=startServer({port:0,dataDir:directory,env:{},clientDir:directory,version:'test'});
  const base='http://127.0.0.1:'+app.server.port;
  try{
   for(const language of ['en','ja','zh-Hant'] as const){
    const headers={'X-Makeine-Language':language};
    const missing=await fetch(base+'/api/missing',{headers});expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe(serviceError('API route or method not found',language));
    const twitter=await fetch(base+'/api/twitter',{headers});expect((await twitter.json()).error).toBe(serviceError('請先載入遊戲。',language));
    const status=await fetch(base+'/api/ai-status',{headers});expect((await status.json()).message).toBe(translatedServiceText(catalog.find(row=>row[0].startsWith('LLM API 尚未設定完成'))![0],language));
    const media=await fetch(base+'/api/media/invalid',{headers});expect(await media.text()).toBe(serviceError('Not found',language));
    const invalid=await fetch(base+'/api/editor',{method:'POST',headers:{...headers,Origin:base},body:'{'});expect(invalid.status).toBe(400);expect((await invalid.json()).error).toBe(serviceError('操作失敗。',language));
   }
  }finally{await app.stop();}
 });
});
