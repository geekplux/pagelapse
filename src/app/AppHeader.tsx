import { Wordmark } from '../design/Wordmark.tsx';
import type { SampleEntry } from '../samples/index.ts';
import { UrlForm } from './UrlForm.tsx';

type Props =
  | { hero: true }
  | {
      hero?: false;
      /** Whether a sample is shown, so `#diff` (the change panel or its empty state) exists. */
      hasDiff: boolean;
      /** The current page's address, in the field. */
      url: string;
      onUrl: (url: string) => void;
      samples: readonly SampleEntry[];
      /** The open sample, checked in the field's menu ('' for a live run). */
      selectedId: string;
      onSelect: (entry: SampleEntry) => void;
    };

const GitHub = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
);

/**
 * Skip links, then one row: the wordmark, the address field (workspace only; its menu lists the samples) and the
 * GitHub link. On the hero the headline is the page's h1, so the wordmark is a plain link there.
 */
export function AppHeader(props: Props) {
  const Brand = props.hero ? 'div' : 'h1';
  return (
    <header className={`site-header${props.hero ? '' : ' is-work'}`} data-region="header">
      <div className="head-row">
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        {!props.hero && props.hasDiff && (
          <a className="skip-link" href="#diff">
            Skip to diff
          </a>
        )}
        <Brand className="brand">
          <a href="/" className="home-link">
            <Wordmark />
          </a>
        </Brand>
        {!props.hero && <UrlForm value={props.url} onSubmit={props.onUrl} menu={{ samples: props.samples, currentId: props.selectedId, onPick: props.onSelect }} />}
        <a className="gh-link" href="https://github.com/geekplux/pagelapse" aria-label="Source on GitHub">
          <GitHub />
        </a>
      </div>
    </header>
  );
}
