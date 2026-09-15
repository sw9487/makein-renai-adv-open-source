import ts from 'typescript';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
async function files(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){if(entry.name==='ui')continue;const path=join(directory,entry.name);if(entry.isDirectory())result.push(...await files(path));else if(/\.tsx?$/.test(entry.name))result.push(path);}return result;}
const sources=await files(join(root,'web','components'));
const values=new Set();
for(const path of sources){
 const text=await readFile(path,'utf8');
 const source=ts.createSourceFile(relative(root,path),text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const visit=node=>{
  let value='';
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node))value=node.text;
  else if(ts.isJsxText(node))value=node.text.replace(/\s+/g,' ');
  value=value.trim();if(value&&/[\u3400-\u9fff]/.test(value))values.add(value);
  ts.forEachChild(node,visit);
 };
 visit(source);
}
const input=[...values].sort((a,b)=>a.localeCompare(b));
const batches=[];let batch=[],length=0;
for(const value of input){if(batch.length>=20||length+value.length>3500){batches.push(batch);batch=[];length=0;}batch.push(value);length+=value.length;}if(batch.length)batches.push(batch);

async function translate(language){
 const output={};let offset=0;
 const request=async body=>{for(let attempt=0;attempt<5;attempt++){const response=await fetch('https://translate.googleapis.com/translate_a/single',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(response.ok)return response.json();if(response.status!==429||attempt===4)throw Error(`Translation request failed: HTTP ${response.status}`);await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));}};
 const one=async value=>{const data=await request(new URLSearchParams({client:'gtx',sl:'zh-TW',tl:language,dt:'t',q:value}));return (data[0]??[]).map(item=>item[0]).join('').trim();};
 for(const group of batches){
  const body=new URLSearchParams({client:'gtx',sl:'zh-TW',tl:language,dt:'t',q:group.map((value,index)=>`§${String(offset+index).padStart(4,'0')}§${value}`).join('\n')});
  const data=await request(body);const translated=(data[0]??[]).map(item=>item[0]).join('');
  const matches=[...translated.matchAll(/§(\d{4})§\s*([\s\S]*?)(?=\n§\d{4}§|$)/g)];
  if(matches.length!==group.length){const translatedGroup=await Promise.all(group.map(one));group.forEach((source,index)=>output[source]=translatedGroup[index]);}
  else for(const match of matches)output[input[Number(match[1])]]=match[2].trim();
  offset+=group.length;
 }
 return output;
}
const ja=await translate('ja'),en=await translate('en');
const catalogPaths=Object.fromEntries(['ja','zh-TW','en'].map(locale=>[locale,join(root,'web','locales',locale+'.json')]));
const catalogs=Object.fromEntries(await Promise.all(Object.entries(catalogPaths).map(async([locale,path])=>[locale,JSON.parse(await readFile(path,'utf8'))])));
const idBySource=new Map(Object.entries(catalogs['zh-TW'].legacy).map(([id,text])=>[text,id]));
const used=new Set(idBySource.values());
for(const source of input)if(!idBySource.has(source)){
 let base=en[source].normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').toLowerCase().split('_').slice(0,16).join('_');
 if(!base||!/^[a-z]/.test(base))base='message_'+base;
 let id=base,n=2;while(used.has(id))id=base+'_'+n++;
 used.add(id);idBySource.set(source,id);
}
for(const [locale,translated] of [['ja',ja],['zh-TW',null],['en',en]]){
 const entries={...catalogs[locale].legacy};
 for(const source of input){const id=idBySource.get(source);entries[id]=translated?translated[source]:source;}
 catalogs[locale].legacy=entries;
 await writeFile(catalogPaths[locale],JSON.stringify(catalogs[locale],null,2)+'\n','utf8');
}
console.log(`Generated ${input.length} UI translations for Japanese and English.`);
