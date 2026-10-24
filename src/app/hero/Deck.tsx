import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fixtureToSnapshots } from '../../core/fixture.ts';
import { buildTimeline } from '../../core/timeline.ts';
import { formatTimestampLong, formatTimestampShort } from '../../core/timestamp.ts';
import type { SampleFixture } from '../../core/types.ts';
import { shotSrc } from '../visual/visualState.ts';
import { AXIS_Y, deckHeight, deckLayout } from './deck.ts';

/** The deal plays once per page load, not again when Back returns to the hero. */
let dealt = false;
/** Cards deal newest first, this far apart; the bars grow once the deal is done. */
const STAGGER = 35;
const DEAL = 450;

/** The deck's width, measured before paint and kept current. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Props {
  /** The deck's sample, once loaded; until then the deck keeps the height of `count` cards. */
  fixture: SampleFixture | undefined;
  count: number;
  /** Opens capture `ts`; `from` is the card pressed. */
  onOpen: (ts: string, from: HTMLElement) => void;
}

/**
 * Every pictured capture of `fixture` as a card at its date, the latest whole on the right. Hover or focus lifts a
 * card, shows its date and turns its change bar amber; each card is a button that opens that capture.
 */
export function Deck({ fixture, count, onOpen }: Props) {
  const [ref, width] = useWidth();
  const [hot, setHot] = useState(-1);
  const [deal] = useState(() => !dealt);
  useEffect(() => {
    dealt = true;
  }, []);
  const shots = useMemo(() => (fixture?.snapshots ?? []).flatMap((s) => (s.shot?.file ? [{ ts: s.ts, file: s.shot.file }] : [])), [fixture]);
  const changes = useMemo(
    () => (fixture ? buildTimeline(fixture.url, fixtureToSnapshots(fixture)).entries.map((e) => ({ to: e.to, score: e.significance.score })) : []),
    [fixture],
  );
  const d = fixture && width ? deckLayout(shots.map((s) => s.ts), changes, width) : undefined;
  const last = shots.length - 1;
  const front = d?.cards[last];
  // The latest card is whole already: it neither lifts nor marks its bar.
  const hotTs = hot < last ? shots[hot]?.ts : undefined;

  return (
    <div ref={ref} className={`deck${deal ? ' is-dealing' : ''}`} style={{ height: d?.height ?? (width ? deckHeight(count, width) : undefined) }}>
      {fixture && d && front && (
        <>
          {d.cards.map((c, i) => {
            const latest = i === last;
            const style = { left: c.x, top: c.y, width: d.cardW, height: d.cardH, zIndex: i + 1, animationDelay: `${(last - i) * STAGGER}ms`, '--deck-from': `${front.x - c.x}px`, '--deck-from-y': `${front.y - c.y}px` };
            return (
              <button
                key={c.ts}
                type="button"
                className={`deck-card${latest ? ' is-front' : ''}${hot === i ? ' is-hot' : ''}`}
                style={style as CSSProperties}
                aria-label={`${latest ? 'Latest, ' : ''}${formatTimestampLong(c.ts)}, open this capture`}
                onClick={(e) => onOpen(c.ts, e.currentTarget)}
                onPointerEnter={() => setHot(i)}
                onPointerLeave={() => setHot((h) => (h === i ? -1 : h))}
                onFocus={() => setHot(i)}
                onBlur={() => setHot((h) => (h === i ? -1 : h))}
              >
                {/* Only the latest card shows whole; the slivers behind it use the thumbnails. */}
                <img src={shotSrc(fixture.id, shots[i]!.file, !latest)} alt="" decoding="async" />
              </button>
            );
          })}
          {d.cards.slice(0, last).map((c, i) => (
            <span key={c.ts} className={`deck-date mono${hot === i ? ' is-on' : ''}`} style={{ left: c.x, top: c.y - 44, zIndex: last + 2 }} aria-hidden="true">
              {formatTimestampShort(c.ts)}
            </span>
          ))}
          <span className="deck-latest" style={{ top: front.y + 12, zIndex: last + 2 }} aria-hidden="true">
            <span className="deck-dot" />
            <b>Latest</b>
            <span className="mono">{formatTimestampShort(front.ts)}</span>
          </span>
          <svg className="deck-axis" width={d.span} height={64} style={{ top: d.axisTop }} aria-hidden="true">
            <path className="deck-line" d={`M0 ${AXIS_Y}H${d.span}`} />
            <circle className="deck-first" cx={0} cy={AXIS_Y - 3} r={2.5} />
            {d.bars.map((b, i) => (
              <rect
                key={b.ts}
                className={`deck-bar${b.ts === hotTs ? ' is-on' : ''}`}
                x={b.x - 1}
                y={AXIS_Y - b.h}
                width={2}
                height={b.h}
                rx={1}
                style={{ animationDelay: `${DEAL + (d.bars.length - 1 - i) * STAGGER}ms` }}
              />
            ))}
            {d.ticks.map((t) => (
              <g key={t.year}>
                <path className="deck-line" d={`M${t.x} ${AXIS_Y}v5`} />
                <text className="deck-year" x={t.x} y={AXIS_Y + 20} textAnchor="middle">
                  {t.year}
                </text>
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  );
}
