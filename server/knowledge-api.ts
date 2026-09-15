import {isEditor,json,sameOrigin} from './repository';
import {generateKnowledge} from './knowledge-generate';
import {knowledgeTree,deleteKnowledgePath,createKnowledgeFolder} from './knowledge-tree';
import {catalog,limits,saveKnowledgeFiles,safeKnowledgePath,knowledgeRoot} from './knowledge';
import {readFileSync,lstatSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
export async function handle(req:Request){try{
 if(!await isEditor(req))return json({error:'請先登入 editor。'},401);
 if(req.method==='GET')return json({knowledge:catalog(),tree:knowledgeTree(),limits,root:knowledgeRoot()});
 sameOrigin(req);const raw=await req.text();if(raw.length>1500000)throw Error('上傳內容過大。');const a=JSON.parse(raw);
 if(a.type==='read'){const path=safeKnowledgePath(a.path);if(lstatSync(path).size>limits.fileBytes)throw Error('檔案超過64KB，請使用本機編輯器開啟。');let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path));if(text.includes('\0'))throw Error();}catch{throw Error('此檔案不是 UTF-8 文字，無法在文字編輯器開啟。');}return json({text});}
 if(a.type==='generate'){const generated=await generateKnowledge(a,req.signal);return json({generated,knowledge:catalog(),limits,root:knowledgeRoot()});}
 if(a.type==='delete')deleteKnowledgePath(a.path);
 else if(a.type==='mkdir')createKnowledgeFolder(a.path);
 else if(a.type==='save')saveKnowledgeFiles(a.files);
 else if(a.type==='toggle'){if(!catalog().some(s=>s.name===a.name))throw Error('知識不存在。');const p=safeKnowledgePath(a.name+'/.disabled');if(a.enabled){if(existsSync(p))unlinkSync(p);}else writeFileSync(p,'');}
 else throw Error('未知操作。');return json({knowledge:catalog(),tree:knowledgeTree(),limits,root:knowledgeRoot()});
 }catch(e){return json({error:e instanceof Error?e.message:String(e)},400);}}