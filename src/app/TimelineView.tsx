import { useEffect, useMemo, useRef, useState } from 'react';
import type { SampleFixture, TimelineEntry } from '../core/types.ts';
import { ARCHIVES } from '../archive/archives.ts';
import { viewCaptureUrl } from '../core/url.ts';
import { fixtureToSnapshots } from '../core/fixture.ts';
import { buildTimeline, trivialEntries } from '../core/timeline.ts';
import { changePictures, decodePicture } from '../samples/index.ts';
import { ChangesList } from './ChangesList.tsx';
import { ChangeCard, DiffView } from './diff/DiffView.tsx';
import { Timeline } from './timeline/Timeline.tsx';
import { Ts } from './Ts.tsx';
import { type UrlState, changeIndex } from './urlState.ts';
import { Filmstrip } from './visual/Filmstrip.tsx';
import { VisualPane } from './visual/VisualPane.tsx';
import { type Side, captureForChange, changeForCapture, initialView, pairOf, shotSrc, showingText, sideOf, viewQuery } from './visual/visualState.ts';

interface Props {
  fixture: SampleFixture;
  /** `<from>-<to>` pair to select first; the featured change, else the latest, when missing or unknown. */
  initialChange?: string | undefined;
  /** Capture to show first (`?at=`). */
  initialAt?: string | undefined;
  onChange: (q: Pick<UrlState, 'change' | 'at'>) => void;
}

/** The sample as an index card: the stage (picture and selected change), timeline, filmstrip, diff and all captures. */
export function TimelineView({ fixture, initialChange, initialAt, onChange }: Props) {
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
  const [view, setView] = useState(() => {
    const v = initialView(entries, snapshots.map((s) => s.ts), { change: initialChange, at: initialAt, featured: fixture.featured });
    return { key: entries[v.index] ? pairOf(entries[v.index]!) : '', at: v.at };
  });
  const selected = changeIndex(all, view.key);
  const entry = all[selected];
  const years = `${snapshots[0]?.ts.slice(0, 4)}–${snapshots.at(-1)?.ts.slice(0, 4)}`;
  const capUrl = (ts: string) => viewCaptureUrl(fixture.source.archive, ts, fixture.url);
  const page = (ts: string) => timeline.snapshots.find((s) => s.ts === ts);
  /** Selects change `e`, showing capture `at` (default: the same side as now, so Before stays Before while scrubbing). */
  const choose = (e?: TimelineEntry, at?: string) => {
    if (!e) return;
    const next = at ?? captureForChange(e, entry && sideOf(entry, view.at) === 'before' ? 'before' : 'after');
    setView({ key: pairOf(e), at: next });
    onChange(viewQuery(e, next));
  };
  const select = (i: number) => choose(all[i]);
  const showCapture = (ts: string, list = all) => choose(list[changeForCapture(list, ts)], ts);
  const toggleTrivial = (on: boolean) => {
    setShowTrivial(on);
    if (!on && !entries.some((e) => pairOf(e) === view.key)) showCapture(view.at, entries);
  };
  const thumbOf = (ts: string) => {
    const file = snapshots.find((s) => s.ts === ts)?.shot?.file;
    return file && shotSrc(fixture.id, file, true);
  };
  // The changes list starts collapsed on narrow screens, behind its "All changes (N)" summary.
  const [listOpen, setListOpen] = useState(() => typeof matchMedia !== 'function' || matchMedia('(min-width: 40rem)').matches);

  // An unknown `?change=` or `?at=` was resolved to what is shown: show that in the address bar too.
  useEffect(() => {
    const q = entries[changeIndex(entries, view.key)];
    if (q && ((initialChange !== undefined && initialChange !== view.key) || initialAt !== viewQuery(q, view.at).at)) onChange(viewQuery(q, view.at));
    // Runs once on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signal "rendered" to the smoke check once the timeline is in the DOM.
  useEffect(() => {
    if (!root.current) return;
    root.current.dataset.ready = 'true';
    performance.mark('wd:ready');
    // ... and "visual ready" once the first change's pictures have decoded (both sides, for the toggle and compare).
    const el = root.current;
    void Promise.all(changePictures(fixture, view.key).map(decodePicture)).then(() => {
      el.dataset.visualReady = 'true';
      performance.mark('wd:visual-ready');
    });
    // Runs once on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <article className="sheet" aria-labelledby="sample-label" ref={root}>
      <div className="sheet-head">
        <h2 id="sample-label">{fixture.label}</h2>
        <p className="sheet-url">
          <a className="mono" href={fixture.url}>
            {fixture.url}
          </a>
        </p>
        <p className="sheet-meta mono">
          <span>Cat. {fixture.id}</span>
          <span>{snapshots.length} captures</span>
          <span>{years}</span>
        </p>
      </div>
      <div className="stage">
        {entry && (
          <>
            <VisualPane fixture={fixture} entry={entry} at={view.at} trivial={trivial.has(view.at)} onSide={(side: Side) => choose(entry, captureForChange(entry, side))} />
            <div className="side">
              <ChangeCard entry={entry} index={selected} count={all.length} captureUrl={capUrl} onSelect={select} showing={showingText(snapshots.map((s) => s.ts), entry, view.at, trivial.has(view.at))} />
              <details className="changes-pane" open={listOpen} onToggle={(e) => setListOpen(e.currentTarget.open)}>
                <summary id="changes-heading">All changes ({all.length})</summary>
                <ChangesList entries={all} selected={selected} onSelect={select} />
              </details>
            </div>
          </>
        )}
        <div className="tl-area">
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
                <i className="mag-tick" /> {trivialCaptures.length} trivial captures{' '}
                {showTrivial ? 'shown as hollow entries.' : 'hidden (dates, counters, whitespace).'}
              </span>
            )}
          </p>
          {trivialCaptures.length > 0 && (
            <label className="toggle">
              <input type="checkbox" checked={showTrivial} onChange={(e) => toggleTrivial(e.currentTarget.checked)} /> Show trivial edits
            </label>
          )}
          {entry ? (
            <Timeline timeline={shown} selected={selected} onSelect={select} labelledBy="timeline-heading" describedBy="timeline-legend" thumbOf={thumbOf} />
          ) : (
            <p className="panel-summary" id="diff" tabIndex={-1}>
              Nothing meaningful changed across {snapshots.length} captures.
            </p>
          )}
        </div>
        <Filmstrip fixture={fixture} at={view.at} trivial={trivial} onSelect={(ts) => showCapture(ts)} />
        {entry && <DiffView entry={entry} from={page(entry.from)!} to={page(entry.to)!} />}
      </div>
      <p className="sheet-desc">{fixture.description}</p>
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
