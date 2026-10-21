import { useEffect, useMemo, useRef, useState } from 'react';
import type { SampleFixture } from '../core/types.ts';
import { ARCHIVES } from '../archive/archives.ts';
import { viewCaptureUrl } from '../core/url.ts';
import { fixtureToSnapshots } from '../core/fixture.ts';
import { buildTimeline } from '../core/timeline.ts';
import { formatTimestampLong, formatTimestampShort, timestampToIso } from '../core/timestamp.ts';
import { ChangesList } from './ChangesList.tsx';
import { statsLine } from './describe.ts';
import { Timeline } from './timeline/Timeline.tsx';
import { changeIndex } from './urlState.ts';

const Ts = ({ ts }: { ts: string }) => (
  <time className="mono" dateTime={timestampToIso(ts)}>
    <span aria-hidden="true">{formatTimestampShort(ts)}</span>
    <span className="sr-only">{formatTimestampLong(ts)}</span>
  </time>
);

interface Props {
  fixture: SampleFixture;
  /** `<from>-<to>` pair to select first; the latest change when missing or unknown. */
  initialChange?: string | undefined;
  onChange: (pair: string) => void;
}

/** The sample as an index card: timeline strip, the selected change, the changes list and all captures. */
export function TimelineView({ fixture, initialChange, onChange }: Props) {
  const root = useRef<HTMLElement>(null);
  const { snapshots } = fixture;
  const timeline = useMemo(() => buildTimeline(fixture.url, fixtureToSnapshots(fixture)), [fixture]);
  const { entries, trivialCaptures } = timeline;
  const trivial = useMemo(() => new Set(trivialCaptures), [trivialCaptures]);
  const [selected, setSelected] = useState(() => changeIndex(entries, initialChange));
  const entry = entries[selected];
  const years = `${snapshots[0]?.ts.slice(0, 4)}–${snapshots.at(-1)?.ts.slice(0, 4)}`;
  const capUrl = (ts: string) => viewCaptureUrl(fixture.source.archive, ts, fixture.url);
  const select = (i: number) => {
    const e = entries[i];
    if (!e) return;
    setSelected(i);
    onChange(`${e.from}-${e.to}`);
  };

  // Signal "rendered" to the smoke check once the timeline is in the DOM.
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
      <h3 id="timeline-heading">Timeline</h3>
      <p className="captures-source tl-legend" id="timeline-legend">
        <span>
          {entries.length} meaningful changes. Bigger, bolder marks changed more:{' '}
          {(['minor', 'moderate', 'major'] as const).map((m) => (
            <span key={m} className="nowrap">
              <i className="mag-dot" data-magnitude={m} /> {m}{' '}
            </span>
          ))}
        </span>
        {trivialCaptures.length > 0 && (
          <span>
            <i className="mag-tick" /> {trivialCaptures.length} trivial captures hidden (dates, counters, whitespace).
          </span>
        )}
      </p>
      {entry ? (
        <>
          <Timeline timeline={timeline} selected={selected} onSelect={select} labelledBy="timeline-heading" describedBy="timeline-legend" />
          <div className="tl-panes">
            <section className="change-panel" aria-labelledby="change-heading">
              <p className="panel-kicker mono">
                Change {selected + 1} of {entries.length} ·{' '}
                <span className="change-mag" data-magnitude={entry.significance.magnitude}>
                  {entry.significance.magnitude}
                </span>
              </p>
              <h3 id="change-heading">
                <Ts ts={entry.from} /> → <Ts ts={entry.to} />
              </h3>
              <p className="panel-summary">
                {entry.ruleSummary} <span className="source-label mono">auto summary</span>
              </p>
              <p className="panel-stats mono">{statsLine(entry.record)}</p>
              {/* Links are named by the long dates inside <time>; the linter cannot see through the nested spans. */}
              <p className="panel-links">
                Open in the archive:{' '}
                {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
                <a href={capUrl(entry.from)}><Ts ts={entry.from} /></a> ·{' '}
                {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
                <a href={capUrl(entry.to)}><Ts ts={entry.to} /></a>
              </p>
            </section>
            <section className="changes-pane" aria-labelledby="changes-heading">
              <h3 id="changes-heading">All changes</h3>
              <ChangesList entries={entries} selected={selected} onSelect={select} />
            </section>
          </div>
        </>
      ) : (
        <p className="panel-summary">Nothing meaningful changed across {snapshots.length} captures.</p>
      )}
      <details className="captures-all">
        <summary>All {snapshots.length} captures</summary>
        <p className="captures-source">
          Captures from {ARCHIVES[fixture.source.archive].name}. Each date opens that capture in the archive.
        </p>
        {/* Safari drops list semantics when list-style is none, so the role is not redundant here. */}
        {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
        <ol className="captures" role="list" aria-label="Captures">
          {snapshots.map((s, i) => (
            <li key={s.ts}>
              <span className="cap-no mono" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              {/* Named by the long date inside <time>; the linter cannot see through the nested spans. */}
              {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
              <a className="cap-link" href={capUrl(s.ts)}>
                <Ts ts={s.ts} />
              </a>
              <span className="cap-title">
                {s.title}
                {trivial.has(s.ts) && (
                  <>
                    {' '}
                    <span className="source-label mono">trivial edit</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
