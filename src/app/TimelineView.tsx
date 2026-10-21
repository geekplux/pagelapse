import { useEffect, useMemo, useRef, useState } from 'react';
import type { SampleFixture, TimelineEntry } from '../core/types.ts';
import { ARCHIVES } from '../archive/archives.ts';
import { viewCaptureUrl } from '../core/url.ts';
import { fixtureToSnapshots } from '../core/fixture.ts';
import { buildTimeline, trivialEntries } from '../core/timeline.ts';
import { ChangesList } from './ChangesList.tsx';
import { DiffView } from './diff/DiffView.tsx';
import { Timeline } from './timeline/Timeline.tsx';
import { Ts } from './Ts.tsx';
import { changeIndex } from './urlState.ts';

const keyOf = (e?: TimelineEntry) => (e ? `${e.from}-${e.to}` : '');

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
  const [showTrivial, setShowTrivial] = useState(false);
  const all = useMemo(
    () => (showTrivial ? [...entries, ...trivialEntries(timeline)].sort((x, y) => (x.to < y.to ? -1 : 1)) : entries),
    [showTrivial, entries, timeline],
  );
  const shown = useMemo(() => ({ ...timeline, entries: all, trivialCaptures: showTrivial ? [] : trivialCaptures }), [timeline, all, showTrivial, trivialCaptures]);
  const [key, setKey] = useState(() => keyOf(entries[changeIndex(entries, initialChange)]));
  const selected = changeIndex(all, key);
  const entry = all[selected];
  const years = `${snapshots[0]?.ts.slice(0, 4)}–${snapshots.at(-1)?.ts.slice(0, 4)}`;
  const capUrl = (ts: string) => viewCaptureUrl(fixture.source.archive, ts, fixture.url);
  const page = (ts: string) => timeline.snapshots.find((s) => s.ts === ts);
  const choose = (e?: TimelineEntry) => {
    if (!e) return;
    setKey(keyOf(e));
    onChange(keyOf(e));
  };
  const select = (i: number) => choose(all[i]);
  const toggleTrivial = (on: boolean) => {
    setShowTrivial(on);
    if (!on && !entries.some((e) => keyOf(e) === key)) choose(entries.at(-1));
  };
  // The changes list starts collapsed on narrow screens, behind its "All changes (N)" summary.
  const [listOpen, setListOpen] = useState(() => typeof matchMedia !== 'function' || matchMedia('(min-width: 40rem)').matches);

  // An unknown `?change=` was resolved to the latest change: show that in the address bar too.
  useEffect(() => {
    if (initialChange !== undefined && initialChange !== key) onChange(key);
    // Runs once on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {trivialCaptures.length > 0 && (
        <label className="toggle">
          <input type="checkbox" checked={showTrivial} onChange={(e) => toggleTrivial(e.currentTarget.checked)} /> Show trivial edits
        </label>
      )}
      {entry ? (
        <>
          <Timeline timeline={shown} selected={selected} onSelect={select} labelledBy="timeline-heading" describedBy="timeline-legend" />
          <div className="tl-panes">
            <DiffView entry={entry} index={selected} count={all.length} from={page(entry.from)!} to={page(entry.to)!} captureUrl={capUrl} onSelect={select} />
            <details className="changes-pane" open={listOpen} onToggle={(e) => setListOpen(e.currentTarget.open)}>
              <summary id="changes-heading">All changes ({all.length})</summary>
              <ChangesList entries={all} selected={selected} onSelect={select} />
            </details>
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
