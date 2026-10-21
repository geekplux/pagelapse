import { Wordmark } from '../design/Wordmark.tsx';
import { SamplePicker } from './SamplePicker.tsx';

/** Skip link, wordmark and tagline, then the sample picker. */
type Props = Parameters<typeof SamplePicker>[0] & {
  /** Whether a sample is shown, so `#diff` (the change panel or its empty state) exists. */
  hasDiff: boolean;
};

export function AppHeader({ hasDiff, ...props }: Props) {
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
      </div>
      <SamplePicker {...props} />
    </header>
  );
}
