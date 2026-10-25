import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { palette } from '../design/palette.ts';
import { AppHeader } from './AppHeader.tsx';
import { THEME_COLOR, THEME_KEY, type ThemeState, applyTheme, createThemeStore, safeStorage } from './theme.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

/** An in-memory Storage; `blocked` makes every access throw, as a browser with site data blocked does. */
function memory(initial: Record<string, string> = {}, blocked = false) {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (blocked) throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  const storage = {
    getItem: (k: string) => (guard(), data.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void data.set(k, v)),
    removeItem: (k: string) => (guard(), void data.delete(k)),
  };
  return { data, storage: safeStorage(() => storage) };
}

/** A matchMedia('(prefers-color-scheme: dark)') stand-in whose system theme the test can change. */
function media(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const q = {
    matches: dark,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.add(l),
    removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.delete(l),
    set(next: boolean) {
      q.matches = next;
      for (const l of listeners) l({ matches: next });
    },
    listeners,
  };
  return q as typeof q & MediaQueryList;
}

describe('theme store', () => {
  it('starts from the system while nothing is stored', () => {
    expect(createThemeStore(memory().storage, media(false)).get()).toEqual({ theme: 'light', stored: null, system: 'light' });
    expect(createThemeStore(memory().storage, media(true)).get()).toEqual({ theme: 'dark', stored: null, system: 'dark' });
    expect(createThemeStore(memory().storage, null).get().theme).toBe('light');
  });

  it('starts from a stored choice, and ignores a stored value that is not a theme', () => {
    expect(createThemeStore(memory({ [THEME_KEY]: 'dark' }).storage, media(false)).get()).toEqual({ theme: 'dark', stored: 'dark', system: 'light' });
    expect(createThemeStore(memory({ [THEME_KEY]: 'sepia' }).storage, media(true)).get()).toEqual({ theme: 'dark', stored: null, system: 'dark' });
  });

  it('toggle shows and stores the other theme', () => {
    const { data, storage } = memory();
    const s = createThemeStore(storage, media(false));
    s.toggle();
    expect(s.get()).toEqual({ theme: 'dark', stored: 'dark', system: 'light' });
    expect(data.get(THEME_KEY)).toBe('dark');
  });

  it('clears the stored value when the choice is the system theme, so the page follows the system again', () => {
    const { data, storage } = memory({ [THEME_KEY]: 'light' });
    const s = createThemeStore(storage, media(true));
    expect(s.get().theme).toBe('light');
    s.toggle();
    expect(s.get()).toEqual({ theme: 'dark', stored: null, system: 'dark' });
    expect(data.has(THEME_KEY)).toBe(false);
  });

  it('works for the session when storage throws', () => {
    const { storage } = memory({}, true);
    const s = createThemeStore(storage, media(false));
    expect(s.get().theme).toBe('light');
    expect(() => s.toggle()).not.toThrow();
    expect(s.get()).toEqual({ theme: 'dark', stored: 'dark', system: 'light' });
    s.toggle();
    expect(s.get()).toEqual({ theme: 'light', stored: null, system: 'light' });
  });

  it('follows a live system change while nothing is stored, and notifies', () => {
    const q = media(false);
    const s = createThemeStore(memory().storage, q);
    const seen: ThemeState[] = [];
    const off = s.subscribe(() => seen.push(s.get()));
    q.set(true);
    expect(s.get()).toEqual({ theme: 'dark', stored: null, system: 'dark' });
    expect(seen).toHaveLength(1);
    off();
    s.dispose();
    expect(q.listeners.size).toBe(0);
  });

  it('keeps a stored choice through a system change; a toggle then compares with the new system', () => {
    const q = media(false);
    const { data, storage } = memory({ [THEME_KEY]: 'dark' });
    const s = createThemeStore(storage, q);
    q.set(true);
    expect(s.get()).toEqual({ theme: 'dark', stored: 'dark', system: 'dark' });
    s.toggle();
    expect(s.get()).toEqual({ theme: 'light', stored: 'light', system: 'dark' });
    expect(data.get(THEME_KEY)).toBe('light');
  });

  it('calls apply on start and on every change', () => {
    const apply = vi.fn<(s: ThemeState) => void>();
    const q = media(false);
    const s = createThemeStore(memory().storage, q, apply);
    s.toggle();
    q.set(true);
    expect(apply.mock.calls.map(([st]) => st.theme)).toEqual(['light', 'dark', 'dark']);
  });
});

