import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatTimestampLong, formatTimestampShort } from '../../core/timestamp.ts';
import type { Timeline as Model } from '../../core/types.ts';
import { describeChange } from '../describe.ts';
import { keepInView } from '../keepInView.ts';
import { Silhouette } from '../visual/Silhouette.tsx';
import type { CaptureView } from '../visual/visualState.ts';
import { barHeight, hairline, tsToMs, yearLabels, yearScale } from './scale.ts';
import { useScrubber } from './useScrubber.ts';

/** The axis line's y in the full ribbon; the bends take the 56 px above the tallest bar band. */
const AXIS = 100;
const H = 128;
const BEND = 56;
/** The selected span's band and its cyan start line: 46 px tall, sitting on the axis. */
const BAND = 46;
const GAP = 8;
/** Thumbnails never get narrower than this; the ribbon scrolls inside its own box instead. */
const MIN_THUMB = 56;
/** The scroll box's padding (rings, the 2 px lift and the focus ring stay inside it). */
const PAD = 8;
/** Phones: no thumbnails or bends, as on target/V3WorkPhone.html; the band, bars and years fit the column. */
const COMPACT = '(max-width: 39.99rem)';
const DOT_Y = AXIS - 3.5;

type Side = 'before' | 'after';
const SIDE: Record<Side, string> = { before: 'Before', after: 'After' };

interface Props {
  /** The captures that have arrived (or failed), oldest first: a recorded thumbnail, a text outline or no picture. */
  items: readonly CaptureView[];
  /** Live runs: captures still to come keep their place as empty slots after `items`, so nothing moves as they arrive. */
  pending?: number;
  /** Every capture's time, `items` and pending alike: the axis spans them all from the start. */
  times: readonly string[];
  timeline: Model;
  /** The selected change (the slider's value), an index into `timeline.entries`. */
  selected: number;
  /** The pair on the stage (rings, coloured hairlines, the shaded span); the selected change by default. */
  pair?: { from: string; to: string } | undefined;
  /** The capture the stage shows. */
  at: string;
  /** Live runs: captures that could not be fetched. */
  failed?: ReadonlySet<string>;
  onSelect: (i: number) => void;
  onCapture: (ts: string) => void;
  /** Id of the element naming the slider. */
  labelledBy: string;
  /** Live runs: what is still coming, for the slider's description. */
  note?: string;
}

const NONE: ReadonlySet<string> = new Set();
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}

