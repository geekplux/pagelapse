import { type KeyboardEvent, type ReactNode, useCallback, useState } from 'react';
import { formatTimestampLong, formatTimestampShort } from '../../core/timestamp.ts';
import type { TimelineEntry } from '../../core/types.ts';
import { Ts } from '../Ts.tsx';
import { CompareSlider } from './CompareSlider.tsx';
import { Controls, PlayButton } from './Controls.tsx';
import { LiveFrame, SlowNote } from './LiveFrame.tsx';
import { ModePicker } from './ModePicker.tsx';
import { Shot } from './Shot.tsx';
import { useFramePool } from './useFramePool.ts';
import { type CaptureView, MODES, type Mode, type Side, captureForChange, frameNo, shotAlt, sideOf } from './visualState.ts';

interface Props {
  /** The page, for alt text: `NASA home page`. */
  label: string;
  /** Every capture, oldest first (frame numbers). */
  captures: readonly string[];
  /** A capture in the archive's own viewer. */
  link: (ts: string) => string;
  view: (ts: string) => CaptureView;
  entry: TimelineEntry;
  /** The capture shown in Single mode. */
  at: string;
  trivial: boolean;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onSide: (side: Side) => void;
  /** Samples only: live frames would each load a whole archived page per step. */
  play?: { playing: boolean; toggle: () => void } | undefined;
  /** Live: the captures Right/Left step through (neighbour preloads) and whether the run still fetches. */
  steps?: readonly string[];
  runActive?: boolean;
  /** Live: the selection only follows the run (nothing picked yet), so no frame loads until a pick or the run's end. */
  hold?: boolean;
  /** Previous / next change, for the controls row. */
  nav?: ReactNode;
}

const SIDES = [
  ['before', 'Before'],
  ['after', 'After'],
] as const;
const WORD: Record<Side, string> = { before: 'Before', after: 'After' };

/**
 * `◦ Before 16 Mar 2024` / `• After 2 May 2025`: a ring or a filled dot, the word in cyan-11 or amber-11 and the mono
 * date, so the sides are told apart by shape, word, date and corner, never by hue alone. Decorative: the picture's
 * alt text names the side and date. A capture that is neither side shows its date alone.
 */
const Tag = ({ side, ts, trivial = false, over = true }: { side: Side | null; ts: string; trivial?: boolean; over?: boolean }) => (
  <span className={over ? 'vp-label' : 'vp-tag'} data-side={side ?? 'none'} aria-hidden="true">
    {side && <i className="vp-dot" />}
    {side ? <b>{WORD[side]}</b> : trivial && <b>Trivial edit</b>}{' '}
    {/* The space keeps textContent readable; a flex container drops it from the layout. */}
    <span className="vp-date mono">{formatTimestampShort(ts)}</span>
  </span>
);

/**
 * The page itself on the stage: the picture(s) in the compare mode (Slider, Side by side, Single) with Before / After
 * tags on them, honest states for captures recorded without some styles or with no picture, then the controls row
 * (Play, Previous / Next, the compare control, Copy link). A compare mode needs both pictures, else it shows Single.
 */