describe('applyTheme', () => {
  function doc() {
    const attrs = new Map<string, string>();
    const el = (a: Record<string, string>) => ({
      getAttribute: (k: string) => a[k] ?? null,
      setAttribute: (k: string, v: string) => void (a[k] = v),
      a,
    });
    const metas = [el({ name: 'theme-color', media: '(prefers-color-scheme: light)', content: '' }), el({ name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '' })];
    const root = { setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) };
    return { attrs, metas, d: { documentElement: root, querySelectorAll: () => metas } as unknown as Document };
  }

  it('sets data-theme and both theme-colors to a stored choice', () => {
    const { attrs, metas, d } = doc();
    applyTheme(d, { theme: 'dark', stored: 'dark', system: 'light' });
    expect(attrs.get('data-theme')).toBe('dark');
    expect(metas.map((m) => m.a.content)).toEqual([THEME_COLOR.dark, THEME_COLOR.dark]);
  });

  it('removes data-theme and gives each theme-color its own media colour while nothing is stored', () => {
    const { attrs, metas, d } = doc();
    applyTheme(d, { theme: 'dark', stored: 'dark', system: 'light' });
    applyTheme(d, { theme: 'light', stored: null, system: 'light' });
    expect(attrs.has('data-theme')).toBe(false);
    expect(metas.map((m) => m.a.content)).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
  });
});

describe('public/theme.js (the pre-paint copy)', () => {
  const js = readFileSync(new URL('../../public/theme.js', import.meta.url), 'utf8');

  it('uses the same key and the palette grounds', () => {
    expect([palette.light.bg, palette.dark.bg]).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
    expect(js).toContain(`localStorage.getItem('${THEME_KEY}')`);
    expect(js).toContain(`t === 'dark' ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}'`);
  });

  it('stays tiny, guarded and outside the module graph', () => {
    expect(js.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length).toBeLessThan(15);
    expect(js).toMatch(/^try \{[^]*\} catch \{[^]*\}\n$/m);
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/<script src="\/theme\.js"><\/script>/);
    expect(html.indexOf('/theme.js')).toBeLessThan(html.indexOf('/src/main.tsx'));
  });

  it('sets data-theme from storage and leaves the page alone without a choice or with blocked storage', () => {
    const run = (stored: string | null, blocked = false) => {
      const attrs: Record<string, string> = {};
      const metas = [0, 1].map(() => ({ content: '', setAttribute(_: string, v: string) { this.content = v; } }));
      const env = {
        localStorage: { getItem: () => { if (blocked) throw new Error('blocked'); return stored; } },
        document: { documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) }, querySelectorAll: () => metas },
      };
      new Function('localStorage', 'document', js)(env.localStorage, env.document);
      return [attrs['data-theme'], ...metas.map((m) => m.content)];
    };
    expect(run('dark')).toEqual(['dark', THEME_COLOR.dark, THEME_COLOR.dark]);
    expect(run('light')).toEqual(['light', THEME_COLOR.light, THEME_COLOR.light]);
    expect(run(null)).toEqual([undefined, '', '']);
    expect(run('sepia')).toEqual([undefined, '', '']);
    expect(run('dark', true)).toEqual([undefined, '', '']);
  });
});

describe('ThemeToggle', () => {
  it('shows a moon named "Switch to dark theme" while light is showing', () => {
    const html = renderToStaticMarkup(<ThemeToggle theme="light" onToggle={() => {}} />);
    expect(html).toMatch(/^<button type="button" class="icon-btn theme-btn" aria-label="Switch to dark theme">/);
    expect(html).toContain('data-icon="moon"');
    expect(html).not.toContain('data-icon="sun"');
  });

  it('shows a sun named "Switch to light theme" while dark is showing', () => {
    const html = renderToStaticMarkup(<ThemeToggle theme="dark" onToggle={() => {}} />);
    expect(html).toContain('aria-label="Switch to light theme"');
    expect(html).toContain('data-icon="sun"');
    expect(html).not.toContain('data-icon="moon"');
  });

  it('has no visible text, a 20 px icon hidden from the tree, and no colour of its own', () => {
    const html = renderToStaticMarkup(<ThemeToggle theme="light" onToggle={() => {}} />);
    expect(html.replace(/<[^>]+>/g, '')).toBe('');
    expect(html).toMatch(/<svg width="20" height="20"[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(html).toContain('stroke="currentColor"');
  });

  it('sits in the header after the address field and before the GitHub link, on the hero and the workspace', () => {
    const hero = renderToStaticMarkup(<AppHeader hero />);
    const work = renderToStaticMarkup(<AppHeader hasDiff url="example.org" onUrl={() => {}} samples={[]} selectedId="" onSelect={() => {}} />);
    for (const html of [hero, work]) {
      const theme = html.indexOf('theme-btn');
      expect(theme).toBeGreaterThan(0);
      expect(theme).toBeLessThan(html.indexOf('aria-label="Source on GitHub"'));
    }
    expect(work.indexOf('url-input')).toBeLessThan(work.indexOf('theme-btn'));
  });
});
