import {expect,test} from 'bun:test';
import {defaultContent} from '../core/content';
import {addNovelBooks} from '../core/novel-books';
import books from '../content/novel-books.json';

test('public release contains no novel-cover library records',()=>{
 expect(books).toEqual([]);
 expect(defaultContent.assets.some(asset=>asset.url.includes('/books/'))).toBe(false);
 expect(addNovelBooks(structuredClone(defaultContent)).assets.some(asset=>asset.url.includes('/books/'))).toBe(false);
});