const STRIP_KEYS: Record<string, (i: number, n: number) => number> = {
  ArrowLeft: (i) => i - 1,
  ArrowRight: (i) => i + 1,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/**
 * The time ribbon: one thumbnail per capture, evenly spaced, each with a 0.5 px hairline bending down to its real date
 * on a year axis. On the axis a meaningful change is a 3 px bar (height from its score), a capture that only changed
 * dates or counters a hollow dot, the first capture a filled dot. The stage's pair is ringed (Before cyan, After amber,
 * plus the words in each thumbnail's name), its hairlines drawn in those colours, the span between their dates shaded
 * with a cyan line at its start, and the selected change's bar in amber.
 *
 * Two tab stops: the thumbnails (one stop, roving with Left/Right/Home/End; Enter or Space shows that capture) and the
 * axis, an APG slider over the changes whose value text is the change's description.
 */
export function Ribbon({ items, pending = 0, times, timeline, selected, pair, at, failed = NONE, onSelect, onCapture, labelledBy, note }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLOListElement>(null);
  const compact = useMedia(COMPACT);
  const [cw, setCw] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    setCw(el.clientWidth);
    const ro = new ResizeObserver(([e]) => e && setCw(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { entries, trivialCaptures, snapshots } = timeline;
  const n = times.length;
  const width = compact ? cw || 358 : Math.max(cw || 1200, n * MIN_THUMB + (n - 1) * GAP);
  const thumbW = (width - (n - 1) * GAP) / n;
  const g = useMemo(() => {
    const ms = times.map(tsToMs);
    const scale = yearScale(ms.length ? ms : [Date.now()], width);
    const dateX = new Map(times.map((t, i) => [t, scale.x(ms[i]!)]));
    const xOf = (ts: string) => dateX.get(ts) ?? scale.x(tsToMs(ts));
    const bars = entries.map((e) => ({ x: xOf(e.to), trivial: e.significance.magnitude === 'trivial', h: barHeight(e.significance.score) }));
    // Where each capture's hairline lands: the top of its bar or dot, else (failed) the axis.
    const ends = new Map<string, number>();
    for (const ts of trivialCaptures) ends.set(ts, DOT_Y - 2.75);
    entries.forEach((e, i) => ends.set(e.to, bars[i]!.trivial ? DOT_Y - 2.75 : AXIS - bars[i]!.h));
    const first = snapshots[0]?.ts;
    if (first) ends.set(first, AXIS - 4);
    return { xOf, bars, ends, first, ticks: scale.ticks, labels: yearLabels(scale.ticks, width) };
  }, [times, width, entries, trivialCaptures, snapshots]);

  const xs = useMemo(() => g.bars.map((b) => b.x), [g]);
  const changeTimes = useMemo(() => entries.map((e) => tsToMs(e.to)), [entries]);
  const shown = pair ?? entries[selected];
  const sideOf = (ts: string): Side | undefined => (!shown ? undefined : ts === shown.from ? 'before' : ts === shown.to ? 'after' : undefined);
  const cx = (i: number) => i * (thumbW + GAP) + thumbW / 2;
  const trivial = useMemo(() => new Set([...trivialCaptures, ...entries.filter((e) => e.significance.magnitude === 'trivial').map((e) => e.to)]), [trivialCaptures, entries]);

  // The thumbnails' roving tab stop; it snaps back to the shown capture whenever that changes.
  const sel = items.findIndex((v) => v.ts === at);
  const [roving, setRoving] = useState({ sel, i: sel });
  const focus = roving.sel === sel ? roving.i : Math.max(0, sel);
  const thumbs = () => strip.current?.querySelectorAll('button') ?? [];
  const onStripKey = (e: KeyboardEvent) => {
    const step = STRIP_KEYS[e.key];
    if (!step) return;
    e.preventDefault();
    const next = clamp(step(focus, items.length), 0, items.length - 1);
    setRoving({ sel, i: next });
    thumbs()[next]?.focus();
  };
  const [thumbTip, setThumbTip] = useState<number | null>(null);

  /** Scroll the ribbon (never the page) so the pair's thumbnails and dates are in view; nothing moves when they are. */
  const reveal = () => {
    const el = box.current;
    if (!el || !shown || el.scrollWidth <= el.clientWidth) return;
    const idx = [shown.from, shown.to].map((t) => times.indexOf(t)).filter((i) => i >= 0);
    const edges = [...idx.flatMap((i) => [cx(i) - thumbW / 2, cx(i) + thumbW / 2]), g.xOf(shown.from), g.xOf(shown.to)];
    const lo = Math.min(...edges);
    const to = keepInView(lo + PAD, Math.max(...edges) - lo, el.scrollLeft, el.clientWidth, PAD, PAD);
    if (to !== null) el.scrollTo({ left: to });
  };
  const { hover, focusTip, dragging, handlers, tipHandlers } = useScrubber(xs, changeTimes, selected, onSelect, reveal);
  useEffect(() => {
    if (!dragging.current) reveal();
    // `reveal` reads the pair, the geometry and the box ref.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.from, shown?.to, width, dragging]);

  const entry = entries[selected];
  const top = compact ? BEND : 0;
  const stripH = compact ? 0 : thumbW * 0.625;
  const x0 = shown ? g.xOf(shown.from) : 0;
  const x1 = shown ? g.xOf(shown.to) : 0;
  const svg = (
    <svg aria-hidden="true" width={width} height={H - top} viewBox={`0 ${top} ${width} ${H - top}`}>
      {shown && <rect className="rb-span" x={0} y={AXIS - BAND} width={1} height={BAND} style={{ transform: `translateX(${x0}px) scaleX(${Math.max(1, x1 - x0)})` }} />}
      {!compact &&
        items.map((v, i) => {
          const end = g.ends.get(v.ts) ?? AXIS;
          return <path key={v.ts} className="rb-cv" data-side={sideOf(v.ts)} d={hairline(cx(i), g.xOf(v.ts), end)} />;
        })}
      {g.first && <circle className="rb-first" cx={g.xOf(g.first)} cy={DOT_Y} r={3.25} />}
      {trivialCaptures.map((ts) => (
        <circle key={ts} className="rb-dot" cx={g.xOf(ts)} cy={DOT_Y} r={2.75} />
      ))}
      {g.bars.map((b, i) =>
        b.trivial ? (
          <circle key={entries[i]!.to} className={`rb-dot${i === selected ? ' is-sel' : ''}`} data-index={i} cx={b.x} cy={DOT_Y} r={2.75} />
        ) : (
          <rect key={entries[i]!.to} className={`rb-bar${i === selected ? ' is-sel' : ''}`} data-index={i} x={b.x - 1.5} y={AXIS - b.h} width={3} height={b.h} rx={1} />
        ),
      )}
      {shown && <rect className="rb-start" x={-0.5} y={AXIS - BAND} width={1} height={BAND} style={{ transform: `translateX(${x0}px)` }} />}
      <path className="rb-ax" d={`M0 ${AXIS}H${width}`} />
      {g.ticks.map((k) => (
        <path key={k.year} className="rb-ax" d={`M${k.x} ${AXIS}v5`} />
      ))}
      {g.labels.map((k) => (
        <text key={k.year} className="rb-yr" x={k.x} y={AXIS + 20} textAnchor={k.anchor}>
          {k.year}
        </text>
      ))}
    </svg>
  );

  const outlines = items.some((v) => v.page);
  const tip = hover ?? (focusTip ? selected : null);
  const tipEntry = tip === null ? undefined : entries[tip];
  const tipBar = tip === null ? undefined : g.bars[tip];
  const thumbItem = thumbTip === null || tipEntry ? undefined : items[thumbTip];
  const half = Math.min(cw / 2, 136);
  return (
    <div className="rb" ref={outer}>
      <p id="rb-hint" hidden>
        {entries.length} {entries.length === 1 ? 'change' : 'changes'} across {n} captures. Bar height shows how much the text changed; a hollow dot is a capture
        that only changed dates or counters.{note && ` ${note}`}
      </p>
      <p id="rb-strip-hint" hidden>
        {n} captures, oldest first.{outlines && ' Thumbnails are text outlines of each capture, not pictures.'} Arrow keys move along the thumbnails; Enter
        shows a capture.
      </p>
      <div className="rb-scroll" ref={box} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
        <div className="rb-in" style={{ width }}>
          {!compact && (
            // Safari drops list semantics when list-style is none, so the role is not redundant here.
            // oxlint-disable-next-line jsx-a11y/no-redundant-roles, jsx-a11y/no-noninteractive-element-interactions
            <ol className="rb-strip" role="list" aria-label="Thumbnails" ref={strip} onKeyDown={onStripKey}>
              {items.map((v, i) => {
                const side = sideOf(v.ts);
                const none = v.source === 'none';
                const label = [
                  `Capture ${i + 1} of ${n}, ${formatTimestampLong(v.ts)}`,
                  side && SIDE[side],
                  trivial.has(v.ts) && 'trivial edit',
                  v.status === 'partial' && 'partial copy',
                  none && (failed.has(v.ts) ? 'could not be fetched' : 'no picture'),
                ].filter(Boolean).join(', ');
                return (
                  <li key={v.ts}>
                    <button
                      type="button"
                      className="rb-th"
                      data-ts={v.ts}
                      data-side={side}
                      data-trivial={trivial.has(v.ts) || undefined}
                      data-partial={v.status === 'partial' || undefined}
                      tabIndex={i === focus ? 0 : -1}
                      aria-label={label}
                      aria-current={v.ts === at ? 'true' : undefined}
                      aria-describedby={i === focus ? 'rb-strip-hint' : undefined}
                      onClick={() => onCapture(v.ts)}
                      onFocus={(e) => {
                        setRoving({ sel, i });
                        if (e.currentTarget.matches(':focus-visible')) setThumbTip(i);
                      }}
                      onBlur={() => setThumbTip(null)}
                      onPointerEnter={() => setThumbTip(i)}
                      onPointerLeave={() => setThumbTip(null)}
                    >
                      {v.thumb ? (
                        <img src={v.thumb} width={320} height={200} alt="" loading="lazy" decoding="async" />
                      ) : v.page ? (
                        <Silhouette page={v.page} />
                      ) : (
                        <span className="rb-none">{failed.has(v.ts) ? 'not fetched' : 'no picture'}</span>
                      )}
                    </button>
                  </li>
                );
              })}
              {Array.from({ length: pending }, (_, i) => (
                <li key={`p${i}`} className="rb-pending" aria-hidden="true" />
              ))}
            </ol>
          )}
          {entry ? (
            <div
              className="rb-slider"
              // A native range input cannot hold the SVG axis; this div implements the APG slider pattern.
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
              role="slider"
              tabIndex={0}
              aria-labelledby={labelledBy}
              aria-describedby="rb-hint"
              aria-orientation="horizontal"
              aria-valuemin={1}
              aria-valuemax={entries.length}
              aria-valuenow={selected + 1}
              aria-valuetext={describeChange(entry, selected, entries.length)}
              {...handlers}
            >
              {svg}
            </div>
          ) : (
            svg
          )}
        </div>
      </div>
      {tipEntry && tipBar && (
        <div
          className="rb-tip"
          aria-hidden="true"
          {...tipHandlers(tip!)}
          style={{ left: clamp(tipBar.x - scrollX, half, cw - half), top: stripH + AXIS - top - (tipBar.trivial ? 6 : tipBar.h) - GAP }}
        >
          <span className="mono">
            {formatTimestampShort(tipEntry.from)} → {formatTimestampShort(tipEntry.to)}, <b>{tipEntry.significance.magnitude}</b>,{' '}
            {tipEntry.aiSummary ? 'AI summary' : 'auto summary'}
          </span>
          <span>{tipEntry.aiSummary ?? tipEntry.ruleSummary}</span>
        </div>
      )}
      {thumbItem && thumbTip !== null && (
        <div className="rb-tip rb-tip-cap" aria-hidden="true" style={{ left: clamp(cx(thumbTip) - scrollX, 64, cw - 64), top: -GAP }}>
          <span className="mono">{formatTimestampShort(thumbItem.ts)}</span>
          {trivial.has(thumbItem.ts) && <span>trivial edit</span>}
          {thumbItem.status === 'partial' && <span>partial copy</span>}
        </div>
      )}
    </div>
  );
}

/** "3 captures only changed dates or counters." with Show them / Hide them: puts those captures on the slider too. */
export function TrivialToggle({ count, on, onToggle }: { count: number; on: boolean; onToggle: (on: boolean) => void }) {
  if (!count) return null;
  return (
    <p className="rb-trivial">
      {count} {count === 1 ? 'capture' : 'captures'} only changed dates or counters.{' '}
      <button type="button" className="btn-link" onClick={() => onToggle(!on)}>
        {on ? 'Hide them' : 'Show them'}
      </button>
    </p>
  );
}
