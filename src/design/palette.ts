/**
 * Colour tokens: the single source of truth, mirrored in `tokens.css` (palette.test.ts keeps them equal).
 *
 * Radix Colors (https://www.radix-ui.com/colors), three scales used by their 12-step roles: 1-2 backgrounds,
 * 3-5 component backgrounds, 6-8 borders and hairlines, 9-10 solids, 11-12 text.
 * - sand: the neutral (text, hairlines, controls, magnitude bars).
 * - cyan: Before (the older capture) and removed words.
 * - amber: After (the newer capture), added words and the selected change. On white, amber marks use amber-11
 *   (amber-9 is under 3:1).
 * Plus two surfaces: `bg` (the page ground: white in light, sand-1 in dark) and `frame` (behind a picture: white in
 * light, sand-2 in dark).
 */
export const SCALES = ['sand', 'cyan', 'amber'] as const;
export type Scale = (typeof SCALES)[number];
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type Theme = 'light' | 'dark';

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const satisfies readonly Step[];

/** Every colour token, as named in tokens.css (`--sand-1` … `--amber-12`, `--bg`, `--frame`). */
export const TOKENS = [...SCALES.flatMap((s) => STEPS.map((n) => `${s}-${n}` as const)), 'bg', 'frame'] as const;
export type Token = `${Scale}-${Step}` | 'bg' | 'frame';

type Ramp = readonly [string, string, string, string, string, string, string, string, string, string, string, string];

/** Radix Colors 3, light and dark (the values in docs/redesign/target/V3Work.html). */
export const radix: Readonly<Record<Theme, Readonly<Record<Scale, Ramp>>>> = {
  light: {
    sand: ['#FDFDFC', '#F9F9F8', '#F1F0EF', '#E9E8E6', '#E2E1DE', '#DAD9D6', '#CFCECA', '#BCBBB5', '#8D8D86', '#82827C', '#63635E', '#21201C'],
    cyan: ['#FAFDFE', '#F2FAFB', '#DEF7F9', '#CAF1F6', '#B5E9F0', '#9DDDE7', '#7DCEDC', '#3DB9CF', '#00A2C7', '#0797B9', '#107D98', '#0D3C48'],
    amber: ['#FEFDFB', '#FEFBE9', '#FFF7C2', '#FFEE9C', '#FBE577', '#F3D673', '#E9C162', '#E2A336', '#FFC53D', '#FFBA18', '#AB6400', '#4F3422'],
  },
  dark: {
    sand: ['#111110', '#191918', '#222221', '#2A2A28', '#31312E', '#3B3A37', '#494844', '#62605B', '#6F6D66', '#7C7B74', '#B5B3AD', '#EEEEEC'],
    cyan: ['#0B161A', '#101B20', '#082C36', '#003848', '#004558', '#045468', '#12677E', '#11809C', '#00A2C7', '#23AFD0', '#4CCCE6', '#B6ECF7'],
    amber: ['#16120C', '#1D180F', '#302008', '#3F2700', '#4D3000', '#5C3D05', '#714F19', '#8F6424', '#FFC53D', '#FFD60A', '#FFCA16', '#FFE7B3'],
  },
};

const flatten = (theme: Theme, surfaces: Record<'bg' | 'frame', string>) =>
  Object.fromEntries([
    ...SCALES.flatMap((s) => STEPS.map((n) => [`${s}-${n}`, radix[theme][s][n - 1]!])),
    ...Object.entries(surfaces),
  ]) as Record<Token, string>;

export const palette: Readonly<Record<Theme, Readonly<Record<Token, string>>>> = {
  light: flatten('light', { bg: '#FFFFFF', frame: '#FFFFFF' }),
  dark: flatten('dark', { bg: radix.dark.sand[0], frame: radix.dark.sand[1] }),
};
