import { Wordmark } from '../design/Wordmark.tsx';
import { SamplePicker } from './SamplePicker.tsx';
import { UrlForm } from './UrlForm.tsx';

/** Skip links, then one row: the wordmark, the URL form, the sample toggles (the tagline is in the footer). */
type Props = Parameters<typeof SamplePicker>[0] & {
  /** Whether a sample is shown, so `#diff` (the change panel or its empty state) exists. */
  hasDiff: boolean;
  /** The address in `?url=`, prefilled in the form. */
  url: string;
  onUrl: (url: string) => void;
};

export function AppHeader({ hasDiff, url, onUrl, ...props }: Props) {
  return (
    <header className="site-header" data-region="header">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      {hasDiff && (
        <a className="skip-link" href="#diff">
          Skip to diff
        </a>
      )}
      <h1>
        <a href="/" className="home-link">
          <Wordmark />
        </a>
      </h1>
      <UrlForm value={url} onSubmit={onUrl} />
      <SamplePicker {...props} />
    </header>
  );
}
