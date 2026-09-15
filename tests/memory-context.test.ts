import {test,expect} from 'bun:test';
import {createGame,compactMemory,emptyMemory} from '../core/engine';
import {defaultContent} from '../core/content';
import {conversationMemoryMessages,datedMemory,reliableMemorySummary,socialMemoryContext} from '../server/memory-context';
import {withRequestLocale} from '../server/request-locale';

test('history retains game dates, elapsed days and channels including legacy LINE recovery',()=>{
 withRequestLocale(new Request('http://localhost/',{headers:{'X-Makeine-Language':'zh-Hant'}}),()=>{
 const s=createGame(defaultContent);s.date='2026-07-18';
 const entry={role:'user' as const,content:'你好',date:'2026-07-14',phase:2,channel:'line' as const};
 expect(datedMemory(entry,s,'anna')).toContain('2026-07-14 夜晚；line；距目前遊戲日期 4 天');
 s.messages.anna=[{from:'player',text:'你好',date:'2026-07-14'}];
 expect(datedMemory({role:'user',content:'你好'},s,'anna')).toContain('2026-07-14；line');
 s.messages.anna.push({from:'player',text:'你好',date:'2026-07-16'});
 expect(datedMemory({role:'user',content:'你好'},s,'anna')).toContain('日期未記錄');
 const memory=emptyMemory();memory.recent.push(entry);
 compactMemory(memory,2000,0);
 expect(memory.summary).toContain('2026-07-14 夜晚 line');
 });
});

test('Twitter events remain structured and never become ChatML conversation roles',()=>{
 const s=createGame(defaultContent),memory=emptyMemory();
 memory.recent.push(
  {role:'user',content:'ordinary LINE message',date:s.date,phase:s.phase,channel:'line'},
  {role:'user',content:'arbitrary social text',date:s.date,phase:s.phase,channel:'twitter',social:{platform:'twitter',owner:'anna',ownerName:'八奈見杏菜',actorId:'kaju',actorName:'温水佳樹',eventType:'reply',postId:'reply-id',postAuthor:'kaju',postAuthorName:'温水佳樹',targetId:'anna',targetName:'八奈見杏菜'}},
 );
 expect(conversationMemoryMessages(memory,s,'anna')).toHaveLength(1);
 expect(conversationMemoryMessages(memory,s,'anna')[0].content).toContain('ordinary LINE message');
 expect(socialMemoryContext(memory,s,'anna')).toEqual([{date:s.date,phase:s.phase,content:'arbitrary social text',platform:'twitter',owner:'anna',ownerName:'八奈見杏菜',actorId:'kaju',actorName:'温水佳樹',eventType:'reply',postId:'reply-id',postAuthor:'kaju',postAuthorName:'温水佳樹',targetId:'anna',targetName:'八奈見杏菜'}]);
});

test('legacy Twitter summaries without speaker identity are excluded instead of guessed',()=>{
 const memory=emptyMemory();memory.summary='stable fact\n[2026-07-18 白天 twitter]Twitter:ambiguous legacy event\nnew stable fact';
 expect(reliableMemorySummary(memory)).toBe('stable fact\nnew stable fact');
});
