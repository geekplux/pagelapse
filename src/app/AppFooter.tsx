import { ARCHIVES } from '../archive/archives.ts';
import type { SampleFixture } from '../core/types.ts';
import { Logo } from '../design/Logo.tsx';

const KEYS: [string, string][] = [
  ['Timeline', 'Left / Right: previous or next change. Home / End: first or last. Page Up / Page Down: about a year later or earlier. Escape hides the tooltip.'],
  ['Thumbnails', 'Left / Right, Home / End move along the thumbnails; Enter or Space shows that capture.'],
  ['Slider divider', 'Left / Right: 5%. Page Up / Page Down: 25%. Home / End: either edge. Enter: back to 50%.'],
  ['Before / After (Single)', 'Left / Right switches between the Before and After capture.'],
  ['Compare', 'Left / Right moves between the compare modes.'],
  ['Play', 'Any key stops the time-lapse.'],
];

/** The keys row: the timeline's own keys, as the keys themselves (the full list is folded below). */
const KEY_ROW: [string[], string][] = [
  [['←', '→'], 'change'],
  [['Home', 'End'], 'first or last'],
  [['Page Up', 'Page Down'], 'a year'],
  [['Esc'], 'stop playing'],
];

/** More by the author, in this order. */
const MORE: [string, string][] = [
  ['geekplux.com', 'https://geekplux.com'],
  ['Vert', 'https://vert.geekplux.com'],
  ['Explorable', 'https://explorable.geekplux.com'],
  ['Reasontrail', 'https://reasontrail.geekplux.com'],
  ['markvis', 'https://github.com/geekplux/markvis'],
];

/**
 * The mark and one line (where captures come from, the source link) with the timeline's keys, "Made by GeekPlux" on
 * the right, and the folded details: what the shown sample's captures are (provenance, licence, picture notes) and
 * every keyboard shortcut.
 */
export function AppFooter({ sample, hero = false }: { sample?: SampleFixture | undefined; hero?: boolean }) {
  const archive = sample && ARCHIVES[sample.source.archive];
  const visual = sample?.visual;
  return (
    <footer className="site-footer" data-region="footer">
      <div className="foot-grid">
        <div className="foot-about">
          <span className="foot-brand">
            <Logo size={24} />
            Pagelapse
          </span>
          <p className="foot-line">
            Captures come from the Internet Archive. No accounts; page views are counted, never the pages you look up.{' '}
            <a href="https://github.com/geekplux/pagelapse">Source on GitHub</a>{' '}
            {/* The cap is DAILY_CAP in worker/summarise.ts (model calls per UTC day, a KV counter; not a wrangler.jsonc var).
                Past it, live runs show auto summaries; the samples never call the model. */}
            <span className="foot-cap">Live AI summaries are capped per day; samples always work.</span>
          </p>
          {!hero && (
            <ul className="foot-keys" aria-label="Timeline keys">
              {KEY_ROW.map(([keys, what]) => (
                <li key={what}>
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}{' '}
                  {what}
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav className="foot-by" aria-labelledby="foot-by">
          <p id="foot-by">Made by GeekPlux</p>
          <ul>
            {MORE.map(([name, href]) => (
              <li key={href}>
                <a href={href}>{name}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <details className="fold">
        <summary>About these captures</summary>
        {sample && archive ? (
          <>
            <p>
              {sample.description} Page: <a href={sample.url}>{sample.url}</a>
            </p>
            <p>
              This sample: captures from <a href={archive.home}>{archive.name}</a>, recorded{' '}
              <span className="mono">{sample.source.recordedAt}</span> with {sample.source.recorder}. {sample.source.attribution} Licence:{' '}
              {/* A `LicenseRef-` id (a US government work) has no SPDX page: the attribution explains it. */}
              {sample.source.license.startsWith('LicenseRef-') ? (
                <span className="mono">{sample.source.license}</span>
              ) : (
                <a className="licence-link" href={`https://spdx.org/licenses/${sample.source.license}.html`}>{sample.source.license}</a>
              )}
              .
            </p>
            {visual && (
              <p>
                Pictures: recorded <span className="mono">{visual.recordedAt}</span> at {visual.viewport.w}×{visual.viewport.h} with {visual.recorder}. {visual.attribution}{' '}
                {visual.notes?.join(' ')}
              </p>
            )}
          </>
        ) : (
          <p>
            A live run shows each capture as the Internet Archive replays it, top of page; archived copies may lack some styles or images. The
            thumbnails on the timeline are text outlines of each capture, not pictures. We fetch slowly and cache everything to be kind to the archive.
          </p>
        )}
      </details>
      {!hero && (
        <details className="fold">
          <summary>All keyboard shortcuts</summary>
          <dl className="keys">
            {KEYS.map(([what, how]) => (
              <div key={what}>
                <dt>{what}</dt>
                <dd>{how}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </footer>
  );
}
