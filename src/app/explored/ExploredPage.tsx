import { type RefCallback, useEffect, useRef, useState } from 'react';
import { ArchiveCredit } from '../hero/ArchiveCredit.tsx';
import { ExploredCard } from '../hero/ExploredCard.tsx';
import { type GalleryEntry, fetchExplored } from '../live/api.ts';

interface Props {
  /** Looks a shared page up (its captures are already in the Worker's cache). */
  onUrl: (url: string) => void;
  /** The title, which takes focus when the list opens (it is focusable from script only). */
  headingRef?: RefCallback<HTMLHeadingElement> | undefined;
}

type Status = 'loading' | 'ready' | 'failed';

/** `?explored`: every page shared to Recently explored, newest first, a page at a time with "Show more". */
export function ExploredPage({ onUrl, headingRef }: Props) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [status, setStatus] = useState<Status>('loading');
  const ctrl = useRef<AbortController>(null);
  const load = (from?: string) => {
    ctrl.current?.abort();
    const c = (ctrl.current = new AbortController());
    setStatus('loading');
    fetchExplored(from, c.signal).then(
      (r) => {
        setEntries((e) => (from ? [...e, ...r.entries] : r.entries));
        setCursor(r.cursor);
        setStatus('ready');
      },
      () => void (c.signal.aborted || setStatus('failed')),
    );
  };
  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
    // Mount only: the first page.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="explored" aria-labelledby="explored-page-title">
      {/* An h2, as a workspace title is: the header's wordmark is this view's h1. */}
      <h2 id="explored-page-title" tabIndex={-1} ref={headingRef}>
        Recently explored
      </h2>
      <p className="gallery-lede">Every page visitors looked up and chose to share, newest first. Their captures are already fetched, so they open quickly.</p>
      {entries.length > 0 && (
        <ul className="gallery-grid is-text" aria-labelledby="explored-page-title">
          {entries.map((e) => (
            <li key={e.url}>
              <ExploredCard entry={e} onUrl={onUrl} />
            </li>
          ))}
        </ul>
      )}
      {status === 'loading' ? (
        <p className="gallery-note" aria-busy="true">
          Loading…
        </p>
      ) : status === 'failed' ? (
        <p className="gallery-note">
          The list could not be loaded.{' '}
          <button type="button" className="btn-link" onClick={() => load(entries.length ? cursor : undefined)}>
            Try again
          </button>
        </p>
      ) : entries.length === 0 ? (
        <p className="gallery-note">Nothing shared yet. After you look up a page, “Add to Recently explored” lists it here.</p>
      ) : (
        cursor && (
          <p className="explored-more">
            <button type="button" className="btn" onClick={() => load(cursor)}>
              Show more
            </button>
          </p>
        )
      )}
      <ArchiveCredit />
    </section>
  );
}
