import { type FocusEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ARCHIVES } from '../../archive/archives.ts';
import { trivialEntries, withAiSummaries } from '../../core/timeline.ts';
import type { TimelineEntry } from '../../core/types.ts';
import { viewCaptureUrl } from '../../core/url.ts';
import { ChangesList } from '../ChangesList.tsx';
import { ChangeCard, DiffView } from '../diff/DiffView.tsx';
import { EmptyState } from '../states/EmptyState.tsx';
import { ErrorCard } from '../states/ErrorCard.tsx';
import { LoadingStatus, type StatusFocus } from '../states/LoadingStatus.tsx';
import { stepIndex, tsToMs } from '../timeline/scale.ts';
import { Legend } from '../timeline/Legend.tsx';
import { Timeline } from '../timeline/Timeline.tsx';
import { type UrlState, changeIndex } from '../urlState.ts';
import { Filmstrip } from '../visual/Filmstrip.tsx';
import { VisualPane } from '../visual/VisualPane.tsx';
import { LIVE_MODE, type Mode, captureForChange, changeForCapture, liveView, pairOf, parseMode, showingText, sideOf, viewQuery } from '../visual/visualState.ts';
import { progressText } from './liveState.ts';
import { useLiveTimeline } from './useLiveTimeline.ts';
import { useSummaries } from './useSummaries.ts';

interface Props {
  url: string;
  /** `?change=` to select once it has arrived; until then the latest change is shown. */
  initialChange?: string | undefined;
  /** `?at=` and `?view=` to show first (Single when missing). */
  initialAt?: string | undefined;
  initialMode?: string | undefined;
  onChange: (q: Pick<UrlState, 'change' | 'at' | 'view'>) => void;
  /** Polite live region text (the caller throttles it, across runs, to one update per 2 s). */
  announce: (text: string) => void;
  /** Focus the status line on mount (the run was started by a button that is now gone). */
  focusStatus?: boolean | undefined;
  onRetry: () => void;
  onSample: () => void;
}

const years = (a?: string, b?: string) => (a && b ? `${a.slice(0, 4)}–${b.slice(0, 4)}` : '');
const IA = ARCHIVES['internet-archive'];

/**
 * A live run: the hero (title, then the empty or error card, or the replay pane and the side column: the run's status
 * line over the selected change), the scrub strip (filmstrip and timeline growing capture by capture), the folded
 * changes list and the diff.
 */
