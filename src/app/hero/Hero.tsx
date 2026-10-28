import type { ReactNode } from 'react';
import type { SampleFixture } from '../../core/types.ts';
import { DECK_CAPTURES, type SampleEntry } from '../../samples/index.ts';
import { PageIcon, UrlForm } from '../UrlForm.tsx';
import { Deck } from './Deck.tsx';
import { Gallery } from './Gallery.tsx';
import { monthYear } from './deck.ts';

interface Props {
  samples: readonly SampleEntry[];
  /** Opens a sample; `from` is the option pressed (it grows into the stage). */
  onSample: (entry: SampleEntry, from: HTMLElement) => void;
  onUrl: (url: string) => void;
  /** The sample dealt as the deck (Wikipedia), once loaded. */
  deck: SampleFixture | undefined;
  /** A sample or the workspace failed to load: the notice, under the options. */
  failed?: ReactNode;
  /** Opens the deck's sample on capture `ts`; `from` is the card pressed. */
  onCapture: (ts: string, from: HTMLElement) => void;
}

/** Sample options in the first view; the rest are cards in the gallery under the deck (calm caps, DESIGN.md). */
export const HERO_OPTIONS = 3;

/** The first view (no `?sample=` or `?url=`): the headline, the address field, the first samples, the deck of captures, then the gallery. */
export function Hero({ samples, onSample, onUrl, deck, failed, onCapture }: Props) {
  const [first, latest] = [deck?.snapshots[0]?.ts, deck?.snapshots.at(-1)?.ts];

  return (
    <div className="intro">
      <section className="intro-head" aria-labelledby="intro-title">
        <h1 id="intro-title">See how any web page changed over the years</h1>
        <p className="intro-lede">Paste an address. Pagelapse lays out its captures from the Internet Archive and marks what changed between them.</p>
        <UrlForm value="" onSubmit={onUrl} hero />
        <div className="intro-samples">
          <span>Or open a sample</span>
          {samples.slice(0, HERO_OPTIONS).map((s) => (
            <button key={s.id} type="button" className="sample-opt" data-sample={s.id} onClick={(e) => onSample(s, e.currentTarget)}>
              <PageIcon />
              <span>{s.name}</span>
            </button>
          ))}
          <a className="intro-more" href="#gallery">
            More pages
          </a>
        </div>
        {failed}
      </section>
      {/* Laid out before the Wikipedia sample arrives, at its height, so nothing below it moves. */}
      <figure className="intro-deck" aria-busy={!deck}>
        <Deck fixture={deck} count={DECK_CAPTURES} onOpen={onCapture} />
        <figcaption>
          {deck && first && latest && `The Wikipedia article on the Internet Archive, ${deck.snapshots.length} captures from ${monthYear(first)} to ${monthYear(latest)}.`}
        </figcaption>
      </figure>
      <Gallery samples={samples} onSample={onSample} onUrl={onUrl} />
    </div>
  );
}
