import books from '../content/novel-books.json';
import type { Content } from './types';

/** Add later volumes to existing libraries without replacing edited assets. */
export function addNovelBooks(content: Content): Content {
  content = { ...content, assets: content.assets.map(a => a.id === 'novel-8.5' ? {...a, id:'novel-8-5'} : a) };
  const marker='novel-books-v1';
  if(content.storyPacks?.includes(marker))return content;
  content={...content,storyPacks:[...(content.storyPacks??[]),marker]};
  const ids = new Set(content.assets.map(asset => asset.id));
  const missing = books.filter(book => !ids.has(book.id));
  if (!missing.length) return content;
  const assets = [...content.assets];
  let lastBook = -1;
  assets.forEach((asset, index) => { if (asset.id.startsWith('novel-')) lastBook = index; });
  assets.splice(lastBook + 1, 0, ...structuredClone(missing));
  return { ...content, assets };
}
