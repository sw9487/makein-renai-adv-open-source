import {apiFetch} from './api-fetch';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Content } from '../core/types';

/** Import image bytes, keeping attribution URLs untouched. Never download HTML as an image. */
export async function localizeImages(input:Content, directory:string, prefix='/assets/authored/') {
  const c=structuredClone(input);
  mkdirSync(directory,{recursive:true});
  const cache=new Map<string,string>();
  async function image(url:string,category:string) {
    if(!/^https:\/\//i.test(url)) return url;
    const folder=prefix==='/assets/authored/'?category+'/':'';
    const cacheKey=folder+url;
    if(cache.has(cacheKey)) return cache.get(cacheKey)!;
    const response=await apiFetch(url,{headers:{Accept:'image/png,image/jpeg,image/webp'}});
    if(!response.ok) throw Error(`圖片下載失敗 (${response.status})：${new URL(url).hostname}`);
    if(Number(response.headers.get('content-length'))>12*1024*1024) throw Error('圖片超過 12 MB。');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>12*1024*1024) throw Error('圖片超過 12 MB。');
    const ext=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'?'webp':null;
    if(!ext) throw Error('僅能匯入 PNG、JPEG、WebP 圖片，不能使用網頁連結。');
    const name=createHash('sha256').update(bytes).digest('hex')+'.'+ext;
    const path=join(directory,folder,name);
    mkdirSync(dirname(path),{recursive:true});
    if(!existsSync(path)) writeFileSync(path,bytes,{flag:'wx'});
    const local=prefix+folder+name;
    cache.set(cacheKey,local);
    return local;
  }
  for(const ch of c.characters) {
    if(ch.avatar) ch.avatar=await image(ch.avatar,`avatars/${ch.id}`);
    if(ch.social?.twitterCover) ch.social.twitterCover=await image(ch.social.twitterCover,`covers/${ch.id}`);
    for(const key of Object.keys(ch.sprites)) ch.sprites[key]=await image(ch.sprites[key],`sprites/${ch.id}`);
  }
  for(const account of c.publicAccounts??[]){account.avatar=await image(account.avatar,`avatars/public/${account.id}`);if(account.cover)account.cover=await image(account.cover,`covers/${account.id}`);}
  for(const p of c.places) p.background=await image(p.background,'backgrounds');
  for(const e of c.events) e.cg=await image(e.cg,'cg');
  for(const a of c.assets) a.url=await image(a.url,a.id.startsWith('novel-')?'books':'misc');
  return c;
}
