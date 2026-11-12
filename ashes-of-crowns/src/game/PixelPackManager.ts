export interface PixelPackAsset { key: string; file: string; width: number; height: number; objectUrl: string; }
export interface PixelPackDownload { assets: PixelPackAsset[]; objectUrls: string[]; }
interface PixelPackManifest { version: string; assets: Array<{ key: string; file: string; width: number; height: number }>; }
const CACHE_NAME = 'aoc-pixel-art-pack-v1';

async function readManifest(): Promise<{ manifest: PixelPackManifest; url: string }> {
  const url = new URL('data/packs/pixel-v1/manifest.json', document.baseURI).toString();
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Manifest request failed (' + response.status + ')');
  const manifest = await response.json() as PixelPackManifest;
  if (!manifest.version || !Array.isArray(manifest.assets) || manifest.assets.length === 0) throw new Error('Pixel pack manifest is invalid');
  return { manifest, url };
}
export async function isPixelPackInstalled(): Promise<boolean> {
  if (!('caches' in globalThis)) return false;
  const { manifest, url } = await readManifest();
  const cache = await caches.open(CACHE_NAME);
  for (const asset of manifest.assets) if (!await cache.match(new URL(asset.file, url).toString())) return false;
  return true;
}
/** Downloads the optional art pack once and keeps it in Cache Storage for later sessions. */
export async function downloadPixelPack(onProgress: (completed: number, total: number) => void = () => undefined): Promise<PixelPackDownload> {
  if (!('caches' in globalThis)) throw new Error('This browser does not support offline asset storage');
  const { manifest, url } = await readManifest();
  const cache = await caches.open(CACHE_NAME);
  const assets: PixelPackAsset[] = [];
  const objectUrls: string[] = [];
  try {
    for (let index = 0; index < manifest.assets.length; index++) {
      const asset = manifest.assets[index];
      const assetUrl = new URL(asset.file, url).toString();
      let response = await cache.match(assetUrl);
      if (!response) {
        response = await fetch(assetUrl);
        if (!response.ok) throw new Error('Asset request failed (' + response.status + '): ' + asset.file);
        await cache.put(assetUrl, response.clone());
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      objectUrls.push(objectUrl);
      assets.push({ ...asset, objectUrl });
      onProgress(index + 1, manifest.assets.length);
    }
    return { assets, objectUrls };
  } catch (error) {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    throw error;
  }
}
