import { Wordmark } from '../design/Wordmark.tsx';
import { SamplePicker } from './SamplePicker.tsx';
import { UrlForm } from './UrlForm.tsx';

/** Skip link, wordmark and tagline, the URL form (the hero), then the sample picker. */
type Props = Parameters<typeof SamplePicker>[0] & {
  /** Whether a sample is shown, so `#diff` (the change panel or its empty state) exists. */
  hasDiff: boolean;
  /** The address in `?url=`, prefilled in the form. */
  url: string;
  onUrl: (url: string) => void;
};

export function AppHeader({ hasDiff, url, onUrl, ...props }: Props) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      {hasDiff && (
        <a className="skip-link" href="#diff">
          Skip to diff
        </a>
      )}
      <div className="masthead">
        <h1>
          <a href="/" className="home-link">
            <Wordmark />
          </a>
        </h1>
        <p className="tagline">How a web page changed over the years, one meaningful edit at a time.</p>
        <UrlForm value={url} onSubmit={onUrl} />
      </div>
      <SamplePicker {...props} />
    </header>
  );
}
