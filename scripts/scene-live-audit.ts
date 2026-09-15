// Run explicitly; uses one real model scene request in disposable state.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initializeRuntime} from '../server/runtime';
import {defaultContent} from '../core/content';
import {createGame} from '../core/engine';
import {enlivenScene} from '../server/scene';
import {withRequestLocale} from '../server/request-locale';
if(!process.argv.includes('--live'))throw Error('Pass --live to use the configured LLM.');
if(!process.env.AI_API_KEY||!process.env.AI_API_URL||!process.env.AI_MODEL)throw Error('Missing AI environment settings.');
const dir=mkdtempSync(join(tmpdir(),'scene-live-audit-')),close=initializeRuntime({dataDir:dir,port:0,env:{AI_API_KEY:process.env.AI_API_KEY,AI_API_URL:process.env.AI_API_URL,AI_MODEL:process.env.AI_MODEL}});
try{
 const s=createGame(defaultContent);s.character='lemon';s.met.push('lemon');s.phase=0;s.date='2026-09-07';s.location='classroom';
 s.dialogue={speaker:'焼塩檸檬',kind:'original',choiceMode:'contextual',text:'你看起來好像有話想說？還是單純在想午餐要吃什麼？',choices:[{text:'聊聊今天的課程。',delta:2,reply:'聊課程。'},{text:'問問對方最近過得如何。',delta:2,reply:'聊近況。'},{text:'打聲招呼，先回教室。',delta:0,reply:'道別。'}]};
 await withRequestLocale(new Request('http://localhost',{headers:{'x-makeine-language':'zh-Hant'}}),()=>enlivenScene(s,defaultContent));
 console.log(JSON.stringify({lines:s.dialogue.script,choices:s.dialogue.choices},null,2));
}finally{close();rmSync(dir,{recursive:true,force:true});}
