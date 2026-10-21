import { useState } from 'react';
import { ARCHIVES } from '../../archive/archives.ts';
import { formatTimestampLong } from '../../core/timestamp.ts';
import { viewCaptureUrl } from '../../core/url.ts';
import type { SampleFixture, TimelineEntry } from '../../core/types.ts';
import { Ts } from '../Ts.tsx';
import { CompareSlider } from './CompareSlider.tsx';
import { ModePicker } from './ModePicker.tsx';
import { OnionSkin } from './OnionSkin.tsx';
import { Shot } from './Shot.tsx';
import { MODES, type Mode, type Side, captureForChange, frameNo, shotAlt, shotSrc, sideOf } from './visualState.ts';

interface Props {
  fixture: SampleFixture;
  entry: TimelineEntry;
  /** The capture shown in Single mode. */
  at: string;
  trivial: boolean;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onSide: (side: Side) => void;
  play: { playing: boolean; toggle: () => void };
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
export function VisualPane({ fixture, entry, at, trivial, mode, onMode, onSide, play }: Props) {
  const [broken, setBroken] = useState<string[]>([]);
  const index = (ts: string) => fixture.snapshots.findIndex((s) => s.ts === ts);
  const pic = (ts: string) => {
    const shot = fixture.snapshots[index(ts)]?.shot;
    const full = shot?.file ? shotSrc(fixture.id, shot.file) : '';
    return { ts, shot, src: broken.includes(full) ? '' : full, broken: !!full && broken.includes(full), thumb: shot?.file ? shotSrc(fixture.id, shot.file, true) : '' };
  };
  type Pic = ReturnType<typeof pic>;
  const pair = { before: pic(entry.from), after: pic(entry.to) };
  const lacking = mode === 'single' ? undefined : SIDES.find(([s]) => !pair[s].src);
  const shown: Mode = lacking ? 'single' : mode;
  const side = sideOf(entry, at);
  // Polite news of Play starting and stopping only; the steps themselves are silent.
  const [said, setSaid] = useState({ playing: false, text: '' });
  if (said.playing !== play.playing) {
    const where = `${frameNo(index(at))}, ${formatTimestampLong(at)}`;
    setSaid({ playing: play.playing, text: play.playing ? `Playing the time-lapse from capture ${where}. Any key stops it.` : `Stopped at capture ${where}.` });
  }

  const shot = (p: Pic) =>
    p.src ? (
      <Shot src={p.src} thumb={p.thumb} alt={shotAlt(fixture.label, entry, p.ts)} onError={() => setBroken((b) => [...b, p.src])} />
    ) : (
      <div className="vp-shot vp-none">
        <p>
          <span aria-hidden="true">▢ </span>No picture of this capture
        </p>
        <p className="mono">{p.broken ? 'The picture could not be loaded.' : p.shot?.reason}</p>
      </div>
    );
  const caption = (ps: Pic[], hidden = ps.reduce((n, p) => n + (p.shot?.redacted ?? 0), 0)) => (
    <figcaption className="vp-cap mono">
      <span>{ps.map((p) => frameNo(index(p.ts))).join(' → ')}</span>
      {ps.length === 1 && <Ts ts={ps[0]!.ts} />}
      <span className="vp-src">
        {ARCHIVES[(fixture.visual ?? fixture.source).archive].name} capture{ps.length > 1 && 's'}, top of page{shown === 'single' && trivial && ', trivial edit'}
        {hidden > 0 && `, ${hidden} items hidden before recording`}
      </span>
      {ps.map((p) => (
        <a key={p.ts} className="cap-out" href={viewCaptureUrl(fixture.source.archive, p.ts, fixture.url)} target="_blank" rel="noopener noreferrer">
          {ps.length > 1 ? `Open ${SIDES.find(([s]) => s === sideOf(entry, p.ts))![2]}` : 'Open capture'}
          <span className="sr-only">{ps.length > 1 && ' capture'} (opens in a new tab)</span>
        </a>
      ))}
      {ps.map(
        (p) =>
          p.shot?.status === 'partial' && (
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
        <button type="button" className="btn vp-play" data-play aria-pressed={play.playing} onClick={play.toggle}>
          <span aria-hidden="true">{play.playing ? '❚❚ ' : '▶ '}</span>
          {play.playing ? 'Pause' : 'Play'}
          {!play.playing && <span className="sr-only"> time-lapse</span>}
        </button>
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
      {lacking && (
        <p className="vp-note">
          <span aria-hidden="true">◑ </span>
          {MODES.find(([m]) => m === mode)![1]} needs a picture of both captures. The {lacking[2]} capture, {formatTimestampLong(pair[lacking[0]].ts)}, has none, so
          this shows one capture at a time.
        </p>
      )}
      {shown === 'side' ? (
        <div className="vp-pair">
          {SIDES.map(([s]) => (
            <figure key={s} className="vp-mat">
              {shot(pair[s])}
              <Label side={s} ts={pair[s].ts} />
              {caption([pair[s]])}
            </figure>
          ))}
        </div>
      ) : (
        <figure className="vp-mat">
          {shown === 'slider' ? (
            <CompareSlider entry={entry} before={shot(pair.before)} after={shot(pair.after)} />
          ) : shown === 'onion' ? (
            <OnionSkin before={shot(pair.before)} after={shot(pair.after)} />
          ) : (
            shot(pic(at))
          )}
          {shown === 'single' ? side && <Label side={side} ts={at} /> : SIDES.map(([s]) => <Label key={s} side={s} ts={pair[s].ts} />)}
          {caption(shown === 'single' ? [pic(at)] : [pair.before, pair.after])}
        </figure>
      )}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <span className="sr-only" role="status">
        {said.text}
      </span>
    </section>
  );
}
