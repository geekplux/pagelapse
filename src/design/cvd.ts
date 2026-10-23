/** Linear-RGB triple, each channel in [0, 1]. */
export type Rgb = [number, number, number];
/** Row-major 3×3 matrix applied to linear RGB. */
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];
export type CvdKind = 'protan' | 'deutan' | 'tritan';

/** Machado, Oliveira & Fernandes (2009) dichromacy matrices, severity 1.0, for linear RGB. */
export const MACHADO: Readonly<Record<CvdKind, Matrix3>> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

/** Rec. 709 luminance as a matrix (greyscale preview). */
export const GRAY: Matrix3 = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Parses `#RRGGBB` into linear RGB. */
export function hexToLinear(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #RRGGBB colour: ${hex}`);
  return [toLinear(parseInt(m[1]!, 16) / 255), toLinear(parseInt(m[2]!, 16) / 255), toLinear(parseInt(m[3]!, 16) / 255)];
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Applies a 3×3 matrix to a linear-RGB colour, clamped to the gamut. */
export function applyMatrix(m: Matrix3, [r, g, b]: Rgb): Rgb {
  return [clamp(m[0] * r + m[1] * g + m[2] * b), clamp(m[3] * r + m[4] * g + m[5] * b), clamp(m[6] * r + m[7] * g + m[8] * b)];
}

/** Linear RGB to OKLab (Ottosson 2020): [L, a, b]. */
export function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab distance ×100 between two hex colours, optionally after CVD simulation. */
export function deltaE(a: string, b: string, kind?: CvdKind): number {
  const sim = (hex: string) => {
    const lin = hexToLinear(hex);
    return linearToOklab(kind ? applyMatrix(MACHADO[kind], lin) : lin);
  };
  const [p, q] = [sim(a), sim(b)];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** OKLab lightness (0-1) of a hex colour. */
export const lightness = (hex: string) => linearToOklab(hexToLinear(hex))[0];

/** WCAG 2.x contrast ratio between two hex colours (1-21). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToLinear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
