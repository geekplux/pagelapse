import { useRef, useState } from 'react';
import { defaultSample, type SampleEntry, samples } from '../samples/index.ts';
import { AppFooter } from './AppFooter.tsx';
import { AppHeader } from './AppHeader.tsx';
import { SampleView } from './SampleView.tsx';

export function App() {
  const [current, setCurrent] = useState({ id: defaultSample.id, fixture: defaultSample });
  // Polite announcement on sample switch; focus stays on the chip. Empty on first load.
  const [announcement, setAnnouncement] = useState('');
  const wanted = useRef(current.id);

  const select = (entry: SampleEntry) => {
    wanted.current = entry.id;
    void entry.load().then((fixture) => {
      // Last click wins if loads resolve out of order.
      if (wanted.current !== entry.id) return;
      setCurrent({ id: entry.id, fixture });
      setAnnouncement(`Showing: ${fixture.label}, ${fixture.snapshots.length} captures`);
    });
  };

  return (
    <>
      <AppHeader samples={samples} selectedId={current.id} onSelect={select} />
      <main id="content" tabIndex={-1}>
        <SampleView key={current.id} fixture={current.fixture} />
      </main>
      {/* An explicit status role is the most widely announced live region; <output> support varies. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <AppFooter source={current.fixture.source} />
    </>
  );
}
