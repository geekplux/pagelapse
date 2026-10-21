import { type FormEvent, useState } from 'react';
import { validateTargetUrl } from '../core/url.ts';

const problem = (v: string) => {
  const check = validateTargetUrl(v);
  return check.ok ? '' : check.message;
};

/** The header's hero: paste a URL, press Enter. Validated here first, so a bad address never reaches the API (AC 4). */
export function UrlForm({ value, onSubmit }: { value: string; onSubmit: (url: string) => void }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState(() => (value ? problem(value) : ''));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const check = validateTargetUrl(text);
    setError(check.ok ? '' : check.message);
    if (check.ok) onSubmit(check.url);
  };
  return (
    // noValidate: bare hosts like `example.org/about` are fine here, but not to the browser's own URL check.
    <form className="url-form" onSubmit={submit} noValidate>
      <label htmlFor="url-input">See how any page changed</label>
      <div className="url-row">
        <input
          id="url-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="Paste any URL, e.g. whatwg.org/faq"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby="url-error"
        />
        <button type="submit" className="btn btn-go">
          Show changes
        </button>
      </div>
      <p id="url-error" className="url-error" role="alert">
        {error && (
          <>
            <span aria-hidden="true">⚠ </span>
            {error}
          </>
        )}
      </p>
    </form>
  );
}
