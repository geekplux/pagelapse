import { useEffect, useMemo, useRef, useState } from 'react';
import type { SampleFixture, TimelineEntry } from '../core/types.ts';
import { ARCHIVES } from '../archive/archives.ts';
import { viewCaptureUrl } from '../core/url.ts';
import { fixtureToSnapshots } from '../core/fixture.ts';
import { buildTimeline, compareCaptures, trivialEntries, withAiSummaries } from '../core/timeline.ts';
import { changePictures, decodePicture } from '../samples/index.ts';
import { ChangesList } from './ChangesList.tsx';
import { SheetHead } from './SheetHead.tsx';
import { ChangeCard, DiffView } from './diff/DiffView.tsx';
import { Ribbon, TrivialToggle } from './timeline/Ribbon.tsx';
import { Ts } from './Ts.tsx';
import { type UrlState, changeIndex } from './urlState.ts';
import { StepNav } from './visual/Controls.tsx';
import { usePlay } from './visual/usePlay.ts';
import { VisualPane } from './visual/VisualPane.tsx';
import { DEFAULT_MODE, type Mode, type Side, captureForChange, changeForCapture, initialView, overviewPair, pairOf, parseMode, sampleView, showingText, sideOf, viewQuery } from './visual/visualState.ts';

interface Props {
  fixture: SampleFixture;
  /** `<from>-<to>` pair to select first; the featured change, else the latest, when missing or unknown. */
  initialChange?: string | undefined;
  /** Capture to show first (`?at=`). */
  initialAt?: string | undefined;
  /** Compare mode to show first (`?view=`); Slider when missing or unknown. */
  initialMode?: string | undefined;
  /** Open on the decade compare (first complete capture ↔ latest) when the address asks for no change or capture. */
  overview?: boolean;
  onChange: (q: Pick<UrlState, 'change' | 'at' | 'view'>) => void;
}

