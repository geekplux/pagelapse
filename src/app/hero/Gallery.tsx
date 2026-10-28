import { type RefObject, useEffect, useRef, useState } from 'react';
import { type SampleEntry, hostOf } from '../../samples/index.ts';
import { type GalleryEntry, fetchGallery } from '../live/api.ts';
import { PageIcon } from '../UrlForm.tsx';
import { ExploredCard, years } from './ExploredCard.tsx';

interface Props {
  samples: readonly SampleEntry[];
  /** Opens a sample; `from` is the card pressed (it grows into the stage). */
  onSample: (entry: SampleEntry, from: HTMLElement) => void;
  /** Looks a shared page up (its captures are already in the Worker's cache). */
  onUrl: (url: string) => void;
}


type Shared = GalleryEntry[] | 'loading' | 'failed';

/**
 * Waits until the gallery scrolls into view, then loads "Recently explored" and lets the sample thumbnails load: the
 * first view fetches nothing for the gallery (its picture budget in scripts/check-size.ts stays as it was).
 */
function useGallery(ref: RefObject<HTMLElement | null>): { seen: boolean; shared: Shared } {
  const [seen, setSeen] = useState(false);
  const [shared, setShared] = useState<Shared>('loading');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setSeen(true);
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setSeen(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    if (!seen) return;
    const ctrl = new AbortController();
    fetchGallery(ctrl.signal).then(setShared, () => void (ctrl.signal.aborted || setShared('failed')));
    return () => ctrl.abort();
  }, [seen]);
  return { seen, shared };
}

/** Under the deck: every sample as a card, the pages visitors shared, and the credit to the Internet Archive. */
export function Gallery({ samples, onSample, onUrl }: Props) {
  const ref = useRef<HTMLElement>(null);
  const { seen, shared } = useGallery(ref);
  return (
    <section className="gallery" id="gallery" aria-labelledby="gallery-title" ref={ref}>
      <h2 id="gallery-title">Samples</h2>
      <p className="gallery-lede">Recorded with their pictures, so they open at once, even offline.</p>
      <ul className="gallery-grid">
        {samples.map((s) => (
          <li key={s.id}>
            <button type="button" className="g-card" data-sample={s.id} onClick={(e) => onSample(s, e.currentTarget)}>
              <span className="g-thumb">
                {!s.card?.thumb ? <PageIcon /> : seen && <img src={s.card.thumb} alt="" width={320} height={200} decoding="async" />}
              </span>
              <span className="g-name">{s.name}</span>
              <span className="g-meta">
                <span>{hostOf(s.url)}</span>
                {s.card && (
                  <span className="mono">
                    {years(s.card.firstTs, s.card.lastTs)}, {s.card.captures} captures
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h2 id="explored-title">Recently explored</h2>
      <p className="gallery-lede">Pages visitors looked up and chose to share. Their captures are already fetched, so they open quickly.</p>
      {shared === 'loading' ? (
        <p className="gallery-note" aria-busy="true">
          Loading…
        </p>
      ) : shared === 'failed' ? (
        <p className="gallery-note">Recently explored could not be loaded. The samples above still open.</p>
      ) : shared.length === 0 ? (
        <p className="gallery-note">Nothing shared yet. After you look up a page, “Add to Recently explored” lists it here.</p>
      ) : (
        <ul className="gallery-grid is-text" aria-labelledby="explored-title">
          {shared.map((e) => (
            <li key={e.url}>
              <ExploredCard entry={e} onUrl={onUrl} />
            </li>
          ))}
        </ul>
      )}

      <p className="gallery-credit">
        Every capture on Pagelapse was saved by the <a href="https://web.archive.org/">Internet Archive’s Wayback Machine</a>, which has been
        keeping copies of the web since 1996. Pagelapse only reads them.
      </p>
    </section>
  );
}
