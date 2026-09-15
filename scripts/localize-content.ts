import { localizeImages } from '../server/localize-images';
import { repairPortraits,upgradeRoster } from '../core/roster';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultContent } from '../core/content';
const file=new URL('../content/game.json',import.meta.url);
const before=repairPortraits(upgradeRoster(await Bun.file(file).json()));
const after=await localizeImages(before,fileURLToPath(new URL('../content/assets',import.meta.url)));
const mappingFile=new URL('../content/portrait-urls.json',import.meta.url);
const map:Record<string,string>=await Bun.file(mappingFile).exists()?await Bun.file(mappingFile).json():{};
for(const [i,ch] of before.characters.entries()) {
 if(ch.avatar?.startsWith('https://')) map[ch.avatar]=after.characters[i].avatar!;
 for(const [k,url] of Object.entries(ch.sprites)) if(url.startsWith('https://')) map[url]=after.characters[i].sprites[k];
}
for(const asset of defaultContent.assets) if(asset.url.startsWith('https://')){
 const local=after.assets.find(a=>a.id===asset.id)?.url;
 if(local?.startsWith('/assets/authored/')) map[asset.url]=local;
}
writeFileSync(file,JSON.stringify(after,null,2)+'\n');
writeFileSync(mappingFile,JSON.stringify(map,null,2)+'\n');
console.log(`Imported ${Object.keys(map).length} portrait URLs into content/assets.`);
