import { ARCHIVES } from '../archive/archives.ts';
import type { SampleFixture } from '../core/types.ts';

const KEYS: [string, string][] = [
  ['Timeline', 'Left / Right: previous or next change. Home / End: first or last. Page Up / Page Down: about a year later or earlier. Escape hides the tooltip.'],
  ['Filmstrip', 'Left / Right, Home / End move along the strip; Enter or Space shows that capture.'],
  ['Slider divider', 'Left / Right: 5%. Page Up / Page Down: 25%. Home / End: either edge. Enter: back to 50%.'],
  ['Onion skin', 'Left / Right on the opacity range: 5% steps.'],
  ['Before / After (Single)', 'Left / Right switches between the Before and After capture.'],
  ['Compare', 'Up / Down or Left / Right moves between the modes once the list is open.'],
  ['Play', 'Any key stops the time-lapse.'],
];

/**
 * The about line, the Internet Archive credit and the source link, with the folded details: what the shown sample's
 * captures are (provenance, licence, picture notes) and every keyboard shortcut.
 */
export function AppFooter({ sample }: { sample?: SampleFixture | undefined }) {
  const archive = sample && ARCHIVES[sample.source.archive];
  const visual = sample?.visual;
  return (
    <footer className="site-footer" data-region="footer">
      <p className="tagline">How a web page changed over the years, one meaningful edit at a time.</p>
      <p>
        Live captures come from the{' '}
        <a href="https://web.archive.org/">Internet Archive's Wayback Machine</a>. We fetch slowly and cache
        everything to be kind to it.
      </p>
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
              <a className="licence-link" href={`https://spdx.org/licenses/${sample.source.license}.html`}>{sample.source.license}</a>.
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
            filmstrip draws text outlines of each capture, not pictures.
          </p>
        )}
      </details>
      <details className="fold">
        <summary>Keyboard shortcuts</summary>
        <dl className="keys">
          {KEYS.map(([what, how]) => (
            <div key={what}>
              <dt>{what}</dt>
              <dd>{how}</dd>
            </div>
          ))}
        </dl>
      </details>
      <p>
        Pagelapse is open source (MIT). <a href="https://github.com/geekplux/pagelapse">Source on GitHub</a>
      </p>
    </footer>
  );
}
