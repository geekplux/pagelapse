/** Colour tokens: the single source of truth, mirrored in `tokens.css` (a test keeps them equal). */
export const TOKENS = [
  'paper', 'card', 'ink', 'ink-2', 'rule', 'rule-strong',
  'added', 'added-tint', 'removed', 'removed-tint',
  'mag-1', 'mag-2', 'mag-3', 'mag-4',
  'mark-plus', 'mark-minus',
] as const;

export type Token = (typeof TOKENS)[number];
export type Theme = 'light' | 'dark';

/**
 * "The archivist's proof sheet" palette (docs/PLAN.md section 4). `mark-plus` / `mark-minus` colour
 * the logo's ± on its ink tile, so they reuse the opposite theme's added/removed hues. Every
 * graphic token (rule-strong, mag-1..4) clears 3:1 on both `card` and `paper`.
 */
export const palette: Readonly<Record<Theme, Readonly<Record<Token, string>>>> = {
  light: {
    paper: '#F6F1E7', card: '#FFFDF8', ink: '#1F1B16', 'ink-2': '#5C5346', rule: '#D9CFBF', 'rule-strong': '#8A7F6E',
    added: '#1F5FB0', 'added-tint': '#E3EDFA', removed: '#B4441A', 'removed-tint': '#FBE6DA',
    'mag-1': '#9C8558', 'mag-2': '#85693F', 'mag-3': '#5E4826', 'mag-4': '#3A2A14',
    'mark-plus': '#7FB0EE', 'mark-minus': '#E8895A',
  },
  dark: {
    paper: '#14120F', card: '#1D1A16', ink: '#EDE6D9', 'ink-2': '#A89F90', rule: '#3A342C', 'rule-strong': '#71685A',
    added: '#7FB0EE', 'added-tint': '#1E2A3D', removed: '#E8895A', 'removed-tint': '#3A2318',
    'mag-1': '#7D6946', 'mag-2': '#957A50', 'mag-3': '#BFA272', 'mag-4': '#E6CFA0',
    'mark-plus': '#1F5FB0', 'mark-minus': '#B4441A',
  },
};

/** Band-safe variants for filled added/removed marks in dark mode (section 4). */
export const darkFillVariants = { added: '#5E95D6', removed: '#D46E3A' } as const;
