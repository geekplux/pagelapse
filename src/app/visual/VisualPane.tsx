import { type KeyboardEvent, type ReactNode, useCallback, useState } from 'react';
import { formatTimestampLong } from '../../core/timestamp.ts';
import type { TimelineEntry } from '../../core/types.ts';
import { Ts } from '../Ts.tsx';
import { CompareSlider } from './CompareSlider.tsx';
import { LiveFrame, SlowNote } from './LiveFrame.tsx';
import { ModePicker } from './ModePicker.tsx';
import { OnionSkin } from './OnionSkin.tsx';
import { Shot } from './Shot.tsx';
import { useFramePool } from './useFramePool.ts';
import { type CaptureView, MODES, type Mode, type Side, captureForChange, frameNo, shotAlt, sideOf } from './visualState.ts';

interface Props {
  /** The page, for alt text: `git-scm.com home page`. */
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
  /** The side column, given the pane's controls: Play (`lead`), then the compare picker and Before / After (`tools`). */
  side: (lead: ReactNode, tools: ReactNode) => ReactNode;
}

const SIDES = [
  ['before', '−', 'Before', 'removed'],
  ['after', '+', 'After', 'added'],
] as const;

/** `− Before 2025·04·04` / `+ After 2025·12·18`: the sides are told apart by symbol, word, date and corner. */
const Label = ({ side, ts }: { side: Side; ts: string }) => {
  const [, sym, word, op] = SIDES.find(([s]) => s === side)!;
  return (
    <span className="vp-label mono" data-side={side} aria-hidden="true">
      <b data-op={op}>{sym}</b> {word} <Ts ts={ts} />
    </span>
  );
};

/**
 * The page itself, as a mounted print: the picture(s) in the compare mode (Single, Side by side, Slider, Onion skin), a
 * one-line caption (frame, date, the link out in Single and Side by side) and honest states for captures recorded
 * without some styles or with no picture. A compare mode needs both pictures, else it shows Single. Its controls (Play,
 * the compare picker, Single's `− Before | + After` toggle) go to the side column's controls row, after the picture.
 */
export function VisualPane({ label, captures, link, view, entry, at, trivial, mode, onMode, onSide, play, steps = captures, runActive = false, hold = false, side: renderSide }: Props) {
  const [broken, setBroken] = useState<string[]>([]);
  const index = (ts: string) => captures.indexOf(ts);
  const pic = (ts: string) => {
    const v = view(ts);
    return broken.includes(v.src) ? { ...v, source: 'none' as const, broken: true } : { ...v, broken: false };
  };
  type Pic = ReturnType<typeof pic>;
  const pair = { before: pic(entry.from), after: pic(entry.to) };
  const lacking = mode === 'single' ? undefined : SIDES.find(([s]) => pair[s].source === 'none');
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
        const word = shown === 'single' ? undefined : SIDES.find(([s]) => s === sideOf(entry, ts))?.[2];
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
  // Frame and date, the link out (Single and each Side by side mat; the compare pair's links are in Change details),
  // and the honest badges. Archive name and recording notes are in the footer's "About these captures".
  const caption = (ps: Pic[]) => (
    <figcaption className="vp-cap mono">
      <span>{ps.map((p) => frameNo(index(p.ts))).join(' → ')}</span>
      {ps.length === 1 && <Ts ts={ps[0]!.ts} />}
      {shown === 'single' && trivial && <span>trivial edit</span>}
      {(shown === 'single' || shown === 'side') &&
        ps.map((p) => (
          <a key={p.ts} className="cap-out" href={link(p.ts)} target="_blank" rel="noopener noreferrer">
            {shown === 'side' ? `Open ${SIDES.find(([s]) => s === sideOf(entry, p.ts))![2]}` : 'Open capture'}
            <span className="sr-only">{shown === 'side' && ' capture'} (opens in a new tab)</span>
          </a>
        ))}
      {ps.map(
        (p) =>
          p.status === 'partial' && (
            <span key={p.ts} className="vp-badge">
              <span aria-hidden="true">◐ </span>Partial{ps.length > 1 && ` (${formatTimestampLong(p.ts)})`}: the archive's copy is missing some styles or images.
            </span>
          ),
      )}
    </figcaption>
  );
  const sideKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const other = e.key === 'ArrowLeft' ? e.currentTarget.previousElementSibling : e.key === 'ArrowRight' ? e.currentTarget.nextElementSibling : null;
    if (!(other instanceof HTMLButtonElement)) return;
    e.preventDefault();
    e.currentTarget.tabIndex = -1;
    other.tabIndex = 0;
    other.focus();
  };
  const tools = (
    <>
      <ModePicker mode={mode} onMode={onMode} />
      {shown === 'single' && (
        // A named group of two toggle buttons, not a <fieldset>: no form is submitted.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        <div className="vp-sides" role="group" aria-label="Show the change's capture">
          {SIDES.map(([s, sym, word, op]) => (
            // One tab stop for the pair (Left / Right moves between them), like the filmstrip.
            <button key={s} type="button" className="vp-side" aria-pressed={side === s} tabIndex={(side ?? 'after') === s ? 0 : -1} onClick={() => onSide(s)} onKeyDown={sideKey}>
              <b aria-hidden="true" data-op={op}>
                {sym}
              </b>{' '}
              {word} <Ts ts={captureForChange(entry, s)} />
            </button>
          ))}
        </div>
      )}
    </>
  );
  const lead = play && (
    <button type="button" className="btn vp-play" data-play data-playing={playing || undefined} onClick={play.toggle}>
      <span aria-hidden="true">{playing ? '❚❚ ' : '▶ '}</span>
      {playing ? 'Pause' : 'Play'}
      <span className="sr-only"> time-lapse</span>
    </button>
  );

  return (
    <>
    <section className="vpane" aria-labelledby="vpane-heading" data-mode={shown}>
      <h3 id="vpane-heading" className="sr-only">
        How it looked
      </h3>
      {/* Always mounted, so the note is announced when a compare mode falls back to Single. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div role="status">
        {lacking && (
          <p className="vp-note">
            <span aria-hidden="true">◑ </span>
            {MODES.find(([m]) => m === mode)![1]} needs a picture of both captures. The {lacking[2]} capture, {formatTimestampLong(pair[lacking[0]].ts)}, has none,
            so this shows one capture at a time.
          </p>
        )}
      </div>
      {shown === 'side' ? (
        <>
          <div className="vp-pair">
            {SIDES.map(([s]) => (
              <figure key={s} className="vp-mat">
                {shot(pair[s])}
                <Label side={s} ts={pair[s].ts} />
                {caption([pair[s]])}
              </figure>
            ))}
          </div>
          {note}
        </>
      ) : (
        <figure className="vp-mat">
          {shown === 'slider' ? (
            <CompareSlider entry={entry} before={shot(pair.before)} after={shot(pair.after)} />
          ) : shown === 'onion' ? (
            <OnionSkin before={shot(pair.before)} after={shot(pair.after)} />
          ) : (
            shot(pic(at))
          )}
          {note}
          {shown === 'single' ? side && <Label side={side} ts={at} /> : SIDES.map(([s]) => <Label key={s} side={s} ts={pair[s].ts} />)}
          {caption(shown === 'single' ? [pic(at)] : [pair.before, pair.after])}
        </figure>
      )}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <span className="sr-only vp-said" role="status">
        {said.text}
      </span>
    </section>
    {renderSide(lead, tools)}
    </>
  );
}
