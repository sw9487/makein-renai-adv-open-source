import {describe,expect,test} from 'bun:test';
import {generationLanguageInstruction,resolveLanguage,withRequestLocale} from '../server/request-locale';

describe('request language',()=>{
 test('supports the three app languages and falls back to Japanese',()=>{
  expect(resolveLanguage('zh-TW,zh;q=0.9')).toBe('zh-Hant');
  expect(resolveLanguage('en-US')).toBe('en');
  expect(resolveLanguage('ja-JP')).toBe('ja');
  expect(resolveLanguage('fr-FR')).toBe('ja');
 });
 test('keeps concurrent generation language in request scope',async()=>{
  const [english,chinese]=await Promise.all([
   withRequestLocale(new Request('http://localhost',{headers:{'X-Makeine-Language':'en'}}),async()=>{await Promise.resolve();return generationLanguageInstruction();}),
   withRequestLocale(new Request('http://localhost',{headers:{'X-Makeine-Language':'zh-Hant'}}),async()=>{await Promise.resolve();return generationLanguageInstruction();}),
  ]);
  expect(english).toContain('natural English');
  expect(chinese).toContain('繁體中文');
 });
});
