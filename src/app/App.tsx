import { useEffect, useRef, useState } from 'react';
import type { SampleFixture } from '../core/types.ts';
import { defaultSample, type SampleEntry, samples } from '../samples/index.ts';
import { AppFooter } from './AppFooter.tsx';
import { AppHeader } from './AppHeader.tsx';
import { TimelineView } from './TimelineView.tsx';
import { parseUrlState, writeUrlState } from './urlState.ts';

interface Current {
  id: string;
  fixture: SampleFixture;
  change?: string | undefined;
  at?: string | undefined;
}

export function App() {
  const [current, setCurrent] = useState<Current | null>(() => {
    const { sample, change, at } = parseUrlState(location.search);
    // A deep link to a lazily loaded sample renders once it has loaded; unknown ids fall back to the default.
    const lazy = samples.some((s) => s.id === sample && s.id !== defaultSample.id);
    return lazy ? null : { id: defaultSample.id, fixture: defaultSample, change, at };
  });
  // Polite announcement on sample switch; focus stays on the chip. Empty on first load.
  const [announcement, setAnnouncement] = useState('');
  const wanted = useRef(current?.id);

  const load = (entry: SampleEntry, change?: string, at?: string, announce = true) => {
    wanted.current = entry.id;
    void entry.load().then((fixture) => {
      // Last click wins if loads resolve out of order.
      if (wanted.current !== entry.id) return;
      setCurrent({ id: entry.id, fixture, change, at });
      if (!announce) return;
      writeUrlState({ sample: entry.id });
      setAnnouncement(`Showing: ${fixture.label}, ${fixture.snapshots.length} captures`);
    });
  };

  useEffect(() => {
    const { sample, change, at } = parseUrlState(location.search);
    const entry = samples.find((s) => s.id === sample);
    if (!current && entry) load(entry, change, at, false);
    // An unknown `?sample=` shows the default sample: say so in the address bar (keeping any resolved change).
    if (sample && !entry) writeUrlState({ ...parseUrlState(location.search), sample: defaultSample.id });
    // Runs once on mount: only the initial deep link is restored from the URL.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppHeader hasDiff={current !== null} samples={samples} selectedId={current?.id ?? ''} onSelect={(entry) => load(entry)} />
      <main id="content" tabIndex={-1}>
        {current ? (
          <TimelineView
            key={current.id}
            fixture={current.fixture}
            initialChange={current.change}
            initialAt={current.at}
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
      {current && <AppFooter source={current.fixture.source} />}
    </>
  );
}
