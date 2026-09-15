import ts from 'typescript';
import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ja from '../web/locales/ja.json';
import zt from '../web/locales/zh-TW.json';
import en from '../web/locales/en.json';

const catalogs:{lang:string;messages:Record<string,string>}[]=[
 {lang:'ja',messages:ja.messages},
 {lang:'zh-TW',messages:zt.messages},
 {lang:'en',messages:en.messages},
];

const keySets=catalogs.map(c=>new Set(Object.keys(c.messages)));
// report per-lang key count
for(const c of catalogs){
 console.log(`[count] ${c.lang}.messages = ${Object.keys(c.messages).length} keys`);
}

const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(file=>existsSync(file)&&/^(web|server|core|cli|bin|scripts)\//.test(file)&&/\.(tsx?|mjs)$/.test(file)&&!file.includes('check-i18n-keys')&&!file.includes('audit-i18n'));

const used=new Map<string,Set<string>>();
const callNames=new Set(['t','uiText']);
const destructuredT=new Set<string>();

function collect(file:string){
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(node:ts.Node){
  // identify destructured const { t } = useI18n() aliases
  if(ts.isCallExpression(node)){
   const name=node.expression.getText(source);
   if(name.endsWith('useI18n')||name==='useI18n'){
    const parent=node.parent;
    if(ts.isVariableDeclaration(parent)){
     let id=parent.name;
     if(ts.isObjectBindingPattern(id)){
      for(const el of id.elements){
       if(ts.isBindingElement(el)&&el.name&&ts.isIdentifier(el.name)){
        const propName=el.propertyName&&ts.isIdentifier(el.propertyName)?el.propertyName.text:el.name.text;
        if(propName==='t'){destructuredT.add(el.name.text);}
       }
      }
     }
    }
   }
  }
  if(ts.isCallExpression(node)){
   const callee=node.expression;
   const calleeText=callee.getText(source);
   if(calleeText==='uiText'){
    const arg=node.arguments[0];
    if(arg&&ts.isStringLiteral(arg)){
     const key=arg.text;
     if(!used.has(key))used.set(key,new Set());
     used.get(key)!.add(file.replaceAll('\\','/')+':'+source.getLineAndCharacterOfPosition(node.getStart(source)).line+1);
    }
   } else if(calleeText==='t'||destructuredT.has(calleeText)){
    const arg=node.arguments[0];
    if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))){
     const key=arg.text;
     if(!used.has(key))used.set(key,new Set());
     used.get(key)!.add(file.replaceAll('\\','/')+':'+source.getLineAndCharacterOfPosition(node.getStart(source)).line+1);
    }
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}

for(const file of tracked)collect(file);

let bad=0;
for(const [key,locations] of used){
 for(let i=1;i<keySets.length;i++){
  if(!keySets[i].has(key)){
   bad++;
   console.log(`[missing in ${catalogs[i].lang}] "${key}" used at ${[...locations].join(', ')}`);
  }
 }
}
console.log(`\nTotal distinct translation keys used: ${used.size}`);
console.log(`Missing-key errors: ${bad}`);
process.exit(bad?1:0);