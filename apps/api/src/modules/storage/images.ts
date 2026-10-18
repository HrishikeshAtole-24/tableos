import sharp from 'sharp';
import type { Storage } from './storage';

export const IMAGE_WIDTHS = [320, 640, 960] as const;

/** Storage path of an uploaded file from its public URL, if it is one of ours. */
export function pathFromPublicUrl(url: string): string | null {
  const m = url.match(/\/(r\/[0-9a-f-]{36}\/[a-z]+\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif))$/i);
  return m ? m[1]! : null;
}

/**
 * image.resize job: three widths in AVIF and WebP next to the original
 * (`<name>-640.webp` etc.). Idempotent: re-running overwrites the same paths.
 */
export async function resizeImage(storage: Storage, path: string): Promise<string[]> {
  const original = await storage.download(path);
  const base = path.replace(/\.[a-z]+$/i, '');
  const written: string[] = [];
  for (const width of IMAGE_WIDTHS) {
    const pipeline = sharp(original, { failOn: 'error' }).rotate().resize({ width, withoutEnlargement: true });
    const [webp, avif] = await Promise.all([pipeline.clone().webp({ quality: 74 }).toBuffer(), pipeline.clone().avif({ quality: 52 }).toBuffer()]);
    await storage.upload(`${base}-${width}.webp`, webp, 'image/webp');
    await storage.upload(`${base}-${width}.avif`, avif, 'image/avif');
    written.push(`${base}-${width}.webp`, `${base}-${width}.avif`);
  }
  return written;
}
