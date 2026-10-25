import { Wordmark } from '../design/Wordmark.tsx';
import type { SampleEntry } from '../samples/index.ts';
import { PageThemeToggle } from './ThemeToggle.tsx';
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
      d="M8 0C3.6 0 0 3.6 0 8c0 3.5 2.3 6.5 5.5 7.6.4.1.6-.2.6-.4 0-.2 0-.8 0-1.5-2 .4-2.5-.5-2.7-.9-.1-.2-.5-.9-.8-1.1-.3-.1-.7-.5 0-.5.6 0 1.1.6 1.2.8.7 1.2 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3.7 0 1.4.1 2 .3 1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.6 4 .3.2.5.7.5 1.5 0 1.1 0 1.9 0 2.2 0 .2.1.5.6.4A8 8 0 0 0 16 8c0-4.4-3.6-8-8-8z"
    />
  </svg>
);

/**
 * Skip links, then one row: the wordmark, the address field (workspace only; its menu lists the samples), the theme
 * button and the GitHub link. On the hero the headline is the page's h1, so the wordmark is a plain link there.
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
        <div className="head-tools">
          <PageThemeToggle />
          <a className="icon-btn gh-link" href="https://github.com/geekplux/pagelapse" aria-label="Source on GitHub">
            <GitHub />
          </a>
        </div>
      </div>
    </header>
  );
}