export function LiveView({ url, initialChange, initialAt, initialMode, onChange, announce, focusStatus, onRetry, onSample }: Props) {
  const { state, cancel } = useLiveTimeline(url);
  const { status, captures, failed, error } = state;
  const ai = useSummaries(url, state.timeline.entries, status);
  const timeline = useMemo(() => withAiSummaries(state.timeline, ai), [state.timeline, ai]);
  const { entries, trivialCaptures, snapshots } = timeline;
  const [pick, setPick] = useState(initialChange);
  /** The user has picked a change or capture here (timeline, filmstrip, list, Previous / Next, Before / After). */
  const [picked, setPicked] = useState(false);
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
  // The capture shown in Single mode, while its change is selected; else the change's After.
  const [at, setAt] = useState(initialAt && initialChange ? { key: initialChange, ts: initialAt } : undefined);
  const shownAt = entry && at?.key === pairOf(entry) ? at.ts : entry?.to;
  const [mode, setMode] = useState<Mode>(() => parseMode(initialMode) ?? LIVE_MODE);
  /** Selects change `e`, showing capture `ts` (default: the same side as now). */
  const choose = (e?: TimelineEntry, ts?: string, m = mode) => {
    if (!e) return;
    const next = ts ?? captureForChange(e, entry && shownAt && sideOf(entry, shownAt) === 'before' ? 'before' : 'after');
    setPick(pairOf(e));
    setPicked(true);
    setAt({ key: pairOf(e), ts: next });
    onChange(viewQuery(e, next, m, LIVE_MODE));
  };
  const select = (i: number) => choose(all[i]);
  const page = (ts: string) => snapshots.find((s) => s.ts === ts)!;
  const pages = useMemo(() => new Map(snapshots.map((s) => [s.ts, s])), [snapshots]);
  const view = (ts: string) => liveView(url, ts, pages.get(ts));
  // The filmstrip: every capture that has joined the timeline or failed, as a text silhouette (no image requests).
  const items = useMemo(() => captures.slice(0, state.next).map((c) => liveView(url, c.ts, pages.get(c.ts))), [captures, state.next, url, pages]);
  const trivialSet = useMemo(() => new Set(trivialCaptures), [trivialCaptures]);
  const side = entry && shownAt && sideOf(entry, shownAt) === 'before' ? 'before' : 'after';
  const changeSteps = all.map((e) => captureForChange(e, side));
  const running = status === 'captures' || status === 'snapshots';
  // While a run fetches, the selection follows the newest change: no archived page loads for it until the user picks
  // one (or opened a `?change=` link to it) or the run ends, so a run never loads pages nobody asked for.
  const asked = picked || (!!initialChange && pick === initialChange && !!entry && pairOf(entry) === initialChange);
  const hold = running && !asked;
  const text = progressText(state);

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
  const isSlider = (e: FocusEvent | KeyboardEvent) => e.target instanceof Element && e.target.matches('.tl-slider');
  const onSliderFocus = (e: FocusEvent) => {
    if (!isSlider(e) || !running || !entry) return;
    setPick(pairOf(entry));
    setFrozen({ timeline: shown, marks });
  };
  const onSliderBlur = (e: FocusEvent) => {
    if (!isSlider(e)) return;
    setFrozen(null);
    cancelAnimationFrame(newsFrame.current);
    setNews('');
  };
  // Its own polite region: the run's throttled progress would overwrite this news.
  const [news, setNews] = useState('');
  const newsFrame = useRef(0);
  const selectOnStrip = (i: number) => choose(strip.timeline.entries[i]);
  // A key on the frozen slider first catches up with what arrived meanwhile (so End reaches the newest change) and
  // says how many changes are new: the value and range only ever change on the user's input.
  const onSliderKey = (e: KeyboardEvent) => {
    if (!frozen || !isSlider(e) || (frozen.timeline === shown && frozen.marks === marks)) return;
    const fresh = shown.entries.length - frozen.timeline.entries.length;
    setFrozen({ timeline: shown, marks });
    const i = stepIndex(e.key, changeIndex(shown.entries, pick), shown.entries.map((x) => tsToMs(x.to)));
    if (i === null) return;
    e.preventDefault();
    e.stopPropagation();
    choose(shown.entries[i]);
    // Cleared first, then set on the next frame, so the same news twice is announced twice.
    cancelAnimationFrame(newsFrame.current);
    setNews('');
    if (fresh > 0) newsFrame.current = requestAnimationFrame(() => setNews(`${fresh} more change${fresh === 1 ? '' : 's'} arrived.`));
  };

  // The run's status line sits at the top of the side column, directly under the picture on phones, so a running run
  // shows its progress and Cancel in the first viewport; with no side column it follows the title. It moves between
  // the two (a remount), so it carries focus across (`carry`).
  const carried = useRef<StatusFocus>(null);
  const carry = useMemo(
    () => ({
      take: () => {
        const where = carried.current;
        carried.current = null;
        return where;
      },
      keep: (where: StatusFocus) => void (carried.current = where),
    }),
    [],
  );
  const statusLine = !error && (
    <LoadingStatus text={text} running={running} progress={captures.length ? [state.next, captures.length] : undefined} onCancel={cancel} onRetry={status === 'cancelled' ? onRetry : undefined} textRef={setTarget} carry={carry} />
  );
  const withSide = captures.length > 0 && (!!(entry && shownAt) || running);

  const span = years(captures[0]?.ts, captures.at(-1)?.ts);
  const quiet = status === 'done' && !entries.length && snapshots.length > 0;
  const card = (lead?: ReactNode, tools?: ReactNode) =>
    entry && (
    <ChangeCard
      entry={entry}
      index={selected}
      count={all.length}
      captureUrl={(ts) => viewCaptureUrl(IA.id, ts, url)}
      onSelect={select}
      showing={shownAt && showingText(captures.map((c) => c.ts), entry, shownAt, trivialSet.has(shownAt))}
      lead={lead}
      tools={tools}
    />
  );
  return (
    <article className="sheet" aria-labelledby="live-label" data-live={status} ref={article}>
      <div className="stage live-stage">
        <div className="hero" data-region="hero">
          <div className="sheet-head">
            <h2 id="live-label">{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</h2>
            <p className="sheet-meta mono">
              Live{captures.length > 0 && ` · ${captures.length} captures`}
              {span && ` · ${span}`}
            </p>
          </div>
          {error?.code === 'no_captures' ? (
            <EmptyState url={url} onSample={onSample} headingRef={setTarget} />
          ) : (
            error && <ErrorCard error={error} onRetry={onRetry} onSample={onSample} announce={announce} headingRef={setTarget} />
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
          {captures.length > 0 &&
            (entry && shownAt ? (
              <VisualPane
                label={url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                captures={captures.map((c) => c.ts)}
                link={(ts) => viewCaptureUrl(IA.id, ts, url)}
                view={view}
                entry={entry}
                at={shownAt}
                trivial={trivialSet.has(shownAt)}
                mode={mode}
                onMode={(m) => {
                  setMode(m);
                  onChange(viewQuery(entry, shownAt, m, LIVE_MODE));
                }}
                onSide={(s) => choose(entry, captureForChange(entry, s))}
                steps={shownAt && changeSteps.includes(shownAt) ? changeSteps : snapshots.map((x) => x.ts)}
                runActive={running}
                hold={hold}
                side={(lead, tools) => (
                  <div className="side">
                    {statusLine}
                    {card(lead, tools)}
                  </div>
                )}
              />
            ) : (
              running && (
                <>
                  <section className="vpane vpane-wait" aria-labelledby="vpane-heading">
                    <h3 id="vpane-heading" className="sr-only">
                      How it looked
                    </h3>
                    <figure className="vp-mat">
                      <p className="vp-shot live-wait">The page as the Internet Archive kept it shows here once the first change is found.</p>
                      <figcaption className="vp-cap mono">&nbsp;</figcaption>
                    </figure>
                  </section>
                  <div className="side">
                    {statusLine}
                    <p className="live-wait">The first change shows here as soon as two captures have been compared.</p>
                  </div>
                </>
              )
            ))}
          {!withSide && statusLine}
        </div>
        {captures.length > 0 && (
          <div className="scrub" data-region="scrub">
            <Filmstrip items={items} pending={captures.length - items.length} at={shownAt ?? ''} trivial={trivialSet} onSelect={(ts) => choose(all[changeForCapture(all, ts)], ts)} />
            <div className="tl-area" onFocus={onSliderFocus} onBlur={onSliderBlur} onKeyDownCapture={onSliderKey}>
              <h3 id="timeline-heading" className="sr-only">
                Timeline
              </h3>
              {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
              <span className="sr-only" role="status">
                {news}
              </span>
              <Timeline
                timeline={strip.timeline}
                marks={strip.marks}
                selected={stripSelected}
                onSelect={selectOnStrip}
                labelledBy="timeline-heading"
                describedBy="timeline-legend"
              />
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
            </div>
          </div>
        )}
        {entry && (
          <div className="lists" data-region="changes">
            <details className="fold changes-pane">
              <summary id="changes-heading">All changes ({all.length})</summary>
              <ChangesList entries={all} selected={selected} onSelect={select} />
            </details>
          </div>
        )}
        {entry && <DiffView entry={entry} from={page(entry.from)} to={page(entry.to)} />}
      </div>
    </article>
  );
}
