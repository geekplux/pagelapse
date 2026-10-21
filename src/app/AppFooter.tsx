import { ARCHIVES } from '../archive/archives.ts';
import type { SampleSource } from '../core/types.ts';

/** Credits: where live captures come from, the current sample's provenance and licence, the source code. */
export function AppFooter({ source }: { source: SampleSource }) {
  const archive = ARCHIVES[source.archive];
  return (
    <footer className="site-footer">
      <p>
        Live captures come from the{' '}
        <a href="https://web.archive.org/">Internet Archive's Wayback Machine</a>. We fetch slowly and cache
        everything to be kind to it.
      </p>
      <p>
        This sample: captures from <a href={archive.home}>{archive.name}</a>, recorded{' '}
        <span className="mono">{source.recordedAt}</span> with {source.recorder}. {source.attribution} Licence:{' '}
        <a className="licence-link" href={`https://spdx.org/licenses/${source.license}.html`}>{source.license}</a>.
      </p>
      <p>
        Pagelapse is open source (MIT). <a href="https://github.com/geekplux/pagelapse">Source on GitHub</a>
      </p>
    </footer>
  );
}
