import {existsSync} from 'node:fs';
const base='http://localhost:9487';
const d=await(await fetch(base+'/api/editor')).json();const c=d.content;
const urls=[...new Set<string>([...c.characters.flatMap((ch:any)=>[ch.avatar,...Object.values(ch.sprites)]),...c.places.map((p:any)=>p.background),...c.events.map((e:any)=>e.cg),...c.assets.map((a:any)=>a.url)].filter(Boolean))];
for(const u of urls){const r=await fetch(base+u);if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw Error(u+' '+r.status);}
const html=await(await fetch(base+'/editor')).text();const script=html.match(/src="([^"]+\.js)"/)![1];const js=await(await fetch(base+script)).text();
const result={scenes:c.places.filter((p:any)=>p.background).length,totalScenes:c.places.length,eventImages:c.events.filter((e:any)=>e.cg).length,totalEvents:c.events.length,verifiedImages:urls.length,servedBundle:script,hasImagePicker:js.includes('更換圖片')&&js.includes('image-picker-preview'),hasOldImagePathField:js.includes('背景圖片網址'),duplicateFolder:existsSync(new URL('../dist/client/assets/authored',import.meta.url))};
console.log(result);
if(result.scenes!==result.totalScenes||result.eventImages!==result.totalEvents||!result.hasImagePicker||result.hasOldImagePathField||result.duplicateFolder)throw Error('Local verification failed');
const source=await Bun.file(new URL('../content/game.json',import.meta.url)).json();if(JSON.stringify(c)!==JSON.stringify(source))throw Error('source differs');
console.log('Editor DB and source snapshot match; all images served locally.');
