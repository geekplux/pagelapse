import { type FocusEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { progressText } from './liveState.ts';
import { useLiveTimeline } from './useLiveTimeline.ts';

interface Props {
  url: string;
  /** `?change=` to select once it has arrived; until then the latest change is shown. */
  initialChange?: string | undefined;
  onChange: (change: string) => void;
  /** Polite live region text (the caller throttles it, across runs, to one update per 2 s). */
  announce: (text: string) => void;
  /** Focus the status line on mount (the run was started by a button that is now gone). */
  focusStatus?: boolean | undefined;
  onRetry: () => void;
  onSample: () => void;
}

const years = (a?: string, b?: string) => (a && b ? `${a.slice(0, 4)}–${b.slice(0, 4)}` : '');

/**
 * A live run as an index card: status line (or empty and error states), then the stage without pictures (they come
 * in phase 15): the selected change, the timeline growing capture by capture, the changes list and the diff.
 */
export function LiveView({ url, initialChange, onChange, announce, focusStatus, onRetry, onSample }: Props) {
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
  // Captures not on the timeline yet: still coming (dotted) or failed (dashed).
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

  // Progress for screen readers: the part before " · " (AC 22).
  useEffect(() => announce(text.split(' · ')[0]!), [announce, text]);

  // Focus (WCAG 2.4.3). `target` is the status text, or the empty / error card's heading, whichever is showing.
  const target = useRef<HTMLElement | null>(null);
  const setTarget = useCallback((el: HTMLElement | null) => void (target.current = el), []);
  /** The element in this view that last had focus, until focus leaves it for another element that stays on the page. */
  const lastFocused = useRef<Element | null>(null);
  const article = useRef<HTMLElement>(null);
  // A layout effect: listening from the first commit, before anything can take focus.
  useLayoutEffect(() => {
    const el = article.current;
    if (!el) return;
    const onIn = (e: Event) => void (lastFocused.current = e.target as Element);
    const onOut = (e: Event) => {
      const t = e.target as Element;
      setTimeout(() => {
        if (t.isConnected && lastFocused.current === t) lastFocused.current = null;
      });
    };
    el.addEventListener('focusin', onIn);
    el.addEventListener('focusout', onOut);
    return () => {
      el.removeEventListener('focusin', onIn);
      el.removeEventListener('focusout', onOut);
    };
  }, []);
  useEffect(() => {
    if (focusStatus) target.current?.focus();
    // Mount only: a retry button started this run.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // When the run ends and takes the focused button (Cancel) with it, focus the status text or the card's heading
  // instead of <body>. Only then: a `?url=` page load, where nothing here had focus, never moves focus.
  const wasRunning = useRef(running);
  useEffect(() => {
    const ended = wasRunning.current && !running;
    wasRunning.current = running;
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (ended && lost && lastFocused.current && !lastFocused.current.isConnected) target.current?.focus();
  }, [running]);

  // While the slider has focus during a run, it keeps the picture it had: its value and range change only on input.
  const [frozen, setFrozen] = useState<{ timeline: typeof shown; marks: typeof marks } | null>(null);
  const strip = frozen ?? { timeline: shown, marks };
  const stripSelected = changeIndex(strip.timeline.entries, pick);
  const isSlider = (e: FocusEvent) => e.target instanceof Element && e.target.matches('.tl-slider');
  const onSliderFocus = (e: FocusEvent) => {
    if (!isSlider(e) || !running || !entry) return;
    setPick(pairOf(entry));
    setFrozen({ timeline: shown, marks });
  };
  const onSliderBlur = (e: FocusEvent) => {
    if (isSlider(e)) setFrozen(null);
  };
  const selectOnStrip = (i: number) => {
    const e = strip.timeline.entries[i];
    if (!e) return;
    setPick(pairOf(e));
    onChange(pairOf(e));
  };

  const span = years(captures[0]?.ts, captures.at(-1)?.ts);
  const quiet = status === 'done' && !entries.length && snapshots.length > 0;
  return (
    <article className="sheet" aria-labelledby="live-label" data-live={status} ref={article}>
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
          {span && <span>{span}</span>}
        </p>
      </div>
      {error?.code === 'no_captures' ? (
        <EmptyState url={url} onSample={onSample} headingRef={setTarget} />
      ) : error ? (
        <ErrorCard error={error} onRetry={onRetry} onSample={onSample} announce={announce} headingRef={setTarget} />
      ) : (
        <LoadingStatus text={text} running={running} onCancel={cancel} onRetry={status === 'cancelled' ? onRetry : undefined} textRef={setTarget} />
      )}
      {quiet && !showTrivial && (
        <section className="state-card" aria-labelledby="quiet-heading">
          <h3 id="quiet-heading">Nothing meaningful changed</h3>
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
          <div className="tl-area" onFocus={onSliderFocus} onBlur={onSliderBlur}>
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
            <Timeline
              timeline={strip.timeline}
              marks={strip.marks}
              selected={stripSelected}
              onSelect={selectOnStrip}
              labelledBy="timeline-heading"
              describedBy="timeline-legend"
            />
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
