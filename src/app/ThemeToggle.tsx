import { useSyncExternalStore } from 'react';
import type { Theme } from '../design/palette.ts';
import { DARK_QUERY, type ThemeState, type ThemeStore, applyTheme, createThemeStore, safeStorage } from './theme.ts';

// Shapes, not colour, tell the two apart: a ringed disc and a crescent, both in currentColor.
// Both fill the 20 px box edge to edge, as the GitHub mark does (viewBox 1 1 22 22, ink about 20 px).
const Sun = () => (
  <svg width="20" height="20" viewBox="1 1 22 22" aria-hidden="true" data-icon="sun" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2.75M12 19.25V22M2 12h2.75M19.25 12H22M4.93 4.93l1.94 1.94M17.13 17.13l1.94 1.94M4.93 19.07l1.94-1.94M17.13 6.87l1.94-1.94" />
  </svg>
);
const Moon = () => (
  <svg width="20" height="20" viewBox="1 1 22 22" aria-hidden="true" data-icon="moon" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
    <path d="M21.92 13.28A10 10 0 1 1 10.72 2.08a8.5 8.5 0 0 0 11.2 11.2z" />
  </svg>
);

/** The header's theme button: the icon shows the theme a click switches to, the name says so. */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const to = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="icon-btn theme-btn" aria-label={`Switch to ${to} theme`} onClick={onToggle}>
      {to === 'light' ? <Sun /> : <Moon />}
    </button>
  );
}

// The page's one store, made when the module loads (before the first render), so rendering never touches <html>.
// Without a DOM (render-to-string tests) there is none and the toggle renders light.
const store: ThemeStore | null =
  typeof window === 'undefined' || typeof document === 'undefined'
    ? null
    : createThemeStore(safeStorage(), typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null, (s) => applyTheme(document, s), window);
const SERVER: ThemeState = { theme: 'light', stored: null, system: 'light' };
const subscribe = (l: () => void) => store?.subscribe(l) ?? (() => {});
const snapshot = () => store?.get() ?? SERVER;
const serverSnapshot = () => SERVER;
const toggle = () => store?.toggle();

/** ThemeToggle on the page's one theme store (localStorage and the system's colour scheme). */
export function PageThemeToggle() {
  const { theme } = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return <ThemeToggle theme={theme} onToggle={toggle} />;
}
