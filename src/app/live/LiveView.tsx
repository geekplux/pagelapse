import { useEffect, useMemo, useState } from 'react';
import { trivialEntries } from '../../core/timeline.ts';
import { viewCaptureUrl } from '../../core/url.ts';
import { ChangesList } from '../ChangesList.tsx';
import { ChangeCard, DiffView } from '../diff/DiffView.tsx';
import { EmptyState } from '../states/EmptyState.tsx';
import { ErrorCard } from '../states/ErrorCard.tsx';
import { LoadingStatus } from '../states/LoadingStatus.tsx';
import { Legend } from '../timeline/Legend.tsx';
import { Timeline } from '../timeline/Timeline.tsx';
import { changeIndex } from '../urlState.ts';
import { pairOf } from '../visual/visualState.ts';
import { progressText, throttleLatest } from './liveState.ts';
import { useLiveTimeline } from './useLiveTimeline.ts';

interface Props {
  url: string;
  /** `?change=` to select once it has arrived; until then the latest change is shown. */
  initialChange?: string | undefined;
  onChange: (change: string) => void;
  /** Polite live region text (throttled here to one update per 2 s). */
  announce: (text: string) => void;
  onRetry: () => void;
  onSample: () => void;
}

const years = (a?: string, b?: string) => (a && b ? `${a.slice(0, 4)}–${b.slice(0, 4)}` : '');

/**
 * A live run as an index card: status line (or empty and error states), then the stage without pictures (they come
 * in phase 15): the selected change, the timeline growing capture by capture, the changes list and the diff.
 */
export function LiveView({ url, initialChange, onChange, announce, onRetry, onSample }: Props) {
  const { state, cancel } = useLiveTimeline(url);
  const { status, captures, timeline, failed, error } = state;
  const { entries, trivialCaptures, snapshots } = timeline;
  const [pick, setPick] = useState(initialChange);
  const [showTrivial, setShowTrivial] = useState(false);
  const all = useMemo(
    () => (showTrivial ? [...entries, ...trivialEntries(timeline)].sort((x, y) => (x.to < y.to ? -1 : 1)) : entries),
    [showTrivial, entries, timeline],
  );
  const shown = useMemo(() => ({ ...timeline, entries: all, trivialCaptures: showTrivial ? [] : trivialCaptures }), [timeline, all, showTrivial, trivialCaptures]);
  // Captures not on the timeline yet: still coming (hairline) or failed (dashed).
  const marks = useMemo(() => {
    const done = new Set(snapshots.map((s) => s.ts));
    return captures.filter((c) => !done.has(c.ts)).map((c) => ({ ts: c.ts, failed: failed.includes(c.ts) }));
  }, [captures, snapshots, failed]);
  const selected = changeIndex(all, pick);
  const entry = all[selected];
  const select = (i: number) => {
    const e = all[i];
    if (!e) return;
    setPick(pairOf(e));
    onChange(pairOf(e));
  };
  const page = (ts: string) => snapshots.find((s) => s.ts === ts)!;
  const running = status === 'captures' || status === 'snapshots';
  const text = progressText(state);
  const [listOpen, setListOpen] = useState(() => typeof matchMedia !== 'function' || matchMedia('(min-width: 40rem)').matches);

  // Progress for screen readers: the part before " · ", at most once every 2 s (AC 22).
  const [say] = useState(() => throttleLatest<string>(2000, announce));
  useEffect(() => say.push(text.split(' · ')[0]!), [say, text]);
  useEffect(() => () => say.cancel(), [say]);

  const quiet = status === 'done' && !entries.length && snapshots.length > 0;
  return (
    <article className="sheet" aria-labelledby="live-label" data-live={status}>
      <div className="sheet-head">
        <h2 id="live-label">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</h2>
        <p className="sheet-url">
          <a className="mono" href={url}>
            {url}
          </a>
        </p>
        <p className="sheet-meta mono">
          <span>Live</span>
          {captures.length > 0 && <span>{captures.length} captures</span>}
          <span>{years(captures[0]?.ts, captures.at(-1)?.ts)}</span>
        </p>
      </div>
      {error?.code === 'no_captures' ? (
        <EmptyState url={url} onSample={onSample} />
      ) : error ? (
        <ErrorCard error={error} onRetry={onRetry} onSample={onSample} />
      ) : (
        <LoadingStatus text={text} running={running} onCancel={cancel} onRetry={status === 'cancelled' ? onRetry : undefined} />
      )}
      {quiet && !showTrivial && (
        <section className="state-card" aria-labelledby="quiet-heading">
          <h2 id="quiet-heading">Nothing meaningful changed</h2>
          <p>
            {snapshots.length} captures, {years(snapshots[0]?.ts, snapshots.at(-1)?.ts)}: nothing meaningful changed. {trivialCaptures.length} trivial
            edits hidden (dates, counters, whitespace).
          </p>
        </section>
      )}
      {captures.length > 0 && (
        <div className="stage live-stage">
          {entry ? (
            <div className="side">
              <ChangeCard entry={entry} index={selected} count={all.length} captureUrl={(ts) => viewCaptureUrl('internet-archive', ts, url)} onSelect={select} />
            </div>
          ) : (
            running && <p className="side live-wait">The first change shows here as soon as two captures have been compared.</p>
          )}
          <div className="tl-area">
            <h3 id="timeline-heading">Timeline</h3>
            <Legend changes={entries.length} trivial={trivialCaptures.length} showTrivial={showTrivial} onTrivial={setShowTrivial}>
              {marks.length > failed.length && (
                <span>
                  <i className="mark-pending" /> not fetched yet
                </span>
              )}
              {failed.length > 0 && (
                <span>
                  <i className="mark-failed" /> {failed.length} could not be fetched
                </span>
              )}
            </Legend>
            <Timeline timeline={shown} marks={marks} selected={selected} onSelect={select} labelledBy="timeline-heading" describedBy="timeline-legend" />
          </div>
          {entry && (
            <details className="changes-pane" open={listOpen} onToggle={(e) => setListOpen(e.currentTarget.open)}>
              <summary id="changes-heading">All changes ({all.length})</summary>
              <ChangesList entries={all} selected={selected} onSelect={select} />
            </details>
          )}
          {entry && <DiffView entry={entry} from={page(entry.from)} to={page(entry.to)} />}
        </div>
      )}
    </article>
  );
}