/** The sample: the title block, the stage and its controls, the time ribbon, the selected change, the folded lists, then the diff. */
export function TimelineView({ fixture, initialChange, initialAt, initialMode, overview = false, onChange }: Props) {
  const root = useRef<HTMLElement>(null);
  const { snapshots } = fixture;
  // Baked AI summaries (scripts/bake-sample-summaries.ts), if any; else every change reads "auto summary".
  const timeline = useMemo(() => {
    const baked = Object.entries(fixture.summaries ?? {}).flatMap(([pair, s]) => (s.source === 'ai' ? [[pair, s.text] as const] : []));
    return withAiSummaries(buildTimeline(fixture.url, fixtureToSnapshots(fixture)), new Map(baked));
  }, [fixture]);
  const { entries, trivialCaptures } = timeline;
  const trivial = useMemo(() => new Set(trivialCaptures), [trivialCaptures]);
  const [showTrivial, setShowTrivial] = useState(false);
  const all = useMemo(
    () => (showTrivial ? [...entries, ...trivialEntries(timeline)].sort((x, y) => (x.to < y.to ? -1 : 1)) : entries),
    [showTrivial, entries, timeline],
  );
  const shown = useMemo(() => ({ ...timeline, entries: all, trivialCaptures: showTrivial ? [] : trivialCaptures }), [timeline, all, showTrivial, trivialCaptures]);
  const [view, setView] = useState(() => {
    const v = initialView(entries, snapshots.map((s) => s.ts), { change: initialChange, at: initialAt, featured: fixture.featured });
    return { key: entries[v.index] ? pairOf(entries[v.index]!) : '', at: v.at };
  });
  const [mode, setMode] = useState<Mode>(() => parseMode(initialMode) ?? DEFAULT_MODE);
  // The decade compare: a decade in one drag. The pane, the change line and the text diff show the first complete
  // capture against the latest; the timeline keeps the latest change selected. Any selection, Single or Play leaves it.
  const span = useMemo(() => {
    const pair = overview ? overviewPair(snapshots) : undefined;
    const [a, b] = [pair?.from, pair?.to].map((ts) => timeline.snapshots.find((s) => s.ts === ts));
    return pair && a && b ? { entry: compareCaptures(a, b), skipped: pair.skipped, latest: pair.to === snapshots.at(-1)?.ts } : undefined;
  }, [overview, snapshots, timeline]);
  const [wide, setWide] = useState(() => !!span && entries.length > 0 && !initialChange && !initialAt && parseMode(initialMode) !== 'single');
  const selected = changeIndex(all, view.key);
  const entry = all[selected];
  const shownEntry = wide && span ? span.entry : entry;
  const ends = span && ([span.skipped ? 'earliest complete' : 'first', span.latest ? 'latest' : 'latest complete'] as const);
  const capUrl = (ts: string) => viewCaptureUrl(fixture.source.archive, ts, fixture.url);
  const page = (ts: string) => timeline.snapshots.find((s) => s.ts === ts);
  /** Selects change `e`, showing capture `at` (default: the same side as now, so Before stays Before while scrubbing). */
  const choose = (e?: TimelineEntry, at?: string, m = mode) => {
    if (!e) return;
    setWide(false);
    const next = at ?? captureForChange(e, entry && sideOf(entry, view.at) === 'before' ? 'before' : 'after');
    setView({ key: pairOf(e), at: next });
    onChange(viewQuery(e, next, m));
  };
  const changeMode = (m: Mode) => {
    setMode(m);
    if (wide && m !== 'single') return onChange({ view: m === DEFAULT_MODE ? undefined : m });
    setWide(false);
    if (entry) onChange(viewQuery(entry, view.at, m));
  };
  const select = (i: number) => choose(all[i]);
  const showCapture = (ts: string, list = all, m = mode) => choose(list[changeForCapture(list, ts)], ts, m);
  const toggleTrivial = (on: boolean) => {
    setShowTrivial(on);
    if (!on && !entries.some((e) => pairOf(e) === view.key)) showCapture(view.at, entries);
  };
  // Play steps through every capture in Single mode, from the first when the last is shown; it stops at the last.
  const captures = useMemo(() => snapshots.map((s) => s.ts), [snapshots]);
  const play = usePlay(() => {
    const next = captures[captures.indexOf(view.at) + 1];
    if (next) showCapture(next);
    return !!next && next !== captures.at(-1);
  });
  const togglePlay = () => {
    if (!play.playing) {
      setMode('single');
      setWide(false);
      if (view.at === captures.at(-1)) showCapture(captures[0]!, all, 'single');
      else if (entry) onChange(viewQuery(entry, view.at, 'single'));
    }
    play.toggle();
  };
  const viewOf = (ts: string) => sampleView(fixture, ts);
  const items = useMemo(() => snapshots.map((s) => sampleView(fixture, s.ts)), [fixture, snapshots]);

  // An unknown `?change=` or `?at=` was resolved to what is shown: show that in the address bar too.
  useEffect(() => {
    const q = entries[changeIndex(entries, view.key)];
    const want = viewQuery(q ?? { from: '', to: '' }, view.at, mode);
    if (wide) {
      if (initialMode !== want.view) onChange({ view: want.view });
      return;
    }
    if (q && ((initialChange !== undefined && initialChange !== view.key) || initialAt !== want.at || initialMode !== want.view)) onChange(want);
    // Runs once on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signal "rendered" to the smoke check once the timeline is in the DOM.
  useEffect(() => {
    if (!root.current) return;
    root.current.dataset.ready = 'true';
    performance.mark('wd:ready');
    // ... and "visual ready" once the first change's pictures have decoded (both sides, for the toggle and compare).
    const el = root.current;
    void Promise.all(changePictures(fixture, wide && span ? pairOf(span.entry) : view.key).map(decodePicture)).then(() => {
      el.dataset.visualReady = 'true';
      performance.mark('wd:visual-ready');
    });
    // Runs once on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <article className="sheet" aria-labelledby="sample-label" ref={root}>
      <div className="stage">
        <div className="hero" data-region="hero">
          <SheetHead id="sample-label" title={fixture.label} captures={captures} changes={entries.length} trivial={trivialCaptures.length} sample />
          {entry && shownEntry && (
            <VisualPane
              label={fixture.label}
              captures={captures}
              link={capUrl}
              view={viewOf}
              entry={shownEntry}
              at={view.at}
              trivial={trivial.has(view.at)}
              mode={mode}
              onMode={changeMode}
              onSide={(side: Side) => choose(entry, captureForChange(entry, side))}
              play={{ ...play, toggle: togglePlay }}
              nav={<StepNav entry={shownEntry} index={selected} count={all.length} onSelect={select} showing={showingText(captures, shownEntry, view.at, trivial.has(view.at))} quiet={play.playing} overview={wide ? ends : undefined} />}
            />
          )}
        </div>
        <div className="scrub" data-region="scrub">
          <h3 id="timeline-heading" className="sr-only">
            Timeline
          </h3>
          <Ribbon
            items={items}
            times={captures}
            timeline={shown}
            selected={selected}
            pair={shownEntry}
            at={view.at}
            onSelect={select}
            onCapture={(ts) => showCapture(ts)}
            labelledBy="timeline-heading"
          />
          {!entry && (
            <p className="panel-summary" id="diff" tabIndex={-1}>
              Nothing meaningful changed across {snapshots.length} captures.
            </p>
          )}
          <TrivialToggle count={trivialCaptures.length} on={showTrivial} onToggle={toggleTrivial} />
        </div>
        {entry && shownEntry && <ChangeCard entry={shownEntry} index={selected} count={all.length} captureUrl={capUrl} overview={wide ? ends : undefined} />}
        <div className="lists" data-region="changes">
          {entry && (
            // The timeline's text alternative, folded at every width (one Enter away).
            <details className="fold changes-pane">
              <summary id="changes-heading">All changes ({all.length})</summary>
              <ChangesList entries={all} selected={selected} onSelect={select} />
            </details>
          )}
          <details className="fold captures-all">
            <summary>All {snapshots.length} captures</summary>
            <p className="captures-source">
              Captures from {ARCHIVES[fixture.source.archive].name}. Each date opens that capture in the archive.
            </p>
            {/* Safari drops list semantics when list-style is none, so the role is not redundant here. */}
            {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
            <ol className="captures" role="list" aria-label="Captures">
              {snapshots.map((s, i) => (
                <li key={s.ts}>
                  <span className="cap-no mono" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {/* Named by the long date inside <time>; the linter cannot see through the nested spans. */}
                  {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label */}
                  <a className="cap-link" href={capUrl(s.ts)}>
                    <Ts ts={s.ts} />
                  </a>
                  <span className="cap-title">
                    {s.title}
                    {trivial.has(s.ts) && (
                      <>
                        {' '}
                        <span className="source-label mono">trivial edit</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </div>
        {shownEntry && <DiffView entry={shownEntry} from={page(shownEntry.from)!} to={page(shownEntry.to)!} />}
      </div>
    </article>
  );
}
