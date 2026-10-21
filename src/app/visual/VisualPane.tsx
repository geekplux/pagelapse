import { useState } from 'react';
import { ARCHIVES } from '../../archive/archives.ts';
import { viewCaptureUrl } from '../../core/url.ts';
import type { SampleFixture, TimelineEntry } from '../../core/types.ts';
import { Ts } from '../Ts.tsx';
import { type Side, captureForChange, frameNo, shotAlt, shotSrc, sideOf } from './visualState.ts';

interface Props {
  fixture: SampleFixture;
  entry: TimelineEntry;
  /** The capture shown. */
  at: string;
  trivial: boolean;
  onSide: (side: Side) => void;
}

const SIDES = [
  ['before', '−', 'Before', 'removed'],
  ['after', '+', 'After', 'added'],
] as const;

/**
 * The page itself at the selected capture, as a mounted print: the `− Before | + After` toggle, the picture
 * (its thumbnail stands in, scaled up, until the full picture has decoded), a caption strip with the link
 * out to the capture, and honest states for captures recorded without some styles or with no picture.
 */
export function VisualPane({ fixture, entry, at, trivial, onSide }: Props) {
  const i = fixture.snapshots.findIndex((s) => s.ts === at);
  const shot = fixture.snapshots[i]?.shot;
  const side = sideOf(entry, at);
  const [broken, setBroken] = useState('');
  const full = shot?.file ? shotSrc(fixture.id, shot.file) : '';
  const sideLabel = SIDES.find(([s]) => s === side);
  return (
    <section className="vpane" aria-labelledby="vpane-heading">
      <div className="vp-bar">
        <h3 id="vpane-heading">How it looked</h3>
        {/* A named group of two toggle buttons, not a <fieldset>: no form is submitted. */}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
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
      </div>
      <figure className="vp-mat">
        {full && broken !== full ? (
          <img
            key={full}
            className="vp-shot"
            src={full}
            width={960}
            height={600}
            alt={shotAlt(fixture.label, entry, at)}
            decoding="async"
            fetchPriority="high"
            style={{ backgroundImage: `url(${shotSrc(fixture.id, shot!.file!, true)})` }}
            onError={() => setBroken(full)}
          />
        ) : (
          <div className="vp-shot vp-none">
            <p>
              <span aria-hidden="true">▢ </span>No picture of this capture
            </p>
            <p className="mono">{full ? 'The picture could not be loaded.' : shot?.reason}</p>
          </div>
        )}
        {sideLabel && (
          <span className="vp-label mono" aria-hidden="true">
            <b data-op={sideLabel[3]}>{sideLabel[1]}</b> {sideLabel[2]} <Ts ts={at} />
          </span>
        )}
        <figcaption className="vp-cap mono">
          <span>{frameNo(i)}</span>
          <Ts ts={at} />
          <span className="vp-src">
            {ARCHIVES[(fixture.visual ?? fixture.source).archive].name} capture, top of page{trivial && ', trivial edit'}
            {shot?.redacted ? `, ${shot.redacted} items hidden before recording` : ''}
          </span>
          <a className="cap-out" href={viewCaptureUrl(fixture.source.archive, at, fixture.url)} target="_blank" rel="noopener noreferrer">
            Open capture<span className="sr-only"> (opens in a new tab)</span>
          </a>
          {shot?.status === 'partial' && (
            <span className="vp-badge">
              <span aria-hidden="true">◐ </span>Partial: the archive's copy is missing some styles or images.
            </span>
          )}
        </figcaption>
      </figure>
    </section>
  );
}
