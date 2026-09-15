/** Relative path inside content/assets. Reject traversal and encoded separators. */
export function authoredAssetPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/assets/authored/')) return null;
  const path = url.slice('/assets/authored/'.length);
  return /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:png|jpg|jpeg|webp)$/.test(path) ? path : null;
}
