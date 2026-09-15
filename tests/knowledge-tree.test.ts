import {test,expect} from 'bun:test';
import {mkdtempSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeRuntime} from '../server/runtime';
import {saveKnowledgeFiles,safeKnowledgePath,catalog} from '../server/knowledge';
import {createKnowledgeFolder,deleteKnowledgePath,knowledgeTree} from '../server/knowledge-tree';
test('knowledge tree includes empty folders, supports edits and deletes complete subtrees only',()=>{
 const close=initializeRuntime({dataDir:mkdtempSync(join(tmpdir(),'knowledge-tree-')),port:19501,env:{}});
 try{
  saveKnowledgeFiles([{path:'sample/KNOWLEDGE.md',text:'---\nname: sample\ndescription: test\n---\nHello'}]);
  createKnowledgeFolder('sample/references/empty');expect(knowledgeTree()).toContainEqual({path:'sample/references/empty',directory:true,bytes:0});
  saveKnowledgeFiles([{path:'sample/references/note.md',text:'First'}]);saveKnowledgeFiles([{path:'sample/references/note.md',text:'Updated'}]);
  expect(()=>deleteKnowledgePath('../')).toThrow();expect(()=>deleteKnowledgePath('')).toThrow();
  deleteKnowledgePath('sample/references');expect(existsSync(safeKnowledgePath('sample/references'))).toBe(false);expect(catalog()).toHaveLength(1);
  deleteKnowledgePath('sample/KNOWLEDGE.md');expect(catalog()).toHaveLength(0);expect(knowledgeTree().some(e=>e.path==='sample')).toBe(true);
  deleteKnowledgePath('sample');expect(knowledgeTree()).toHaveLength(0);
 }finally{close();}
});
