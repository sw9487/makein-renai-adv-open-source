import {expect,test} from 'bun:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {optimizedSceneUrl,preloadSceneImage} from '../web/lib/scene-images';
import {startServer} from '../server/http';

test('only bundled scenery uses the smaller derivative',()=>{
  expect(optimizedSceneUrl('/assets/authored/backgrounds/00000000-0000-4000-8000-000000000109.png')).toEndWith('.jpg');
  expect(optimizedSceneUrl('/assets/places-official/toyohashi-city-hall.png')).toEndWith('.jpg');
  expect(optimizedSceneUrl('/assets/places-official/uno-uno.png')).toBe('/assets/places-official/uno-uno.jpg');
  expect(optimizedSceneUrl('/assets/authored/user-upload.png')).toBe('/assets/authored/user-upload.png');
  expect(optimizedSceneUrl('/api/media/generated.png')).toBe('/api/media/generated.png');
});

test('preload waits for decode and falls back when a derivative fails',async()=>{
  const oldImage=(globalThis as {Image?:typeof Image}).Image;
  class FakeImage {
    onload: ((event:Event)=>void)|null=null;
    onerror: (()=>void)|null=null;
    complete=false;
    naturalWidth=0;
    decode=()=>new Promise<void>(resolve=>setTimeout(resolve,15));
    set src(url:string){
      setTimeout(()=>{
        if(url.endsWith('.jpg'))this.onerror?.();
        else {this.complete=true;this.naturalWidth=100;this.onload?.(new Event('load'));}
      },5);
    }
  }
  (globalThis as {Image?:typeof Image}).Image=FakeImage as unknown as typeof Image;
  try{
    const source='/assets/authored/backgrounds/00000000-0000-4000-8000-000000000101.png';
    const started=Date.now();
    expect(await preloadSceneImage(source)).toEqual({url:source,loaded:true});
    expect(Date.now()-started).toBeGreaterThanOrEqual(20);
  }finally{(globalThis as {Image?:typeof Image}).Image=oldImage;}
});

test('authored assets expose cache validators for repeat loads',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'scene-assets-'));
  const app=startServer({port:0,dataDir:directory,env:{},clientDir:directory,projectDir:process.cwd(),version:'test'});
  const url=`http://127.0.0.1:${app.server.port}/assets/authored/backgrounds/00000000-0000-4000-8000-000000000109.jpg`;
  try{
    const first=await fetch(url);
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(first.headers.get('content-type')).toBe('image/jpeg');
    const etag=first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect((await first.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    const second=await fetch(url,{headers:{'If-None-Match':etag!}});
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  }finally{await app.stop();}
});

test('expression sprites revalidate when a bundled canvas is replaced',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'expression-cache-'));
  const app=startServer({port:0,dataDir:directory,env:{},clientDir:directory,projectDir:process.cwd(),version:'test'});
  try{
    const url=`http://127.0.0.1:${app.server.port}/assets/authored/sprites/anna/anna-happy-expression.png`;
    const first=await fetch(url);
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-cache');
    const etag=first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect((await fetch(url,{headers:{'If-None-Match':etag!}})).status).toBe(304);
  }finally{await app.stop();}
});
