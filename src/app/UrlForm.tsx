import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { validateTargetUrl } from '../core/url.ts';
import { type SampleEntry, hostOf } from '../samples/index.ts';

const problem = (v: string) => {
  const check = validateTargetUrl(v);
  return check.ok ? '' : check.message;
};

interface Props {
  /** The page address the field holds (the current page in the workspace). */
  value: string;
  onSubmit: (url: string) => void;
  /** The hero's 48 px field; the header's 40 px one otherwise. */
  hero?: boolean;
  /** Workspace: focusing the field lists these samples, `currentId` checked (target/V3Menu.html). */
  menu?: { samples: readonly SampleEntry[]; currentId: string; onPick: (entry: SampleEntry) => void } | undefined;
}

/** A page outline: the samples' mark on the hero options and in the address menu. */
export const PageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="3" y="1.5" width="10" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The address field and "Show its history". Validated here first, so a bad address never reaches the API. With
 * `menu`, it is a combobox: focus opens the samples list, arrow keys move through it, Enter picks, Escape closes.
 */
export function UrlForm({ value, onSubmit, hero = false, menu }: Props) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  const [error, setError] = useState(() => (value ? problem(value) : ''));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // A new page (another sample, a live run) refills the field.
  if (value !== shown) {
    setShown(value);
    setText(value);
    setError('');
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setOpen(false);
    const check = validateTargetUrl(text);
    const next = check.ok ? '' : check.message;
    if (next && next === error) {
      // The same mistake again: clear the alert, then fill it on the next frame so it is announced again.
      setError('');
      requestAnimationFrame(() => setError(next));
    } else setError(next);
    if (check.ok) onSubmit(check.url);
  };
  const show = () => {
    setOpen(true);
    setActive(-1);
  };
  const pick = (entry: SampleEntry) => {
    setOpen(false);
    menu?.onPick(entry);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!menu) return;
    const n = menu.samples.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      setOpen(true);
      setActive(!open || active < 0 ? (down ? 0 : n - 1) : (active + (down ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' && open && menu.samples[active]) {
      e.preventDefault();
      pick(menu.samples[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };
  const optionId = (i: number) => `addr-opt-${i}`;

  return (
    // noValidate: bare hosts like `example.org/about` are fine here, but not to the browser's own URL check.
    <form className={`addr${hero ? ' is-hero' : ''}`} onSubmit={submit} noValidate>
      <div className="addr-box">
        <label className="addr-field">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            id="url-input"
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            aria-label="Page address"
            placeholder={hero ? 'whatwg.org/faq' : 'Paste a page address, e.g. whatwg.org/faq'}
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              setOpen(false);
            }}
            onKeyDown={onKey}
            aria-invalid={error ? true : undefined}
            aria-describedby="url-error"
            {...(menu && {
              role: 'combobox',
              'aria-expanded': open,
              'aria-controls': 'addr-menu',
              'aria-autocomplete': 'none' as const,
              'aria-activedescendant': open && active >= 0 ? optionId(active) : undefined,
              onFocus: show,
              onClick: () => !open && show(),
              onBlur: () => setOpen(false),
            })}
          />
        </label>
        {menu && (
          <div className="addr-menu" hidden={!open}>
            <p id="addr-menu-h" className="addr-menu-h">
              Samples
            </p>
            {/* A combobox's popup: <select> and <datalist> cannot hold the host beside the name or the check mark. */}
            {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
            <div id="addr-menu" role="listbox" aria-labelledby="addr-menu-h">
              {menu.samples.map((s, i) => {
                const current = s.id === menu.currentId;
                return (
                  // Keys reach the options through the combobox (aria-activedescendant); a press must not blur the field.
                  // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
                  <div
                    key={s.id}
                    id={optionId(i)}
                    data-sample={s.id}
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                    role="option"
                    tabIndex={-1}
                    aria-selected={current}
                    className={`addr-opt${current ? ' is-current' : ''}${i === active ? ' is-active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                  >
                    {current ? <Check /> : <PageIcon />}
                    <span>{s.name}</span>
                    {hostOf(s.url) !== s.name && <span className="addr-host mono">{hostOf(s.url)}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <button type="submit" className="btn btn-go">
        Show its history
      </button>
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
