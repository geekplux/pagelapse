import type { SampleArchive, SampleSource } from '../core/types.ts';

const ARCHIVE_NAMES: Record<SampleArchive, string> = {
  'internet-archive': 'Internet Archive Wayback Machine',
  'arquivo-pt': 'Arquivo.pt',
  illustrative: 'illustrative, not an archive capture',
};

/** Credits: where live captures come from, the current sample's provenance and licence, the source code. */
export function AppFooter({ source }: { source: SampleSource }) {
  return (
    <footer className="site-footer">
      <p>
        Live captures come from the{' '}
        <a href="https://web.archive.org/">Internet Archive's Wayback Machine</a>. We fetch slowly and cache
        everything to be kind to it.
      </p>
      <p>
        This sample: {ARCHIVE_NAMES[source.archive]} · recorded <span className="mono">{source.recordedAt}</span> ·{' '}
        {source.recorder}. {source.attribution} Licence:{' '}
        <a className="licence-link" href={`https://spdx.org/licenses/${source.license}.html`}>{source.license}</a>.
      </p>
      <p>
        wayback-diff is open source (MIT). <a href="https://github.com/geekplux/wayback-diff">Source on GitHub</a>
      </p>
    </footer>
  );
}
