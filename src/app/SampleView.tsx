import { useEffect, useMemo, useRef } from 'react';
import type { SampleFixture } from '../core/types.ts';
import { ARCHIVES } from '../archive/archives.ts';
import { viewCaptureUrl } from '../core/url.ts';
import { fixtureToSnapshots } from '../core/fixture.ts';
import { buildTimeline } from '../core/timeline.ts';
import { formatTimestampLong, formatTimestampShort, timestampToIso } from '../core/timestamp.ts';

/** The sample as an index card: catalogue line, title, URL, description and the list of captures. */
export function SampleView({ fixture }: { fixture: SampleFixture }) {
  const root = useRef<HTMLElement>(null);
  const { snapshots } = fixture;
  const timeline = useMemo(() => buildTimeline(fixture.url, fixtureToSnapshots(fixture)), [fixture]);
  const years = `${snapshots[0]?.ts.slice(0, 4)}–${snapshots.at(-1)?.ts.slice(0, 4)}`;

  // Signal "rendered" to the smoke check once the captures are in the DOM.
  useEffect(() => {
    if (!root.current) return;
    root.current.dataset.ready = 'true';
    performance.mark('wd:ready');
  }, []);

  return (
    <article className="sheet" aria-labelledby="sample-label" ref={root}>
      <p className="sheet-meta mono">
        <span>Cat. {fixture.id}</span>
        <span>{snapshots.length} captures</span>
        <span>{years}</span>
      </p>
      <h2 id="sample-label">{fixture.label}</h2>
      <p className="sheet-url">
        <a className="mono" href={fixture.url}>
          {fixture.url}
        </a>
      </p>
      <p className="sheet-desc">{fixture.description}</p>
      {/* Temporary list (phase 6); phase 7 replaces it with the timeline. */}
      <h3 id="changes-heading">Meaningful changes</h3>
      <p className="captures-source">
        {timeline.entries.length} changes; {timeline.trivialCaptures.length} trivial captures hidden. Summaries are auto summaries.
      </p>
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ol className="captures changes" role="list" aria-labelledby="changes-heading">
        {timeline.entries.map((e) => (
          <li key={e.to}>
            <time className="mono" dateTime={timestampToIso(e.to)}>
              <span aria-hidden="true">{formatTimestampShort(e.to)}</span>
              <span className="sr-only">{formatTimestampLong(e.to)}</span>
            </time>
            <span className="change-mag mono" data-magnitude={e.significance.magnitude}>
              {e.significance.magnitude}
            </span>
            <span className="cap-title">{e.ruleSummary}</span>
          </li>
        ))}
      </ol>
      <h3 id="captures-heading">Captures</h3>
      <p className="captures-source">
        Captures from {ARCHIVES[fixture.source.archive].name}. Each date opens that capture in the archive.
      </p>
      {/* Safari drops list semantics when list-style is none, so the role is not redundant here. */}
      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ol className="captures" role="list" aria-labelledby="captures-heading">
        {snapshots.map((s, i) => (
          <li key={s.ts}>
            <span className="cap-no mono" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            {/* Named by the long date inside <time>; the linter cannot see through the nested spans. */}
            {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
            <a className="cap-link" href={viewCaptureUrl(fixture.source.archive, s.ts, fixture.url)}>
              <time className="mono" dateTime={timestampToIso(s.ts)}>
                <span aria-hidden="true">{formatTimestampShort(s.ts)}</span>
                <span className="sr-only">{formatTimestampLong(s.ts)}</span>
              </time>
            </a>
            <span className="cap-title">{s.title}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
