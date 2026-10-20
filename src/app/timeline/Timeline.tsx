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
}

/**
 * The seismograph strip: year axis, a hairline per capture, hollow ticks for trivial captures and
 * one marker per meaningful change (area grows with score; lightness and the word say the magnitude).
 * A focusable `role="slider"` wraps the `aria-hidden` SVG; the changes list is its text alternative.
 */
export function Timeline({ timeline, selected, onSelect }: Props) {
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
    const caps = snapshots.map((s) => tsToMs(s.ts));
    const years = (Math.max(...caps) - Math.min(...caps)) / YEAR;
    const times = entries.map((e) => tsToMs(e.to));
    const rs = entries.map((e) => markerRadius(e.significance.score));
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
    return { width, s, times, rs, points, ticks, trace, caps: snapshots.map((c, i) => ({ x: s.x(caps[i]!), trivial: trivial.has(c.ts) })) };
  }, [cw, entries, snapshots, trivialCaptures]);

  const { hover, focusTip, dragging, handlers } = useScrubber(g.points, g.times, selected, onSelect);
  const sel = g.points[selected];
  useEffect(() => {
    const el = strip.current;
    if (!el || !sel || dragging.current) return;
    if (sel.x < el.scrollLeft + PAD || sel.x > el.scrollLeft + el.clientWidth - PAD) el.scrollLeft = sel.x - el.clientWidth / 2;
  }, [sel, dragging]);
  const entry = entries[selected];
  if (!entry || !sel) return null;

  const labelX = clamp(sel.x, 40, g.width - 40);
  const labels = yearLabels(g.ticks, g.s.pxPerYear, { minGap: 44, half: 17, width: g.width, avoid: [labelX - 42, labelX + 42] });
  const tip = hover ?? (focusTip ? selected : null);
  const tipEntry = tip === null ? undefined : entries[tip];
  const tipAt = tip === null ? undefined : g.points[tip];
  const stagger = Math.min(40, 400 / entries.length);

  return (
    <div className="tl" ref={outer}>
      <div className="tl-strip" ref={strip} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
        <div
          className="tl-slider"
          // A native range input cannot hold the SVG strip; this div implements the APG slider pattern.
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="slider"
          tabIndex={0}
          aria-label="Changes over time"
          aria-orientation="horizontal"
          aria-valuemin={1}
          aria-valuemax={entries.length}
          aria-valuenow={selected + 1}
          aria-valuetext={describeChange(entry, selected, entries.length)}
          style={{ width: g.width }}
          {...handlers}
        >
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
            {g.points.map((p, i) => (
              <line key={i} className={`tl-stem${i === selected ? ' is-sel' : ''}`} x1={p.x} x2={p.x} y1={BASE} y2={p.y + (g.rs[i] ?? 0)} />
            ))}
            {entries.map((e, i) => (
              <circle
                key={e.to}
                className="tl-marker"
                data-index={i}
                data-magnitude={e.significance.magnitude}
                cx={g.points[i]!.x}
                cy={g.points[i]!.y}
                r={g.rs[i]}
                style={{ animationDelay: `${Math.round(i * stagger)}ms` }}
              />
            ))}
            <g className="tl-move" style={{ transform: `translate(${sel.x}px, ${sel.y}px)` }}>
              <circle className="tl-ring" r={(g.rs[selected] ?? 0) + 4.5} />
            </g>
            <g className="tl-move" style={{ transform: `translateX(${sel.x}px)` }}>
              <path className="tl-caret" d={`M-5 ${BASE + 15}L0 ${BASE + 8}L5 ${BASE + 15}Z`} />
              <text className="tl-sel-date" x={labelX - sel.x} y={BASE + 31} textAnchor="middle">
                {formatTimestampShort(entry.to)}
              </text>
            </g>
            {labels.map((k) => (
              <text key={k.year} className="tl-year" x={k.x} y={BASE + 31} textAnchor="middle">
                {k.year}
              </text>
            ))}
          </svg>
        </div>
      </div>
      {tipEntry && tipAt && (
        <div
          className="tl-tip"
          aria-hidden="true"
          style={{ left: clamp(tipAt.x + INSET - scrollX, 130, cw - 130), top: tipAt.y + INSET - (g.rs[tip!] ?? 0) - 10 }}
        >
          <span className="mono">
            {formatTimestampShort(tipEntry.from)} → {formatTimestampShort(tipEntry.to)} · <b>{tipEntry.significance.magnitude}</b>
          </span>
          <span>{tipEntry.ruleSummary}</span>
        </div>
      )}
    </div>
  );
}
