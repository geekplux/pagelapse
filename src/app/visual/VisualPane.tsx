import { useCallback, useState } from 'react';
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
  /** Where the pictures come from, for the caption: `Arquivo.pt`. */
  archiveName: string;
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
 * The page itself, as a mounted print: the compare mode (Single with its `− Before | + After` toggle, Side by side,
 * Slider, Onion skin), Play, the picture(s), a caption strip with the links out to the captures, and honest states for
 * captures recorded without some styles or with no picture. A compare mode needs both pictures, else it shows Single.
 */
export function VisualPane({ label, captures, archiveName, link, view, entry, at, trivial, mode, onMode, onSide, play, steps = captures, runActive = false }: Props) {
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
  const pool = useFramePool(want, steps, { scope: shown, compare: shown !== 'single', runActive });
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
  const caption = (ps: Pic[], hidden = ps.reduce((n, p) => n + (p.redacted ?? 0), 0)) => (
    <figcaption className="vp-cap mono">
      <span>{ps.map((p) => frameNo(index(p.ts))).join(' → ')}</span>
      {ps.length === 1 && <Ts ts={ps[0]!.ts} />}
      <span className="vp-src">
        {ps[0]!.source === 'frame' ? `Live replay from ${archiveName}; it may lack some styles or images` : `${archiveName} capture${ps.length > 1 ? 's' : ''}, top of page`}
        {shown === 'single' && trivial && ', trivial edit'}
        {hidden > 0 && `, ${hidden} items hidden before recording`}
      </span>
      {ps.map((p) => (
        <a key={p.ts} className="cap-out" href={link(p.ts)} target="_blank" rel="noopener noreferrer">
          {ps.length > 1 ? `Open ${SIDES.find(([s]) => s === sideOf(entry, p.ts))![2]}` : 'Open capture'}
          <span className="sr-only">{ps.length > 1 && ' capture'} (opens in a new tab)</span>
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

  return (
    <section className="vpane" aria-labelledby="vpane-heading" data-mode={shown}>
      <div className="vp-bar">
        <h3 id="vpane-heading">How it looked</h3>
        <ModePicker mode={mode} onMode={onMode} />
        {play && (
          <button type="button" className="btn vp-play" data-play data-playing={playing || undefined} onClick={play.toggle}>
            <span aria-hidden="true">{playing ? '❚❚ ' : '▶ '}</span>
            {playing ? 'Pause' : 'Play'}
            <span className="sr-only"> time-lapse</span>
          </button>
        )}
        {shown === 'single' && (
          // A named group of two toggle buttons, not a <fieldset>: no form is submitted.
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          <div className="vp-sides" role="group" aria-label="Show the change's capture">
            {SIDES.map(([s, sym, word, op]) => (
              <button key={s} type="button" className="vp-side" aria-pressed={side === s} onClick={() => onSide(s)}>
                <b aria-hidden="true" data-op={op}>
                  {sym}
                </b>{' '}
                {word} <Ts ts={captureForChange(entry, s)} />
              </button>
            ))}
          </div>
        )}
      </div>
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
  );
}
