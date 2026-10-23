// Image work done by Chrome itself (no image dependency): WebP encoding and greyscale samples.
import type { Page } from 'playwright-core';

/** Encodes a PNG as WebP in `page` (canvas encoder), optionally resized; `quality` is 0..1. */
export async function encodeWebp(page: Page, png: Buffer, o: { width?: number; height?: number; quality: number }): Promise<Buffer> {
  const b64 = await page.evaluate(async ({ src, width, height, quality }) => {
    const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0));
    const sized = width && height ? { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' as const } : {};
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), sized);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0);
    const out = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality })).arrayBuffer());
    let s = '';
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
    return btoa(s);
  }, { src: png.toString('base64'), ...o });
  return Buffer.from(b64, 'base64');
}

/** Encodes at `quality`, stepping down by 0.06 until the file fits `max` bytes (or quality hits 0.1). */
export async function encodeWithin(page: Page, png: Buffer, o: { width: number; height: number; quality: number; max: number }): Promise<Buffer> {
  for (let quality = o.quality; ; quality = Math.round((quality - 0.06) * 100) / 100) {
    const webp = await encodeWebp(page, png, { ...o, quality });
    if (webp.length <= o.max || quality <= 0.1) return webp;
  }
}

/** Greyscale values (0-255) of the PNG scaled to width × height, row by row. */
export function greyPixels(page: Page, png: Buffer, width: number, height: number): Promise<number[]> {
  return page.evaluate(async ({ src, width, height }) => {
    const bytes = Uint8Array.from(atob(src), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    const ctx = new OffscreenCanvas(width, height).getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, width, height).data;
    return Array.from({ length: width * height }, (_, i) => Math.round(0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!));
  }, { src: png.toString('base64'), width, height });
}
