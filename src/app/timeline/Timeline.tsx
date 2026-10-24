import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatTimestampShort } from '../../core/timestamp.ts';
import type { Timeline as Model } from '../../core/types.ts';
import { describeChange } from '../describe.ts';
import { YEAR, markerRadius, stackLevels, timeScale, tsToMs, yearLabels, yearTicks } from './scale.ts';
import { useScrubber } from './useScrubber.ts';

const H = 168;
const BASE = 122;
const PAD = 28;
const MIN_PX_PER_YEAR = 28;
/** Strip padding (px) so the slider's focus ring is not clipped by the scroll container. */
const INSET = 4;
const MAX_LEVEL = 2;
const levelY = (level: number) => BASE - 30 - Math.min(level, MAX_LEVEL) * 30;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

interface Props {
  timeline: Model;
  selected: number;
  onSelect: (i: number) => void;
  /** Id of the element naming the slider (the timeline heading). */
  labelledBy: string;
  /** Id of the element describing the slider (the legend). */
  describedBy: string;
  /** Thumbnail of a capture, shown in the tooltip (samples). */
  thumbOf?: (ts: string) => string | undefined;
  /** Live runs: captures still being fetched (dotted, below the baseline only) or that failed (taller, dashed). */
  marks?: readonly { ts: string; failed: boolean }[];
}

const NO_MARKS: NonNullable<Props['marks']> = [];
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The seismograph strip: year axis, a hairline per capture, hollow ticks for trivial captures and
 * one marker per meaningful change (one size step per magnitude, a second ring on majors; lightness
 * and the word in the tooltip and list say it too).
 * A focusable `role="slider"` wraps the `aria-hidden` SVG; the changes list is its text alternative.
 */
