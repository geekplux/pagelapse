/** No captures at all: say so, offer the Archive's Save Page Now and a sample. */
export function EmptyState({ url, onSample }: { url: string; onSample: () => void }) {
  return (
    <section className="state-card" aria-labelledby="state-heading">
      <h2 id="state-heading">No captures yet</h2>
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
