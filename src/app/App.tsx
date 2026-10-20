import { useRef, useState } from 'react';
import { defaultSample, type SampleEntry, samples } from '../samples/index.ts';
import { AppFooter } from './AppFooter.tsx';
import { AppHeader } from './AppHeader.tsx';
import { SampleView } from './SampleView.tsx';

export function App() {
  const [current, setCurrent] = useState({ id: defaultSample.id, fixture: defaultSample });
  const wanted = useRef(current.id);

  const select = (entry: SampleEntry) => {
    wanted.current = entry.id;
    void entry.load().then((fixture) => {
      // Last click wins if loads resolve out of order.
      if (wanted.current === entry.id) setCurrent({ id: entry.id, fixture });
    });
  };

  return (
    <>
      <AppHeader samples={samples} selectedId={current.id} onSelect={select} />
      <main id="content" tabIndex={-1}>
        <SampleView key={current.id} fixture={current.fixture} />
      </main>
      <AppFooter source={current.fixture.source} />
    </>
  );
}
