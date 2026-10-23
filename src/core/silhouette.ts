import type { ExtractedPage } from './types.ts';

/** One bar of a page's silhouette, in a 320×200 box (the shape of a 1280×800 top of page). */
export interface SilhouetteBar {
  kind: 'title' | 'heading' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 320;
const H = 200;
const M = 12;
const LINE = 64;

/**
 * A text outline of a page's top: a title bar, one bar per heading (thicker for higher levels) and a few thin lines per
 * paragraph, list items indented, each as wide as its text. Deterministic and network-free (live filmstrip, D25).
 */
export function silhouette(page: Pick<ExtractedPage, 'title' | 'blocks'>): SilhouetteBar[] {
  const span = (chars: number, x: number) => Math.max(12, Math.min(W - M - x, chars * 3.2));
  const bars: SilhouetteBar[] = [{ kind: 'title', x: M, y: M, w: span(page.title.length || 20, M), h: 10 }];
  let y = M + 18;
  for (const b of page.blocks) {
    if (y > H - M) break;
    if (b.kind === 'heading') {
      const h = Math.max(4, 9 - (b.level ?? 2));
      bars.push({ kind: 'heading', x: M, y: y + 3, w: span(b.text.length, M), h });
      y += h + 8;
      continue;
    }
    const x = b.kind === 'paragraph' ? M : M + 10;
    const lines = Math.min(4, Math.ceil(b.text.length / LINE));
    for (let i = 0; i < lines && y <= H - M; i++, y += 6) {
      const rest = b.text.length - i * LINE;
      bars.push({ kind: 'text', x, y, w: rest >= LINE ? W - M - x : span(rest, x), h: 3 });
    }
    y += 4;
  }
  return bars;
}
