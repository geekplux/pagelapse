import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { SampleFixture } from '../core/types.ts';
import { DECK_SAMPLE, defaultSample, displayAddress, type SampleEntry, samples } from '../samples/index.ts';
import { AppFooter } from './AppFooter.tsx';
import { AppHeader } from './AppHeader.tsx';
import { Hero } from './hero/Hero.tsx';
import { validateTargetUrl } from '../core/url.ts';
import { throttleLatest } from './throttle.ts';
import { type UrlState, isHeroState, parseUrlState, pushUrlState, writeUrlState } from './urlState.ts';

interface Current {
  id: string;
  fixture: SampleFixture;
  change?: string | undefined;
  at?: string | undefined;
  view?: string | undefined;
}

/**
 * The sample workspace loads on first use: the hero is the first view. Loading resolves together with the sample, so
 * the swap from the hero is one step (no loading line in between).
 */
let workspace: Promise<typeof import('./TimelineView.tsx')> | undefined;
const loadWorkspace = () => (workspace ??= import('./TimelineView.tsx'));
type Workspace = (typeof import('./TimelineView.tsx'))['TimelineView'];

/** Live mode loads on first use, so the sample first view does not carry it. */
const LiveView = lazy(() => import('./live/LiveView.tsx').then((m) => ({ default: m.LiveView })));

/** A live run; a new `run` number remounts the view, which aborts the previous run (no stale markers). */
interface Live {
  url: string;
  run: number;
  change?: string | undefined;
  at?: string | undefined;
  view?: string | undefined;
  /** Move focus to the new run's status line (Start again, Try again: the pressed button goes away). */
  focus?: boolean;
}

/** `?url=` starts a live run on load when it is a valid address (an invalid one is shown at the field instead). */
function initialLive(): Live | null {
  const { url, change, at, view } = parseUrlState(location.search);
  const check = url ? validateTargetUrl(url) : null;
  return check?.ok ? { url: check.url, run: 0, change, at, view } : null;
}

/** How a sample or live run changes the address: a new history entry (leaving the hero), in place, or not at all. */
type Write = 'push' | 'replace' | false;
const write = (how: Write, state: UrlState) => (how === 'push' ? pushUrlState(state) : how && writeUrlState(state));

