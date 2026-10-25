import { useSyncExternalStore } from 'react';
import type { Theme } from '../design/palette.ts';
import { DARK_QUERY, type ThemeState, type ThemeStore, applyTheme, createThemeStore, safeStorage } from './theme.ts';

// Shapes, not colour, tell the two apart: a ringed disc and a crescent, both in currentColor.
const Sun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" data-icon="sun" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" data-icon="moon" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
    <path d="M20.5 14A8.5 8.5 0 1 1 10 3.5a8 8 0 0 0 10.5 10.5z" />
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

let store: ThemeStore | undefined;
const getStore = () =>
  (store ??= createThemeStore(safeStorage(), typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null, (s) => applyTheme(document, s)));
const SERVER: ThemeState = { theme: 'light', stored: null, system: 'light' };
const subscribe = (l: () => void) => getStore().subscribe(l);
const snapshot = () => getStore().get();
const serverSnapshot = () => SERVER;
const toggle = () => getStore().toggle();

/** ThemeToggle on the page's one theme store (localStorage and the system's colour scheme). */
export function PageThemeToggle() {
  const { theme } = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return <ThemeToggle theme={theme} onToggle={toggle} />;
}
