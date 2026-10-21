import { Wordmark } from '../design/Wordmark.tsx';
import { SamplePicker } from './SamplePicker.tsx';

/** Skip link, wordmark and tagline, then the sample picker. */
export function AppHeader(props: Parameters<typeof SamplePicker>[0]) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <a className="skip-link" href="#diff">
        Skip to diff
      </a>
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
