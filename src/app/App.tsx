import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { SampleFixture } from '../core/types.ts';
import { defaultSample, type SampleEntry, samples } from '../samples/index.ts';
import { AppFooter } from './AppFooter.tsx';
import { AppHeader } from './AppHeader.tsx';
import { TimelineView } from './TimelineView.tsx';
import { validateTargetUrl } from '../core/url.ts';
import { throttleLatest } from './throttle.ts';
import { parseUrlState, writeUrlState } from './urlState.ts';

interface Current {
  id: string;
  fixture: SampleFixture;
  change?: string | undefined;
  at?: string | undefined;
  view?: string | undefined;
}

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

export function App() {
  const [live, setLive] = useState(initialLive);
  const [current, setCurrent] = useState<Current | null>(() => {
    const { sample, change, at, view } = parseUrlState(location.search);
    // A deep link to a lazily loaded sample renders once it has loaded; unknown ids fall back to the default.
    const lazy = samples.some((s) => s.id === sample && s.id !== defaultSample.id);
    return lazy ? null : { id: defaultSample.id, fixture: defaultSample, change, at, view };
  });
  // Polite announcement on sample switch; focus stays on the chip. Empty on first load.
  const [announcement, setAnnouncement] = useState('');
  const wanted = useRef(current?.id);
  // Live-run progress reaches the polite region at most once every 2 s, across runs too (AC 22).
  const [progress] = useState(() => throttleLatest<string>(2000, setAnnouncement));
  useEffect(() => () => progress.cancel(), [progress]);

  const load = (entry: SampleEntry, change?: string, at?: string, view?: string, announce = true) => {
    setLive(null);
    progress.cancel();
    wanted.current = entry.id;
    return entry.load().then((fixture) => {
      // Last click wins if loads resolve out of order.
      if (wanted.current !== entry.id) return;
      setCurrent({ id: entry.id, fixture, change, at, view });
      if (!announce) return;
      writeUrlState({ sample: entry.id });
      setAnnouncement(`Showing: ${fixture.label}, ${fixture.snapshots.length} captures`);
    });
  };

  const startLive = (url: string, focus = false) => {
    setLive((l) => ({ url, run: (l?.run ?? 0) + 1, focus }));
    writeUrlState({ url });
  };
  // "Open a sample" goes away with the live view: focus lands on the sample's chip, not on <body> (WCAG 2.4.3).
  const openSample = () =>
    void load(samples.find((s) => s.id === defaultSample.id)!).then(() =>
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body) document.querySelector<HTMLElement>('.chip[aria-pressed="true"]')?.focus();
      }),
    );

  useEffect(() => {
    if (live) return;
    const { sample, change, at, view } = parseUrlState(location.search);
    const entry = samples.find((s) => s.id === sample);
    if (!current && entry) void load(entry, change, at, view, false);
    // An unknown `?sample=` shows the default sample: say so in the address bar (keeping any resolved change).
    if (sample && !entry) writeUrlState({ ...parseUrlState(location.search), sample: defaultSample.id });
    // Runs once on mount: only the initial deep link is restored from the URL.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppHeader
        hasDiff={!live && current !== null}
        samples={samples}
        selectedId={live ? '' : (current?.id ?? '')}
        onSelect={(entry) => void load(entry)}
        url={parseUrlState(location.search).url ?? ''}
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
        ) : current ? (
          <TimelineView
            key={current.id}
            fixture={current.fixture}
            initialChange={current.change}
            initialAt={current.at}
            initialMode={current.view}
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