export function VisualPane({ label, captures, link, view, entry, at, trivial, mode, onMode, onSide, play, steps = captures, runActive = false, hold = false, nav }: Props) {
  const [broken, setBroken] = useState<string[]>([]);
  const index = (ts: string) => captures.indexOf(ts);
  const pic = (ts: string) => {
    const v = view(ts);
    return broken.includes(v.src) ? { ...v, source: 'none' as const, broken: true } : { ...v, broken: false };
  };
  type Pic = ReturnType<typeof pic>;
  const pair = { before: pic(entry.from), after: pic(entry.to) };
  // Slider needs both pictures, else it shows Single in the same 16:10 footprint. Side by side shows the "No picture"
  // card in its own mat instead, so no fallback ever changes the space the stage takes.
  const lacking = mode === 'slider' ? SIDES.find(([s]) => pair[s].source === 'none') : undefined;
  const shown: Mode = lacking ? 'single' : mode;
  const side = sideOf(entry, at);
  const want = (shown === 'single' ? [pic(at)] : [pair.before, pair.after]).filter((p) => p.source === 'frame').map((p) => p.ts);
  const pool = useFramePool(want, steps, { scope: shown, compare: shown !== 'single', runActive, hold });
  // Frames that went 8 s without loading; forgotten once evicted (a frame that comes back loads from scratch).
  const [slow, setSlow] = useState<string[]>([]);
  if (slow.some((ts) => !pool.frames.includes(ts))) setSlow(slow.filter((ts) => pool.frames.includes(ts)));
  const onSlow = useCallback((ts: string) => setSlow((s) => (s.includes(ts) ? s : [...s, ts])), []);
  const stalled = want.filter((ts) => slow.includes(ts) && pool.frames.includes(ts) && !pool.loaded.has(ts));
  const note = (
    <SlowNote
      links={stalled.map((ts) => {
        const s = shown === 'single' ? null : sideOf(entry, ts);
        const word = s ? WORD[s] : undefined;
        return { href: link(ts), label: word ? `Open ${word} capture` : 'Open capture' };
      })}
    />
  );
  // Polite news of Play starting and stopping only; the steps themselves are silent.
  const playing = !!play?.playing;
  const [said, setSaid] = useState({ playing: false, text: '' });
  if (said.playing !== playing) {
    const where = `${frameNo(index(at))}, ${formatTimestampLong(at)}`;
    setSaid({ playing, text: playing ? `Playing the time-lapse from capture ${where}. Any key stops it.` : `Stopped at capture ${where}.` });
  }

  const frame = (ts: string) => ({ src: view(ts).src, title: shotAlt(label, entry, ts, 'replayed by the Internet Archive') });
  const shot = (p: Pic) =>
    p.source === 'frame' ? (
      <LiveFrame
        ts={p.ts}
        page={p.page}
        frames={shown === 'single' ? pool.frames : pool.frames.filter((f) => f === p.ts)}
        loaded={pool.loaded}
        onLoad={pool.onLoad}
        frame={frame}
        slow={slow.includes(p.ts)}
        onSlow={onSlow}
        hold={hold}
      />
    ) : p.source === 'shot' ? (
      <Shot src={p.src} thumb={p.thumb ?? ''} alt={shotAlt(label, entry, p.ts)} onError={() => setBroken((b) => [...b, p.src])} />
    ) : (
      <div className="vp-shot vp-none">
        <p>
          <span aria-hidden="true">▢ </span>No picture of this capture
        </p>
        <p className="mono">{p.broken ? 'The picture could not be loaded.' : p.reason}</p>
      </div>
    );
  // Single's link out, under the picture; always there in Single, so the controls never move with the capture.
  const caption = (p: Pic) => (
    <figcaption className="vp-cap">
      <a className="cap-out" href={link(p.ts)} target="_blank" rel="noopener noreferrer">
        Open capture<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </figcaption>
  );
  // A capture recorded without some styles: a tag in the picture's bottom corner (its side's), over the picture so
  // nothing under the stage moves when the pair changes.
  const partial = (p: Pic, corner: Side) =>
    p.status === 'partial' && (
      <span key={`partial-${p.ts}`} className="vp-badge" data-corner={corner}>
        <span aria-hidden="true">◐ </span>Partial copy<span className="sr-only">, {formatTimestampLong(p.ts)}: the archive's copy is missing some styles or images</span>
      </span>
    );
  // Roving radio group: Left / Up and Right / Down wrap, Home / End go to the ends; selection follows focus.
  const sideKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const radios = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])];
    const i = radios.indexOf(e.currentTarget);
    const n = radios.length;
    const to = { ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: n - 1 }[e.key];
    if (to === undefined || i < 0) return;
    e.preventDefault();
    const j = (to + n) % n;
    onSide(SIDES[j]![0]);
    radios[j]!.focus();
  };
  const tools = (
    <>
      {mode === 'single' && (
        // A radio group of two buttons, not native radios: each holds a dot, a word and a date.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        <div className="vp-sides" role="radiogroup" aria-label="Show the change's capture">
          {SIDES.map(([s, word]) => (
            // One tab stop for the pair (arrow keys move and select), like the ribbon thumbnails.
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
            <button key={s} type="button" role="radio" className="vp-side" aria-checked={side === s} tabIndex={(side ?? 'after') === s ? 0 : -1} onClick={() => onSide(s)} onKeyDown={sideKey}>
              <i className="vp-dot" data-side={s} aria-hidden="true" />
              {word} <Ts ts={captureForChange(entry, s)} />
            </button>
          ))}
        </div>
      )}
      <ModePicker mode={mode} onMode={onMode} />
    </>
  );
  const tags =
    shown === 'single' ? <Tag side={side} ts={at} trivial={trivial} /> : SIDES.map(([s]) => <Tag key={s} side={s} ts={pair[s].ts} />);

  return (
    <>
      <section className="vpane" aria-labelledby="vpane-heading" data-mode={shown}>
        <h3 id="vpane-heading" className="sr-only">
          How it looked
        </h3>
        {/* Always mounted (and zero height), so the reason is announced when Slider falls back to Single; the tag on the
            picture says it visibly. */}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <div className="sr-only" role="status">
          {lacking && (
            <p className="vp-note">
              {MODES.find(([m]) => m === mode)![1]} needs a picture of both captures. The {WORD[lacking[0]]} capture, {formatTimestampLong(pair[lacking[0]].ts)}, has none,
              so this shows one capture at a time.
            </p>
          )}
        </div>
        {shown === 'side' ? (
          <div className="vp-pair">
            {SIDES.map(([s, word]) => (
              <figure key={s} className="vp-fig">
                <figcaption className="vp-cap vp-cap-side">
                  <Tag side={s} ts={pair[s].ts} over={false} />
                  {/* Named with the date, starting with the visible text (WCAG 2.5.3): "Open Before capture, 6 November 2013 (…)". */}
                  <a className="cap-out" href={link(pair[s].ts)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${word} capture, ${formatTimestampLong(pair[s].ts)} (opens in a new tab)`}>
                    {`Open ${word} capture`}
                  </a>
                </figcaption>
                <div className="vp-mat">
                  {shot(pair[s])}
                  {partial(pair[s], 'before')}
                </div>
              </figure>
            ))}
          </div>
        ) : (
          <figure className="vp-fig">
            <div className="vp-mat">
              {shown === 'slider' ? <CompareSlider entry={entry} before={shot(pair.before)} after={shot(pair.after)} /> : shot(pic(at))}
              {tags}
              {shown === 'single' ? partial(pic(at), 'before') : SIDES.map(([s]) => partial(pair[s], s))}
              {lacking && (
                <span className="vp-badge" data-corner="after" aria-hidden="true">
                  ◑ No picture of the {WORD[lacking[0]]} capture
                </span>
              )}
            </div>
            {/* Single's own row: only when Single is the chosen mode, so a fallback adds nothing under the stage. */}
            {mode === 'single' && caption(pic(at))}
          </figure>
        )}
        {note}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <span className="sr-only vp-said" role="status">
          {said.text}
        </span>
      </section>
      <Controls play={play && <PlayButton playing={playing} toggle={play.toggle} />} nav={nav} tools={tools} view={`${entry.from}-${entry.to} ${at} ${shown}`} />
    </>
  );
}
