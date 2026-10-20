import { useEffect, useRef } from 'react';
import type { SampleFixture } from '../core/types.ts';
import { formatTimestampLong, formatTimestampShort, timestampToIso } from '../core/timestamp.ts';

/** Minimal sample renderer: label, URL and the ordered list of captures. */
export function SampleView({ fixture }: { fixture: SampleFixture }) {
  const root = useRef<HTMLElement>(null);

  // Signal "rendered" to the smoke check once the captures are in the DOM.
  useEffect(() => {
    if (!root.current) return;
    root.current.dataset.ready = 'true';
    performance.mark('wd:ready');
  }, []);

  return (
    <section aria-labelledby="sample-label" ref={root}>
      <h2 id="sample-label">{fixture.label}</h2>
      <p>
        <code>{fixture.url}</code>
      </p>
      <p>{fixture.description}</p>
      <h3 id="captures-heading">Captures ({fixture.snapshots.length})</h3>
      <ol aria-labelledby="captures-heading">
        {fixture.snapshots.map((s) => (
          <li key={s.ts}>
            <time dateTime={timestampToIso(s.ts)} aria-label={formatTimestampLong(s.ts)}>
              {formatTimestampShort(s.ts)}
            </time>{' '}
            {s.title}
          </li>
        ))}
      </ol>
      <footer>
        <p>
          Source: {fixture.source.attribution} Licence: {fixture.source.license}.
        </p>
      </footer>
    </section>
  );
}
