import type { Theme } from '../design/palette.ts';

/**
 * The light / dark choice: two states, no "system" option. The page follows the system until the header's toggle
 * picks the other theme; that choice is stored, and picking the system's theme again clears it. public/theme.js
 * applies a stored choice before first paint (same key and colours; theme.test.ts keeps them equal).
 */
export const THEME_KEY = 'pagelapse-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';
/** The ground of each theme (palette.ts `bg`), for the browser's theme-color. */
export const THEME_COLOR: Readonly<Record<Theme, string>> = { light: '#FFFFFF', dark: '#111110' };

export interface ThemeState {
  /** The theme shown. */
  theme: Theme;
  /** The stored choice, or null while the page follows the system. */
  stored: Theme | null;
  system: Theme;
}

/** Storage that never throws: a blocked or full localStorage leaves the choice in memory for this session. */
export interface ThemeStorage {
  get(): string | null;
  set(value: Theme | null): void;
}

export function safeStorage(open: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () => localStorage): ThemeStorage {
  return {
    get() {
      try {
        return open().getItem(THEME_KEY);
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        if (value) open().setItem(THEME_KEY, value);
        else open().removeItem(THEME_KEY);
      } catch {
        // Blocked storage: the choice holds until the page is closed.
      }
    },
  };
}

export const parseTheme = (value: unknown): Theme | null => (value === 'light' || value === 'dark' ? value : null);
const other = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');

/** The part of MediaQueryList the store listens to. */
export type DarkQuery = Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;

export interface ThemeStore {
  get(): ThemeState;
  /** Shows the other theme; stores it, or clears the stored value when it is the system's theme. */
  toggle(): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/** A tiny external store (for useSyncExternalStore); `apply` runs on start and on every change. */
export function createThemeStore(storage: ThemeStorage, query: DarkQuery | null, apply?: (s: ThemeState) => void): ThemeStore {
  let system: Theme = query?.matches ? 'dark' : 'light';
  let stored = parseTheme(storage.get());
  const listeners = new Set<() => void>();
  const make = (): ThemeState => ({ theme: stored ?? system, stored, system });
  let state = make();
  const update = () => {
    state = make();
    apply?.(state);
    for (const l of listeners) l();
  };
  const onSystem = (e: Pick<MediaQueryListEvent, 'matches'>) => {
    system = e.matches ? 'dark' : 'light';
    update();
  };
  query?.addEventListener('change', onSystem);
  apply?.(state);
  return {
    get: () => state,
    toggle() {
      const next = other(state.theme);
      stored = next === system ? null : next;
      storage.set(stored);
      update();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => query?.removeEventListener('change', onSystem),
  };
}

/**
 * Puts the state on the page: `data-theme` on <html> only while a choice is stored (tokens.css), and each theme-color
 * meta to the shown ground (each keeps its own media's colour while nothing is stored).
 */
export function applyTheme(doc: Pick<Document, 'documentElement' | 'querySelectorAll'>, s: ThemeState): void {
  const root = doc.documentElement;
  if (s.stored) root.setAttribute('data-theme', s.stored);
  else root.removeAttribute('data-theme');
  for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own: Theme = meta.getAttribute('media')?.includes('dark') ? 'dark' : 'light';
    meta.setAttribute('content', THEME_COLOR[s.stored ?? own]);
  }
}
