/** Width and height of a WebP file, from its RIFF header (lossy `VP8 `, lossless `VP8L` or extended `VP8X`). Pure. */
export function webpSize(b: Uint8Array): { w: number; h: number } {
  const tag = (at: number) => String.fromCharCode(...b.subarray(at, at + 4));
  const u16 = (at: number) => b[at]! | (b[at + 1]! << 8);
  const u24 = (at: number) => u16(at) | (b[at + 2]! << 16);
  if (b.length < 30 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('not a WebP file');
  switch (tag(12)) {
    case 'VP8 ':
      return { w: u16(26) & 0x3fff, h: u16(28) & 0x3fff };
    case 'VP8L': {
      const bits = u16(21) | (u16(23) << 16);
      return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case 'VP8X':
      return { w: u24(24) + 1, h: u24(27) + 1 };
    default:
      throw new Error(`unknown WebP chunk "${tag(12)}"`);
  }
}
