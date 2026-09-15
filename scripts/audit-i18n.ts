import ts from 'typescript';
import {existsSync,readFileSync} from 'node:fs';
import zhTw from '../web/locales/zh-TW.json';
import {serviceCatalog as service} from '../core/service-i18n';
import {execFileSync} from 'node:child_process';
import {translatedServiceText} from '../core/service-i18n';

const found=new Map<string,Set<string>>();
const untranslated:string[]=[];
const englishUi:string[]=[];
const destructuredT=new Set<string>();
const usedKeys=new Set<string>();
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(file=>existsSync(file)&&/^(server|core|web|cli|bin|scripts)\//.test(file)&&/\.(tsx?|mjs)$/.test(file));
for(const file of tracked){
 if(file.includes('audit-i18n'))continue;
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(node:ts.Node){
  let value='';
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node))value=node.text.trim();
  if(ts.isTemplateExpression(node))value=node.head.text+node.templateSpans.map((s,i)=>`{${i}}`+s.literal.text).join('');
  if(value){
   const parent=node.parent;
   const directError=(ts.isCallExpression(parent)||ts.isNewExpression(parent))&&(/^(?:Error|ImageFailure|ModelError)$/.test(parent.expression.getText(source)))&&parent.arguments?.[parent.expression.getText(source)==='ModelError'?1:0]===node;
   const assertion=ts.isCallExpression(parent)&&parent.expression.getText(source)==='assert'&&parent.arguments[1]===node;
   const errorField=ts.isPropertyAssignment(parent)&&parent.name.getText(source)==='error';
   if((directError||assertion||errorField)&&/^(server|core)\//.test(file)&&translatedServiceText(value.replace(/\{\d+\}/g,'123'),'en')===undefined)untranslated.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1} ${value}`);
    if((ts.isJsxText(node)||(ts.isJsxAttribute(parent)&&['title','aria-label','placeholder','alt'].includes(parent.name.getText(source))))&&/[A-Za-z]/.test(value)&&!/[\u3400-\u9fff]/.test(value))englishUi.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1} ${value}`);
  }
  if(value&&(/[\u3400-\u9fff]/.test(value)||/Error|error|not found|failed|denied/i.test(value))){
   const location=source.getLineAndCharacterOfPosition(node.getStart(source));
   const list=found.get(value)??new Set();list.add(`${file.replaceAll('\\','/')}:${location.line+1}`);found.set(value,list);
  }
  if(ts.isCallExpression(node)){
   const callee=node.expression.getText(source);
   if(callee==='uiText'){const arg=node.arguments[0];if(arg&&ts.isStringLiteral(arg))usedKeys.add(arg.text);}
   else if(callee==='t'||destructuredT.has(callee)){const arg=node.arguments[0];if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)))usedKeys.add(arg.text);}
  }
  if(ts.isCallExpression(node)){
   const name=node.expression.getText(source);
   if(name.endsWith('useI18n')||name==='useI18n'){
    const p=node.parent;
    if(ts.isVariableDeclaration(p)&&ts.isObjectBindingPattern(p.name)&&p.name.elements.some(el=>ts.isBindingElement(el)&&el.name&&ts.isIdentifier(el.name)&&(el.propertyName&&ts.isIdentifier(el.propertyName)?el.propertyName.text:el.name.text)==='t')){
     for(const el of p.name.elements)if(ts.isBindingElement(el)&&el.name&&ts.isIdentifier(el.name)&&(el.propertyName&&ts.isIdentifier(el.propertyName)?el.propertyName.text:el.name.text)==='t')destructuredT.add(el.name.text);
    }
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
const mode=process.argv[2];
if(mode==='check'){
 const uncoveredUi=[...found].filter(([source,locations])=>/[\u3400-\u9fff]/.test(source)&&source!=='日本新年假期'&&[...locations].some(path=>path.startsWith('web/components/')));
 const catalogKeys=new Set(Object.keys((zhTw as {messages?:Record<string,string>}).messages??{}));
 const missingKeys=[...usedKeys].filter(key=>!catalogKeys.has(key)).sort();
 console.log(`Scanned ${tracked.length} tracked source files; ${untranslated.length} uncovered literal API/domain errors; ${uncoveredUi.length} uncovered Chinese UI literals; ${englishUi.length} uncovered English UI literals; ${missingKeys.length} translation keys missing from the catalogs.`);
 for(const item of untranslated)console.log(item);
 for(const [source,locations] of uncoveredUi)console.log(`${[...locations].join(', ')}: ${source.slice(0,120)}`);
 for(const item of englishUi)console.log(item);
 for(const key of missingKeys)console.log(`missing catalog key: ${key}`);
 process.exit(untranslated.length||uncoveredUi.length||englishUi.length||missingKeys.length?1:0);
}
if(mode==='english-ui'){for(const item of englishUi)console.log(item);process.exit(0);}
for(const [source,locations] of found){
 if(mode==='ui'&&(![...locations].some(p=>p.startsWith('web/components/'))||service.some(row=>row.includes(source))))continue;
 if(mode==='server'&&(![...locations].some(p=>p.startsWith('server/'))||service.some(row=>row[0]===source)))continue;
 console.log(JSON.stringify({source,locations:[...locations]}));
}