export function Timeline({ timeline, selected, onSelect, labelledBy, describedBy, thumbOf, marks = NO_MARKS }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
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

  const { entries, snapshots, trivialCaptures } = timeline;
  const g = useMemo(() => {
    const caps = [...snapshots, ...marks].map((s) => tsToMs(s.ts));
    const years = (Math.max(...caps) - Math.min(...caps)) / YEAR;
    const times = entries.map((e) => tsToMs(e.to));
    const rs = entries.map((e) => markerRadius(e.significance.magnitude));
    // Widen the strip (it scrolls) until every marker fits in the three stacking levels without overlap.
    let width = Math.max(cw - 2 * INSET, years * MIN_PX_PER_YEAR + 2 * PAD);
    let s = timeScale(caps, PAD, width - PAD);
    let levels = stackLevels(times.map(s.x), rs, 99);
    for (let n = 0; n < 12 && Math.max(0, ...levels) > MAX_LEVEL; n++) {
      width *= 1.25;
      s = timeScale(caps, PAD, width - PAD);
      levels = stackLevels(times.map(s.x), rs, 99);
    }
    const points = times.map((t, i) => ({ x: s.x(t), y: levelY(levels[i] ?? 0) }));
    const ticks = yearTicks(s.t0, s.t1).map((k) => ({ ...k, x: s.x(k.t) }));
    const trivial = new Set(trivialCaptures);
    // The seismograph trace: flat, with a jolt at each change whose amplitude follows the score.
    let trace = `M${PAD / 2} ${BASE}`;
    let end = PAD / 2;
    points.forEach(({ x }, i) => {
      const a = 4 + 18 * (entries[i]?.significance.score ?? 0);
      const x0 = Math.max(end, x - 5);
      trace += `L${x0} ${BASE}L${x - 2} ${BASE - a}L${x + 2} ${BASE + a * 0.5}L${x + 5} ${BASE}`;
      end = x + 5;
    });
    trace += `L${width - PAD / 2} ${BASE}`;
    const extra = marks.map((m, i) => ({ x: s.x(caps[snapshots.length + i]!), failed: m.failed }));
    return { width, s, times, rs, points, ticks, trace, extra, caps: snapshots.map((c, i) => ({ x: s.x(caps[i]!), trivial: trivial.has(c.ts) })) };
  }, [cw, entries, snapshots, trivialCaptures, marks]);

  const sel = g.points[selected];
  /** Scroll the strip so the selection is visible; smooth after a drag unless reduced motion is on. */
  const reveal = (smooth: boolean) => {
    const el = strip.current;
    if (!el || !sel) return;
    if (sel.x >= el.scrollLeft + PAD && sel.x <= el.scrollLeft + el.clientWidth - PAD) return;
    el.scrollTo({ left: sel.x - el.clientWidth / 2, behavior: smooth && !reducedMotion() ? 'smooth' : 'instant' });
  };
  const { hover, focusTip, dragging, handlers, tipHandlers } = useScrubber(g.points, g.times, selected, onSelect, () => reveal(true));
  useEffect(() => {
    if (!dragging.current) reveal(false);
    // `reveal` reads only `sel` and the strip ref.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, dragging]);
  const entry = entries[selected];
  const labelX = sel ? clamp(sel.x, 40, g.width - 40) : 0;
  const labels = yearLabels(g.ticks, g.s.pxPerYear, { minGap: 44, half: 17, width: g.width, ...(sel && { avoid: [labelX - 42, labelX + 42] }) });
  const tip = hover ?? (focusTip ? selected : null);
  const tipEntry = tip === null ? undefined : entries[tip];
  const tipAt = tip === null ? undefined : g.points[tip];
  const stagger = Math.min(40, 400 / Math.max(1, entries.length));
  const svg = (
    <svg aria-hidden="true" width={g.width} height={H} viewBox={`0 0 ${g.width} ${H}`}>
      {g.ticks.map((k) => (
        <g key={k.year}>
          <line className="tl-grid" x1={k.x} x2={k.x} y1={6} y2={BASE} />
          <line className="tl-axis" x1={k.x} x2={k.x} y1={BASE} y2={BASE + 6} />
        </g>
      ))}
      <path className="tl-trace" d={g.trace} />
      {g.caps.map((c, i) =>
        c.trivial ? (
          <rect key={i} className="tl-trivial" x={c.x - 2.5} y={BASE - 8} width={5} height={16} rx={2.5} />
        ) : (
          <line key={i} className="tl-cap" x1={c.x} x2={c.x} y1={BASE - 6} y2={BASE + 6} />
        ),
      )}
      {g.extra.map((m, i) =>
        m.failed ? (
          <line key={`m${i}`} className="tl-failed" x1={m.x} x2={m.x} y1={BASE - 14} y2={BASE + 6} />
        ) : (
          // Shape cue besides the lighter colour: below the baseline only, and dotted.
          <line key={`m${i}`} className="tl-pending" x1={m.x} x2={m.x} y1={BASE + 1} y2={BASE + 9} />
        ),
      )}
      {g.points.map((p, i) => (
        <line key={i} className={`tl-stem${i === selected ? ' is-sel' : ''}`} x1={p.x} x2={p.x} y1={BASE} y2={p.y + (g.rs[i] ?? 0)} />
      ))}
      {entries.map((e, i) => {
        const { x, y } = g.points[i]!;
        const r = g.rs[i]!;
        const delay = { animationDelay: `${Math.round(i * stagger)}ms` };
        return (
          <g key={e.to}>
            <circle className="tl-marker" data-index={i} data-magnitude={e.significance.magnitude} cx={x} cy={y} r={r} style={delay} />
            {/* Shape cue: majors carry a second, inner ring. */}
            {e.significance.magnitude === 'major' && <circle className="tl-marker-ring" cx={x} cy={y} r={r - 4.5} style={delay} />}
          </g>
        );
      })}
      {sel && entry && (
        <>
          <g className="tl-move" style={{ transform: `translate(${sel.x}px, ${sel.y}px)` }}>
            <circle className="tl-ring" r={(g.rs[selected] ?? 0) + 4.5} />
          </g>
          <g className="tl-move" style={{ transform: `translateX(${sel.x}px)` }}>
            <path className="tl-caret" d={`M-5 ${BASE + 15}L0 ${BASE + 8}L5 ${BASE + 15}Z`} />
            <text className="tl-sel-date" x={labelX - sel.x} y={BASE + 31} textAnchor="middle">
              {formatTimestampShort(entry.to)}
            </text>
          </g>
        </>
      )}
      {labels.map((k) => (
        <text key={k.year} className="tl-year" x={k.x} y={BASE + 31} textAnchor="middle">
          {k.year}
        </text>
      ))}
    </svg>
  );

  return (
    <div className="tl" ref={outer}>
      {/* Without a slider (no change yet) the strip itself takes focus, so keyboard users can scroll it (axe). */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="tl-strip" ref={strip} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)} {...(!entry && { tabIndex: 0, role: 'group', 'aria-labelledby': labelledBy })}>
        {/* Until a live run finds its first change, the strip is a picture of the captures only. */}
        {!entry ? (
          <div style={{ width: g.width }}>{svg}</div>
        ) : (
          <div
            className="tl-slider"
            // A native range input cannot hold the SVG strip; this div implements the APG slider pattern.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            role="slider"
            tabIndex={0}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-orientation="horizontal"
            aria-valuemin={1}
            aria-valuemax={entries.length}
            aria-valuenow={selected + 1}
            aria-valuetext={describeChange(entry, selected, entries.length)}
            style={{ width: g.width }}
            {...handlers}
          >
            {svg}
          </div>
        )}
      </div>
      {tipEntry && tipAt && (
        <div
          className="tl-tip"
          aria-hidden="true"
          {...tipHandlers(tip!)}
          style={{ left: clamp(tipAt.x + INSET - scrollX, 130, cw - 130), top: tipAt.y + INSET - (g.rs[tip!] ?? 0) - 10 }}
        >
          {thumbOf?.(tipEntry.to) && <img src={thumbOf(tipEntry.to)} width={320} height={200} alt="" />}
          <span className="mono">
            {formatTimestampShort(tipEntry.from)} → {formatTimestampShort(tipEntry.to)}, <b>{tipEntry.significance.magnitude}</b>,{' '}
            {tipEntry.aiSummary ? 'AI summary' : 'auto summary'}
          </span>
          <span>{tipEntry.aiSummary ?? tipEntry.ruleSummary}</span>
        </div>
      )}
    </div>
  );
}
