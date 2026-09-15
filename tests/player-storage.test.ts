import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeRuntime,assets} from '../server/runtime';
import {POST} from '../server/editor-api';
import {defaultContent} from '../core/content';
import {read} from '../server/repository';

test('development uploads and editor saves remain in player storage',async()=>{
 const root=mkdtempSync(join(tmpdir(),'player-storage-')),project=join(root,'project'),data=join(root,'data');
 mkdirSync(join(project,'content'),{recursive:true});writeFileSync(join(project,'content/game.json'),JSON.stringify(defaultContent));
 const before=readFileSync(join(project,'content/game.json'),'utf8');
 const close=initializeRuntime({projectDir:project,dataDir:data,port:9487,env:{}});
 try{
  const key=crypto.randomUUID()+'.png';await assets().put(key,new Uint8Array([137,80,78,71]).buffer,{httpMetadata:{contentType:'image/png'}});
  expect(existsSync(join(data,'uploads',key))).toBe(true);expect(existsSync(join(project,'content/assets',key))).toBe(false);
  const c=structuredClone(defaultContent);c.settings.town='本機自訂';
  const response=await POST(new Request('http://localhost:9487/api/editor',{method:'POST',headers:{Origin:'http://localhost:9487'},body:JSON.stringify({type:'content',revision:0,content:c})}));
  expect(response.status).toBe(200);expect((await response.json()).sourceSaved).toBe(false);
  expect((await read<any>('content',{})).settings.town).toBe('本機自訂');expect(readFileSync(join(project,'content/game.json'),'utf8')).toBe(before);
 }finally{close();rmSync(root,{recursive:true,force:true});}
});
