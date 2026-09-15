const officialPlaceImages = new Set([
  'bontoraya-main', 'gusto-toyohashi', 'seibunkan-main',
  'toyohashi-central-library', 'toyohashi-city-hall',
  'toyohashi-public-hall', 'underground-resources-museum',
  'waltz-toyohashi', 'yamasa-main',
  'uno-uno', 'bon-senga', 'murata-takoyaki', 'housendo-kalmia',
  'yamasa-west', 'coffee-canele', 'miyako-udon',
]);

/** Only bundled scenery has a JPEG derivative. Uploaded artwork keeps its original URL. */
export function optimizedSceneUrl(source: string): string {
  if (/^\/assets\/authored\/(?:backgrounds|cg)\/00000000-0000-4000-8000-000000000(?:10[1-9]|11[01]|20[1-6])\.png$/.test(source))
    return source.replace(/\.png$/, '.jpg');
  const place = /^\/assets\/places-official\/([a-z-]+)\.png$/.exec(source)?.[1];
  return place && officialPlaceImages.has(place) ? source.replace(/\.png$/, '.jpg') : source;
}

const decoded = new Map<string, HTMLImageElement>();

function decodeImage(url: string): Promise<boolean> {
  if (decoded.has(url)) return Promise.resolve(true);
  return new Promise(resolve => {
    const image = new Image();
    let finished = false;
    const timeout = setTimeout(() => finish(false), 30000);
    function finish(loaded: boolean) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (loaded) {
        decoded.delete(url);
        decoded.set(url, image);
        while (decoded.size > 4) decoded.delete(decoded.keys().next().value!);
      }
      resolve(loaded);
    }
    image.onload = () => {
      if (typeof image.decode === 'function') void image.decode().then(() => finish(true), () => finish(false));
      else finish(true);
    };
    image.onerror = () => finish(false);
    image.src = url;
    if (image.complete && image.naturalWidth) image.onload(new Event('load'));
  });
}

/** Resolves only after decoding; falls back to the original if a derivative is missing. */
export async function preloadSceneImage(source: string): Promise<{url: string; loaded: boolean}> {
  if (!source) return {url: '', loaded: true};
  const preferred = optimizedSceneUrl(source);
  if (await decodeImage(preferred)) return {url: preferred, loaded: true};
  if (preferred !== source && await decodeImage(source)) return {url: source, loaded: true};
  return {url: source, loaded: false};
}