export function App() {
  const [live, setLive] = useState(initialLive);
  // No `?sample=` and no `?url=`: the hero. Leaving it pushes a history entry, so Back returns to it.
  const [hero, setHero] = useState(() => isHeroState(parseUrlState(location.search)));
  const [current, setCurrent] = useState<Current | null>(() => {
    const { sample, change, at, view } = parseUrlState(location.search);
    if (hero) return null;
    // A deep link to a lazily loaded sample renders once it has loaded; unknown ids fall back to the default.
    const lazy = samples.some((s) => s.id === sample && s.id !== defaultSample.id);
    return lazy ? null : { id: defaultSample.id, fixture: defaultSample, change, at, view };
  });
  // Polite announcement on sample switch; focus stays where it is. Empty on first load.
  const [announcement, setAnnouncement] = useState('');
  const wanted = useRef(current?.id);
  // Live-run progress reaches the polite region at most once every 2 s, across runs too (AC 22).
  const [progress] = useState(() => throttleLatest<string>(2000, setAnnouncement));
  useEffect(() => () => progress.cancel(), [progress]);

  // The control that opened the workspace goes away with the hero (or the live view): focus moves to the content,
  // not to <body> (WCAG 2.4.3).
  const focusContent = () =>
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) document.getElementById('content')?.focus();
    });

  const [Timeline, setTimeline] = useState<Workspace>();
  useEffect(() => {
    // A deep link to the bundled default sample renders as soon as the workspace has loaded.
    if (!hero && !Timeline) void loadWorkspace().then((m) => setTimeline(() => m.TimelineView));
  }, [hero, Timeline]);

  const load = (entry: SampleEntry, q: Omit<UrlState, 'sample' | 'url'> = {}, how: Write = 'replace') => {
    setLive(null);
    progress.cancel();
    wanted.current = entry.id;
    return Promise.all([entry.load(), loadWorkspace()]).then(([fixture, m]) => {
      // Last click wins if loads resolve out of order.
      if (wanted.current !== entry.id) return;
      setTimeline(() => m.TimelineView);
      setCurrent({ id: entry.id, fixture, ...q });
      setHero(false);
      if (!how) return;
      write(how, { sample: entry.id, ...q });
      setAnnouncement(`Showing: ${fixture.label}, ${fixture.snapshots.length} captures`);
    });
  };
  const fromHero = (entry: SampleEntry, q: Omit<UrlState, 'sample' | 'url'> = {}) => void load(entry, q, 'push');
  // Leaving the hero removes the control that was used: the workspace opens at its top, with focus on its content.
  const wasHero = useRef(hero);
  useEffect(() => {
    const active = document.activeElement;
    if (wasHero.current && !hero) {
      scrollTo({ top: 0, behavior: 'instant' });
      if (!active || active === document.body) document.getElementById('content')?.focus({ preventScroll: true });
    }
    wasHero.current = hero;
  }, [hero]);
  // The hero's deck (and the footer's note on its captures) deals the Wikipedia sample, loaded on first need.
  const deckEntry = samples.find((s) => s.id === DECK_SAMPLE);
  const [deck, setDeck] = useState<SampleFixture>();
  useEffect(() => {
    if (hero && !deck) void deckEntry?.load().then(setDeck);
  }, [hero, deck, deckEntry]);
  // While the hero is up, fetch the workspace in the background so a sample or a card opens at once.
  useEffect(() => {
    if (!hero) return;
    const t = setTimeout(loadWorkspace, 1500);
    return () => clearTimeout(t);
  }, [hero]);

  const startLive = (url: string, focus = false, how: Write = 'replace') => {
    wanted.current = undefined;
    setHero(false);
    setLive((l) => ({ url, run: (l?.run ?? 0) + 1, focus }));
    write(how, { url });
  };
  const openSample = () => void load(samples.find((s) => s.id === defaultSample.id)!).then(focusContent);

  // The page shown (hero, a sample, a live run), so Back and Forward between entries of the same page (a skip link's
  // #hash, a change scrubbed since) leave it as it is: a live run is not started again.
  const page = useRef('');
  page.current = hero ? 'hero' : live ? `url:${live.url}` : `sample:${current?.id}`;
  // Back and Forward between the hero and the workspace: show what the address now names.
  useEffect(() => {
    const onPop = () => {
      const s = parseUrlState(location.search);
      const check = s.url ? validateTargetUrl(s.url) : null;
      const entry = samples.find((e) => e.id === s.sample) ?? samples[0]!;
      if (page.current === (isHeroState(s) ? 'hero' : check?.ok ? `url:${check.url}` : `sample:${entry.id}`)) return;
      if (isHeroState(s)) {
        wanted.current = undefined;
        progress.cancel();
        setLive(null);
        setHero(true);
      } else if (check?.ok) {
        setHero(false);
        setLive((l) => ({ url: check.url, run: (l?.run ?? 0) + 1, change: s.change, at: s.at, view: s.view }));
      } else void load(entry, { change: s.change, at: s.at, view: s.view }, false);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
    // `load` only reads refs and setters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (live || hero) return;
    const { sample, change, at, view } = parseUrlState(location.search);
    const entry = samples.find((s) => s.id === sample);
    if (!current && entry) void load(entry, { change, at, view }, false);
    // An unknown `?sample=` shows the default sample: say so in the address bar (keeping any resolved change).
    if (sample && !entry) writeUrlState({ ...parseUrlState(location.search), sample: defaultSample.id });
    // Runs once on mount: only the initial deep link is restored from the URL.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hero)
    return (
      <>
        <AppHeader hero />
        <main id="content" className="is-intro" tabIndex={-1}>
          <Hero
            samples={samples}
            onSample={(entry) => fromHero(entry)}
            onUrl={(url) => startLive(url, false, 'push')}
            deck={deck}
            onCapture={(at) => deckEntry && fromHero(deckEntry, { at })}
          />
        </main>
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        <AppFooter sample={deck} hero />
      </>
    );

  return (
    <>
      <AppHeader
        hasDiff={!live && current !== null}
        samples={samples}
        selectedId={live ? '' : (current?.id ?? '')}
        onSelect={(entry) => void load(entry)}
        url={live ? displayAddress(live.url) : (parseUrlState(location.search).url ?? (current ? displayAddress(current.fixture.url) : ''))}
        onUrl={(url) => startLive(url)}
      />
      <main id="content" tabIndex={-1}>
        {live ? (
          <Suspense fallback={<p className="loading mono">Starting…</p>}>
            <LiveView
              key={live.run}
              url={live.url}
              initialChange={live.change}
              initialAt={live.at}
              initialMode={live.view}
              onChange={(q) => writeUrlState({ url: live.url, ...q })}
              announce={progress.push}
              focusStatus={live.focus}
              onRetry={() => startLive(live.url, true)}
              onSample={openSample}
            />
          </Suspense>
        ) : current && Timeline ? (
          <Timeline
            key={current.id}
            fixture={current.fixture}
            initialChange={current.change}
            initialAt={current.at}
            initialMode={current.view}
            overview={current.id === defaultSample.id}
            onChange={(q) => writeUrlState({ sample: current.id, ...q })}
          />
        ) : (
          <p className="loading mono">Loading sample…</p>
        )}
      </main>
      {/* An explicit status role is the most widely announced live region; <output> support varies. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <AppFooter sample={live ? undefined : current?.fixture} />
    </>
  );
}
