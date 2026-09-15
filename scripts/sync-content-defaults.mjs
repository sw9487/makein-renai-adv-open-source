import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {authoredContentDefaults} from '../core/content-defaults.ts';

const source=authoredContentDefaults();
for(const locale of ['zh-TW','ja','en']){
 const file=fileURLToPath(new URL(`../web/locales/${locale}.json`,import.meta.url));
 const catalog=JSON.parse(readFileSync(file,'utf8'));
 catalog.contentDefaults=locale==='zh-TW'
  ? source
  : Object.fromEntries(Object.entries(catalog.contentDefaults??{}).filter(([key,value])=>
    key in source&&value!==source[key]));
 writeFileSync(file,JSON.stringify(catalog,null,2)+'\n');
 console.log(`${locale}: ${Object.keys(catalog.contentDefaults).length} default fields`);
}
