/** No captures at all: say so, offer the Archive's Save Page Now and a sample. */
export function EmptyState({ url, onSample, headingRef }: { url: string; onSample: () => void; headingRef?: ((el: HTMLElement | null) => void) | undefined }) {
  return (
    <section className="state-card" aria-labelledby="state-heading">
      <h3 id="state-heading" tabIndex={-1} ref={headingRef}>
        No captures yet
      </h3>
      <p>
        The Archive has no captures of <span className="mono">{url.replace(/^https?:\/\//, '')}</span> yet.
      </p>
      <p className="state-actions">
        <a className="btn" href={`https://web.archive.org/save/${url}`} target="_blank" rel="noopener noreferrer">
          Save it now<span className="sr-only"> in the Internet Archive (opens in a new tab)</span>
        </a>
        <button type="button" className="btn" onClick={onSample}>
          Open a sample
        </button>
      </p>
    </section>
  );
}
