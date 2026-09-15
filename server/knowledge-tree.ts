import {readdirSync,lstatSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {knowledgeRoot,safeKnowledgePath,knowledgeFiles} from './knowledge';
export function knowledgeTree(){
 knowledgeFiles();const entries:{path:string;directory:boolean;bytes:number}[]=[];
 function walk(path:string){for(const e of readdirSync(path?safeKnowledgePath(path):knowledgeRoot(),{withFileTypes:true})){
  const p=path?path+'/'+e.name:e.name;const resolved=safeKnowledgePath(p);entries.push({path:p,directory:e.isDirectory(),bytes:e.isDirectory()?0:lstatSync(resolved).size});if(e.isDirectory())walk(p);
 }}walk('');return entries;
}
export function deleteKnowledgePath(path:string){
 const target=safeKnowledgePath(path);if(!existsSync(target))throw Error('檔案已不存在，請重新整理。');
 // Validate every descendant before any recursive filesystem mutation.
 const entries=knowledgeTree();for(const e of entries.filter(e=>e.path===path||e.path.startsWith(path+'/')))safeKnowledgePath(e.path);
 rmSync(target,{recursive:lstatSync(target).isDirectory()});
}
export function createKnowledgeFolder(path:string){const target=safeKnowledgePath(path);if(existsSync(target))throw Error('名稱已存在。');if(path.split('/').length>6)throw Error('資料夾過深。');mkdirSync(target,{recursive:true});}