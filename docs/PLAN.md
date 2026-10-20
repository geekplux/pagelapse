# wayback-diff: plan

Planner: `planner` sub-agent, 2026-10-19. This plan follows `CLAUDE.md`, which takes precedence wherever the two disagree. Open technical decisions are collected in section 5.9, each with a recommendation, for the main agent to record in `docs/DECISIONS.md`.

Environment facts checked while planning (2026-10-19). Several phases depend on them:

- The box has Node **20.19.2** and pnpm 9.15.9. Current Vitest (5.x) needs Node >= 22.12, and wrangler (4.151) needs Node >= 22. Phase 1 therefore pins the Node version through pnpm (`use-node-version`, see D2). nodejs.org is reachable.
- Current versions: vite 8.3 (Rolldown-based), vitest 5.0, oxlint 1.89, typescript 7.0 (native `tsc`), react 19.3, @vitejs/plugin-react 6.1, @cloudflare/vite-plugin 1.64 (peer: vite ^6/^7/^8 and wrangler ^4.151), wrangler 4.151, playwright-core 1.64, axe-core 4.14, htmlparser2 12.
- **`web.archive.org` cannot be reached from this box.** The TLS handshake through the egress proxy fails, and WebFetch is blocked too. `archive.org` is reachable, and so is **arquivo.pt**, a pywb-based public web archive with a compatible CDX API and `id_` raw replay. It has good coverage of the candidate sample pages, including Internet Archive-donated ARC files. This changes how the samples get recorded (phase 4, D12). The live product still targets the Internet Archive. It runs on Cloudflare, where the IA is reachable.
- `/usr/bin/google-chrome` exists. About 2.5 GB RAM is available, and no swap.

---

## 1. User first

### Who reaches for this

1. **The fact-checker or journalist.** Maya covers public institutions. A reader says an organisation "quietly rewrote" its mission page. She needs to know *when* the wording changed and *what* it said before, with links to the archived captures she can cite. Today she clicks through dozens of Wayback captures and diffs them by eye.
2. **The researcher, student or digital historian.** Tomas writes about how open-source projects present themselves. He wants to watch a project homepage evolve over ten years (the redesigns, the new taglines, the sections that appeared and disappeared) without reading 300 near-identical captures.
3. **The maintainer or writer doing a retrospective.** Priya is writing her project's ten-year anniversary post. She wants "what did our homepage say in 2014, and when did we start calling it X?" in a minute, not an afternoon.
4. **The curious web person.** Someone sees the link on Hacker News, clicks it, and wants to be impressed within seconds, without installing anything, signing up, or pasting a key.

### The moment

"I remember this page used to say something different. When did it change, and what changed?" That question is the trigger. The Wayback Machine has the data but answers in captures, not changes. wayback-diff answers in changes.

### Fastest path to the first "wow" (zero install, no account, no key)

The first 30 seconds:

| Time | What the user sees or does |
|---|---|
| 0 s | Opens the site. The page is already showing a built-in sample: the **Wikipedia "Internet Archive" article** across about 14 captures. The sample is pre-recorded, ships with the app, and renders offline with no network calls to the Archive or AI. The timeline sits at the top, with markers sized by how much changed. The newest meaningful change is selected, and its one-line summary and diff are visible. Nothing is spinning. |
| 3 s | The eye goes to the largest marker. The user clicks it, or presses Left/Right on the timeline. The summary line updates ("Added a section on the 2020 lawsuit; trimmed the history intro"), and the diff panel shows `+` and `−` marked passages with underline and strikethrough. |
| 10 s | They scrub with the arrow keys or drag across the timeline. Each step shows the date in mono (`2016·08·02 → 2018·01·19`), a magnitude word ("major"), and the summary. Trivial captures (date stamps, counters, whitespace) appear as faint hollow ticks and do not interrupt. |
| 15 s | They switch to another sample chip (the **git-scm.com** homepage, or the **WHATWG FAQ**). It renders instantly. |
| 20 s | They paste their own URL into the single input ("example.org/about" works without a scheme) and press Enter. The live run starts. A progress line reads "Fetching capture 3 of 16 · we go slowly to be kind to the Internet Archive", and markers appear on the timeline as captures arrive. |
| 30 s+ | Live changes appear progressively. Rule-based summaries show immediately and are replaced by AI one-liners when the Worker returns them. "Copy link" produces a shareable URL (`?url=...&change=...`). |

The cost of the first step is nothing: the sample is already rendered, and the only other action is pasting a URL.

---

## 2. Product goal

wayback-diff turns the Internet Archive's raw captures of any web page into a short, scrubbable story of how that page changed. Given a URL, it fetches a sampled set of captures from the Wayback Machine, slowly and with aggressive caching. It extracts each page's readable text and outline, diffs consecutive captures, discards trivial edits (dates, counters, whitespace, tracking parameters), and lays the meaningful changes out on a timeline whose markers are sized by change magnitude. Each change gets an inline diff marked with symbols and text styles (never colour alone) and a one-line summary. Summaries come from deterministic rules first, with a small Workers AI model where it helps, all cached. The first view costs nothing: built-in samples render instantly, offline and without any key. The project is MIT-licensed open source, built to be starred, shared and extended.

**Value, then convenience.** The user gets "when and what changed" for any page in about a minute instead of an afternoon of clicking through captures. Every feature below either shortens that path (samples, paste-a-URL, keyboard scrubbing, summaries, deep links) or makes the answer trustworthy (links to the exact captures, visible trivial-change filtering, honest "AI" and "auto" labels on summaries). Anything that does neither is out of scope.

---

## 3. Product acceptance criteria

Each criterion is testable. "Verified by" names the mechanism (U = Vitest unit test, S = headless-browser smoke flow, M = manual or verifier inspection, C = command output).

### Functional

1. On first load with no query string, the default built-in sample (Wikipedia "Internet Archive") renders its timeline, the selected latest meaningful change, its summary and its diff with **zero network requests to any non-same-origin host** (S: smoke blocks and counts non-localhost requests and asserts 0).
2. 2-3 built-in samples are selectable from the header. Switching samples needs no network beyond same-origin static files and renders within 300 ms on the verifier's desktop profile (S).
3. Every sample fixture is real recorded data from a public web archive. Its provenance (archive, recording date, recorder version, content licence and attribution) is stored in the fixture and shown in the UI footer (U + S).
4. The URL input accepts `https://…`, `http://…` and bare hosts or paths (`example.org/about`). It rejects non-http(s) schemes, credentials in URLs, IP-literal hosts and empty input, with an inline, programmatically associated error message (U + S).
5. Submitting a URL starts a live run: one captures request (CDX, collapsed monthly and by digest), at most **N = 16 captures by default (hard maximum 24)**, sampled across the full time range with preference for captures whose size changed. Captures are fetched with **at most 2 in flight** from the browser, through the Worker (U + S with mocked API).
6. Captures appear on the timeline progressively, and the run can be cancelled. Starting a new run aborts the previous one (S with mocked API).
7. Consecutive captures are diffed at block level and word level. The baseline for the next comparison is the last *meaningful* capture, so slow drift still surfaces (U).
8. Changes consisting only of whitespace, date/time strings, counters, copyright-year bumps or tracking parameters are classified as **trivial**. They are not shown as change markers but are counted ("9 trivial captures hidden") and visible as hollow ticks (U: eval set, 100% of must-drop cases dropped, >= 90% agreement overall).
9. Each meaningful change shows a one-line summary. A deterministic rule summary is always available instantly. When Workers AI is available, an AI summary replaces it and is labelled "AI summary" (text label, not just an icon). Rule summaries are labelled "auto summary" (U + S).
10. AI is called **only** for summaries of meaningful changes, **at most once per snapshot pair ever** (KV-cached by pair key), batched at <= 8 changes per call. The model input is a compact change record (<= 1,200 characters per change, <= 10,000 per batch), never a whole page (U).
11. If Workers AI is unavailable (local dev, no binding, error, rate limit), the app keeps working with rule summaries and shows no error to the user (U + S).
12. Every change in the diff view links to both archived captures (`https://web.archive.org/web/<ts>/<url>`, or the recording archive for samples) (S).
13. Deep links work: `?sample=<id>&change=<from>-<to>` and `?url=<encoded>&change=<from>-<to>` restore the same view, and "Copy link" copies the current one (S).
14. Error states are specific and actionable: invalid URL, no captures, site excluded from the Archive, Archive rate-limited (with retry time), Archive unavailable, partial capture failures (dashed markers, run continues), and app rate limit. Each offers "Try again" and "Open a sample" (S with mocked API).
15. Empty states: "no captures yet" (with a link to the Archive's Save Page Now) and "no meaningful changes across N captures" (shows the trivial count) (S).

### Politeness to the Internet Archive

16. All upstream requests carry `User-Agent: wayback-diff/<version> (+https://github.com/geekplux/wayback-diff)` (U).
17. Upstream retries happen only on 429/502/503/504 or network errors: at most 3 attempts with exponential backoff (1 s, 2 s, 4 s, plus or minus 20% jitter), honouring `Retry-After` up to 30 s. A longer `Retry-After` is surfaced to the user rather than waited out. A 429 from the IA puts the Worker into a 60 s global cooldown (KV flag) during which no uncached upstream requests are made (U).
18. CDX results are cached for 24 h. Extracted captures, which are immutable, are cached indefinitely under versioned keys. A repeated run for the same URL makes **zero** upstream requests (U).
19. Raw HTML is never stored. Only extracted text and outline are, capped at 2 MB fetched HTML and 30,000 characters or 400 blocks extracted per capture (U).
20. Tests and CI never touch the live network. The sample recorder is the only code that does, it is never run by tests, and it runs at concurrency 1 with >= 1.5 s spacing (U + M).

### Accessibility

21. Keyboard: the timeline is a single tab stop with `role="slider"`. Left/Right move to the previous or next meaningful change, Home/End go to the first or last, and PageUp/PageDown jump about a year. Every control is reachable in a logical order with a visible focus indicator (>= 3:1 against adjacent colours). A "Skip to diff" link exists (S: keyboard-only flow).
22. Screen readers: the slider has `aria-valuetext` such as "Change 4 of 11: 17 March 2014 to 2 June 2016, major: Added section 'Downloads'". The changes list (an ordered list of buttons with `aria-current`) is a full text alternative to the SVG timeline. Diff blocks carry visually hidden "Added:" / "Removed:" / "Changed:" prefixes in addition to `<ins>`/`<del>`. Live-run progress is announced through a polite live region throttled to at most one update per 2 s (S + M with the a11y-reviewer).
23. Never colour alone. Additions use a `+` gutter symbol and underline, removals use `−` and strikethrough, modified blocks use `~`. Magnitude is shown by marker size, ramp lightness *and* a word ("minor / moderate / major"). Trivial captures are hollow ticks, failed captures are dashed (M + S: greyscale screenshot remains fully readable).
24. The palette passes CVD checks. Added and removed colours stay distinguishable under simulated protanopia, deuteranopia and tritanopia (Machado 2009, OKLab ΔE×100 >= 8), and the magnitude ramp is monotone in lightness (U: `palette.test.ts`; S: CVD-simulated screenshots).
25. Contrast meets WCAG 2.2 AA: text >= 4.5:1 (large text >= 3:1) and UI component boundaries and graphics >= 3:1, in light and dark themes (U: contrast pairs test; S: axe).
26. `prefers-reduced-motion: reduce` disables all transitions, staggered reveals and smooth scrolling. Nothing flashes (S: reduced-motion screenshot + computed-style check).
27. axe-core reports 0 serious or critical violations on every screen and state (S).
28. Layout reflows at 320 CSS px wide and at 200% zoom without loss of content. Only the timeline itself may scroll horizontally, and only inside its own container. Pointer targets are >= 24×24 CSS px (S).
29. Forced-colors mode keeps `ins`/`del` styling, focus rings and markers visible (`@media (forced-colors: active)` rules) (M).

### Performance and footprint

30. The initial JS is <= 100 KB gzip, CSS <= 15 KB gzip, self-hosted fonts <= 60 KB total, and the default sample payload <= 40 KB gzip (C: `pnpm size` fails the build when over budget).
31. On the verifier's desktop profile (localhost preview, no throttling), time from navigation to "default sample timeline rendered" (`data-ready="true"`) is <= 1,000 ms (S measures and reports it).
32. Runtime dependencies: the browser bundle ships only `react` and `react-dom`, and the Worker adds only `htmlparser2`. Any further runtime dependency needs a DECISIONS.md entry. `htmlparser2` must not appear in the client bundle (C: size script checks chunk contents).
33. Diffing two 2,000-block pages takes < 100 ms in Node. A pathological diff hits the edit-distance cutoff and degrades to block replacement instead of hanging (U).

### Offline samples, no-key operation and code quality

34. `pnpm build && pnpm preview` with no `.dev.vars`, no Cloudflare login and no network to the Archive serves a fully working sample experience (S).
35. No secrets are in git. `.dev.vars` is gitignored, and `.dev.vars.example` documents optional keys (C: grep).
36. The core pipeline (`src/core/`) is a typed public API with TSDoc on every export, has no DOM or network access, and is shared unchanged by the browser, the Worker and the recorder (C: `tsc`; U).
37. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all pass on every phase branch. The CI definition lives in `ci/github-workflow.yml`, not `.github/workflows/` (C).

---

## 4. Design direction: "the archivist's proof sheet"

The identity mixes two familiar objects: an **archival index card** (warm paper, ink, catalogue numbers) and a **proofreader's marked-up galley** (insertions and deletions in the margin). The timeline reads like a **seismograph strip** laid across the years: a quiet baseline with marks where the page "moved". It is specific to this product: time, archives, edits. It is not a dashboard template. There is no decorative 3D, no gradients-for-gradients'-sake and no glassmorphism.

### Typography (no external font CDN at runtime)

- **Display / wordmark / section headings:** *Fraunces*, self-hosted from `public/fonts/` (SIL OFL 1.1, licence file committed alongside). Use static instances subset to Latin: `Fraunces-SemiBold.woff2` (600, opsz about 72, SOFT 50) and `Fraunces-Italic.woff2` (400 italic, wordmark only), together <= 60 KB. `font-display: swap`, with the first file preloaded. Fallback stack if the font cannot be obtained: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`. Obtain the font from the `google/fonts` GitHub repo (`ofl/fraunces`) and subset/instance it with `fonttools`, which is installed on the box. If that fails, ship the fallback stack and record it in DECISIONS.md.
- **Reading text (diff content):** a system serif stack for editorial readability: `Charter, "Bitstream Charter", "Iowan Old Style", "Sitka Text", Cambria, Georgia, serif`.
- **UI chrome:** `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`.
- **Timestamps, counts, code:** `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace`, with `font-variant-numeric: tabular-nums`. Dates are shown as `2014·03·17`, a nod to the CDX 14-digit timestamp, with a full accessible date in `<time datetime>` and in `aria-label`.
- Scale: base 16 px / line-height 1.55. Modular ratio 1.25 (12.8, 16, 20, 25, 31.25, 39 px). Diff text measure is capped at 72ch.

### Colour (CSS custom properties; `src/design/palette.ts` is the source of truth, mirrored in `src/design/tokens.css`)

| Token | Light | Dark | Use / check (computed 2026-10-19) |
|---|---|---|---|
| `--paper` | `#F6F1E7` | `#14120F` | page background |
| `--card` | `#FFFDF8` | `#1D1A16` | panels, diff surface |
| `--ink` | `#1F1B16` | `#EDE6D9` | primary text: 15.2:1 / 15.1:1 |
| `--ink-2` | `#5C5346` | `#A89F90` | secondary text: 6.7:1 on paper / 6.6:1 on card |
| `--rule` | `#D9CFBF` | `#3A342C` | decorative hairlines only |
| `--rule-strong` | `#8A7F6E` | `#6B6255` | input borders, axis: 3.5:1 / 3.1:1 |
| `--added` | `#1F5FB0` | `#7FB0EE` | `+` symbol, underline, "added" text: 6.2:1 / 7.7:1 on card |
| `--added-tint` | `#E3EDFA` | `#1E2A3D` | added block background (ink on tint 14.5:1 / 11.6:1) |
| `--removed` | `#B4441A` | `#E8895A` | `−` symbol, strike line: 5.5:1 / 6.7:1 on card |
| `--removed-tint` | `#FBE6DA` | `#3A2318` | removed block background (ink on tint 14.2:1 / 11.8:1; removed on tint 4.6:1) |
| `--mag-1..4` | `#A8926A #85693F #5E4826 #3A2A14` | `#6E5A3C #957A50 #BFA272 #E6CFA0` | sepia magnitude ramp for markers (single hue, monotone L; light end >= 2:1 vs card, validated) |
| focus ring | 2 px `--card` gap + 2 px `--ink` ring | same | colour-agnostic double ring, >= 3:1 everywhere |

How it stays CVD-safe and never colour-alone:

- Added and removed are a **blue/vermillion** pair. Validated with the dataviz palette validator (Machado 2009 simulation): light ΔE×100 22.4 (protan), tritan 28.2, normal 28.6. Dark pair ΔE 20.5 (protan), tritan 26.3. Both clear the >= 8 target by a wide margin. In dark mode these hues are used as **text and symbol colours** (judged by text contrast). If they are ever used as filled chart marks in dark mode, use the band-safe variants `#5E95D6` / `#D46E3A`.
- Hue is always the *secondary* channel. Primary encodings are the gutter symbols `+` / `−` / `~`, `<ins>` underline (2 px, offset 2 px) versus `<del>` line-through (2 px), the visually hidden text prefixes, marker size and shape (filled circle = meaningful, hollow tick = trivial, dashed ring = failed), and the magnitude word.
- The magnitude ramp is deliberately *not* the added/removed hues, so "big change" is never confused with "added".
- `palette.test.ts` re-computes all contrast pairs and CVD separations in CI. The smoke script captures protan, deutan, tritan and greyscale screenshots for every visualisation phase.

### Layout

- **Desktop (>= 960 px):** a header row with the wordmark on the left, then the URL input, which is the visual hero of the header with a wide, inviting field. Below it, sample chips ("Try: Wikipedia · git-scm.com · WHATWG FAQ"). Next is a full-width **timeline strip** (about 160 px tall): year axis, hairline capture ticks, magnitude markers, and the selected marker with a caret and date label. Below that, two columns. Left (320 px): the **Changes** list, with a mono date, magnitude word and one-line summary per item. Right: the **diff panel**, with a header ("2014·03·17 → 2016·06·02", links to both captures), the summary line with its source label, stats ("+142 / −37 words · 2 sections added"), a structure-changes list, then the inline diff with unchanged runs collapsed. The footer carries credits ("Captures courtesy of the Internet Archive's Wayback Machine"), sample provenance and licence, and a GitHub link.
- **Mobile (< 640 px):** stacked. Header and input, sample chips (horizontally scrollable with visible overflow affordance), the timeline (fits the width; markers keep >= 24 px hit areas, and dense ranges scroll inside the strip), a sticky bottom bar with "‹ Prev · 4 / 11 · Next ›", the summary, the diff, and the changes list collapsed behind a "All changes (11)" disclosure.
- **640-959 px:** single column like mobile, but with the changes list expanded.

### Motion

- Selecting a change moves the selection ring in 150 ms ease-out, and the diff panel cross-fades in 120 ms. On first render, markers draw in left to right with a stagger capped at 400 ms total. Live-run markers fade in as captures arrive (200 ms).
- `prefers-reduced-motion: reduce` gives no stagger, no cross-fade, instant ring moves and `scroll-behavior: auto`. No parallax, no looping animation, nothing flashes. The progress indicator is a static text counter plus a determinate bar, not a spinner.

### Logo and wordmark (SVG, `src/design/Logo.tsx` + `public/favicon.svg`)

- **Mark:** a 24×24 rounded square in `--ink` holding a counter-clockwise "rewind" arc (about 300°, 2 px stroke, arrowhead at the open end, in `--card`). Inside it sits a **±** glyph drawn as two paths: the plus half in `--added` and the minus half in `--removed` on light, and both in `--card` for monochrome and favicon. The meaning: going back in time, and what was added or removed. It must read in pure monochrome.
- **Wordmark:** `wayback` in Fraunces Italic + a small `±` in `--ink-2` + `diff` in the mono stack, set on a baseline with three tiny tick marks under it (the seismograph motif). Example: *wayback* ± `diff`.
- The mark is also the basis of the social preview image (phase 13).

### Polished states

- **Loading (live run):** the skeleton timeline shows the full date range immediately from the CDX response, with grey hairlines at every sampled capture. Each capture turns into a marker or hollow tick as it is processed. The status line reads "Fetching capture 5 of 16 (2014·03·17) · we fetch slowly to be kind to the Internet Archive", with a "Cancel" button. The diff panel shows the first finished change as soon as one exists.
- **Empty:** "The Archive has no captures of `example.org/about` yet." with a "Save it now" link to `https://web.archive.org/save/<url>` and "Open a sample". Or: "14 captures, 2011-2024: nothing meaningful changed. 13 trivial edits hidden (dates, counters, whitespace)." with a "Show trivial edits" toggle.
- **Error:** a calm card in `--card` with a heading, one-sentence cause, and next action. Covers invalid URL (inline at the field), excluded site, Archive rate limit ("The Internet Archive asked us to slow down. Try again in 40 s." with a live countdown in text), Archive unavailable, our own rate limit, and partial failures (an inline note, "2 captures could not be fetched", plus dashed markers). Errors never show stack traces.
- Illustrations, if any, are flat 2D line art in the same ink. No decorative 3D.

---

## 5. Architecture

### 5.1 Overview

```
Browser (React SPA, Vite 8 / Rolldown)                  Cloudflare Worker (one Worker, Workers Static Assets)
┌────────────────────────────────────────┐              ┌──────────────────────────────────────────────────┐
│ samples/*.json (bundled, offline) ─┐   │              │ GET  /api/health                                 │
│                                    ▼   │  same-origin │ GET  /api/captures?url=&max=  ── CDX (IA) ──┐     │
│ src/core (pure, shared) ◄── buildTimeline│ ───────────▶ │ GET  /api/snapshot?url=&ts=   ── id_ raw ───┤ IA  │
│   diff / score / ruleSummary           │              │       └ extract (src/core) ─ KV cache       │     │
│ UI: Timeline (SVG) · ChangesList ·     │              │ POST /api/summaries {url,pairs}             │     │
│     DiffView · UrlForm · states        │              │       └ load extracted pages from KV,        │     │
└────────────────────────────────────────┘              │         recompute ChangeRecord (src/core),   │     │
                                                        │         Workers AI (batched) ─ KV cache      │     │
                                                        │ everything else → static assets (SPA)        │     │
                                                        └──────────────────────────────────────────────────┘
Node scripts: scripts/record-samples.ts (src/core + src/archive) → src/samples/*.json  (only code that touches the live network)
```

### 5.2 Modules

| Path | Responsibility | Runs in |
|---|---|---|
| `src/core/types.ts` | Public types: `Block`, `BlockKind`, `ExtractedPage`, `Capture`, `SnapshotPage`, `PageDiff`, `BlockOp`, `WordOp`, `Significance`, `Magnitude`, `ChangeRecord`, `Summary`, `Timeline`, `TimelineEntry`, `SampleFixture` | all |
| `src/core/index.ts` | Public API barrel. TSDoc on every export; this is the "typed public API" | all |
| `src/core/fixture.ts` | `parseSampleFixture(json): SampleFixture` (hand-written guards, no zod), `fixtureToSnapshots()` (un-interns blocks) | browser, recorder, tests |
| `src/core/url.ts` | `normalizeTargetUrl`, `validateTargetUrl`, `stripTrackingParams`, `rawCaptureUrl(archive, ts, url)`, `viewCaptureUrl(...)`, `pairKey(from,to)` | all |
| `src/core/extract.ts` | `extractPage(html, opts): ExtractedPage` via the `htmlparser2` SAX `Parser`. Drops boilerplate and keeps main content blocks. `EXTRACTOR_VERSION` | Worker, recorder |
| `src/core/outline.ts` | `deriveOutline(blocks)` (heading tree) | all |
| `src/core/cdx.ts` | `buildCdxUrl(archive, url, opts)`, `parseCdxJson` (IA array-of-arrays), `parseCdxNdjson` (pywb/arquivo), `dedupeAdjacentDigests` | Worker, recorder |
| `src/core/sampling.ts` | `sampleCaptures(captures, max)`: time-bucketed, first and last always kept, prefers size-delta captures, deterministic | Worker, recorder |
| `src/core/normalize.ts` | `normalizeForCompare(text)`: NFC, whitespace, quotes and dashes, masks dates/times/counters/copyright years/tracking params | all |
| `src/core/myers.ts` | Generic O(ND) sequence diff with `maxEditDistance` cutoff | all |
| `src/core/diff.ts` | `diffPages(a, b)`: block alignment on normalised keys, pairing of modified blocks by similarity, word-level diff, move detection | all |
| `src/core/score.ts` | `scoreDiff(diff, a, b): Significance` (`score` 0..1, `magnitude`, `reasons`) | all |
| `src/core/changeRecord.ts` | `toChangeRecord(...)`: compact summariser input (<= 1,200 chars) | all |
| `src/core/ruleSummary.ts` | `ruleSummary(record): string`: deterministic one-liner | all |
| `src/core/timeline.ts` | `buildTimeline(url, snapshots, opts): Timeline`: baseline = last meaningful capture; supports incremental `appendSnapshot` | all |
| `src/archive/archives.ts` | Archive descriptors: `internet-archive` (CDX `https://web.archive.org/cdx/search/cdx`, raw `https://web.archive.org/web/<ts>id_/<url>`), `arquivo-pt` (CDX `https://arquivo.pt/wayback/cdx`, raw `https://arquivo.pt/wayback/<ts>id_/<url>`) | Worker, recorder |
| `src/archive/politeFetch.ts` | `politeFetch(url, {fetch, sleep, userAgent, maxAttempts, maxBytes, timeoutMs})`, `mapLimit(items, limit, fn)`. Injectable `fetch`/`sleep` so tests are offline and fast | Worker, recorder, browser (mapLimit) |
| `src/design/` | `palette.ts`, `tokens.css`, `base.css`, `Logo.tsx`, `Wordmark.tsx`, `cvd.ts` (Machado matrices + OKLab ΔE, used by tests and by the smoke CVD filters) | browser, tests |
| `src/app/` | `App.tsx`, `AppHeader.tsx`, `SamplePicker.tsx`, `UrlForm.tsx`, `timeline/{Timeline.tsx, scale.ts, useScrubber.ts}`, `ChangesList.tsx`, `diff/{DiffView.tsx, DiffBlock.tsx, WordDiff.tsx}`, `states/{Loading,Empty,ErrorCard}.tsx`, `live/{api.ts, useLiveTimeline.ts, useSummaries.ts}`, `urlState.ts` | browser |
| `src/samples/` | `index.ts` (registry with lazy `import()` per sample; default sample statically imported), `<id>.json` fixtures, `samples.config.json` (recorder input) | browser, recorder |
| `worker/` | `index.ts` (router), `routes/{health,captures,snapshot,summaries}.ts`, `cache.ts` (KV helpers, versioned keys), `limits.ts` (rate-limit binding + IA cooldown), `summarise.ts` (Workers AI batch + validation + fallback), `http.ts` (JSON responses, error codes, headers), `env.ts` (`Env` interface) | Worker |
| `scripts/` | `smoke.ts` (headless check), `smoke-flows.ts` (flow registry), `check-size.ts`, `record-samples.ts`, `bake-sample-summaries.ts` (optional, needs key), `render-social.ts` | Node 24 (native TS type stripping) |

Conventions: ESM everywhere. Relative imports carry explicit `.ts`/`.tsx` extensions (`allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`), so Node 24 runs the scripts natively with no `tsx` dependency and the same modules work in Vite and the Worker. No router library (state lives in `URLSearchParams`) and no state library (`useReducer`).

### 5.3 Data flow

**Samples (offline):** `src/samples/<id>.json` → `parseSampleFixture` → `fixtureToSnapshots` → `buildTimeline` (in the browser, about 10-30 ms) → UI. Summaries come from the fixture's `summaries` map (if baked, labelled AI), else `ruleSummary`. Fixture shape (schema v1, block-interned to stay small):

```ts
interface SampleFixture {
  schema: 1;
  id: string; label: string; url: string; description: string;
  source: { archive: 'internet-archive' | 'arquivo-pt' | 'illustrative'; recordedAt: string; recorder: string;
            license: string; attribution: string };
  blocks: Array<{ k: BlockKind; t: string; l?: 1 | 2 | 3 | 4 | 5 | 6 }>;   // unique blocks, stored once
  snapshots: Array<{ ts: string; digest: string; title: string; blockIds: number[]; truncated?: boolean }>;
  summaries?: Record<string /* "<fromTs>-<toTs>" */, { text: string; source: 'ai' | 'rule'; model?: string }>;
}
```

**Live run:**
1. `GET /api/captures?url=&max=16`. The Worker normalises the URL, checks KV `cdx:v1:<sha256(url)>` (24 h TTL), and on a miss runs a politeFetch of `cdx?url=<url>&output=json&fl=timestamp,digest,length&filter=statuscode:200&filter=mimetype:text/html&collapse=timestamp:6&collapse=digest` (multiple `collapse` params are supported by the CDX server; this bounds the result to about 12 rows a year). Then `dedupeAdjacentDigests` and `sampleCaptures`. Returns `{url, totalCaptures, firstTs, lastTs, captures: Capture[]}`.
2. The browser fetches `GET /api/snapshot?url=&ts=` for each sampled capture in chronological order with `mapLimit(2)`. The Worker checks KV `snap:v1:e<EXTRACTOR_VERSION>:<sha256(url)>:<ts>` (no TTL). On a miss it checks the IA cooldown and the per-IP rate limit, runs politeFetch on the raw `id_` URL (redirects followed; the final timestamp is recorded), decodes the charset, calls `extractPage`, stores the result in KV, and returns `ExtractedPage & {ts, requestedTs}` with `Cache-Control: public, max-age=31536000, immutable`.
3. As each snapshot arrives, the browser calls `timeline.appendSnapshot` and the UI updates progressively.
4. When the run completes (or every 4 meaningful changes), the browser sends `POST /api/summaries {url, pairs: [{from, to}]}` in batches of <= 8. The Worker loads both extracted pages **from its own KV** (pairs not in KV get `source: 'rule'`), recomputes `diffPages → toChangeRecord` with the shared core, checks the KV `sum:v1:<model>:p<PROMPT_VERSION>:<sha256(url)>:<from>-<to>` per pair, and sends only the misses to Workers AI in **one** call. It validates the output, caches it, and returns `{summaries: [{from, to, text, source}]}`. Recomputing server-side means the endpoint cannot be abused as a free general-purpose LLM proxy: the model only ever sees text derived from archived pages.

### 5.4 Cloudflare pieces

- **One Worker with Workers Static Assets** (recommended, as preferred). `wrangler.jsonc` has `assets: { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, so static files never cost a Worker invocation. Built and run with **`@cloudflare/vite-plugin`**, so `pnpm dev` and `pnpm preview` run the SPA and the Worker (in `workerd`) together, and `pnpm build` emits both plus a redirected wrangler config for deploy. Pages + Functions was rejected: Workers Static Assets is the current recommended path, and a single deployable is simpler.
- **KV** (`CACHE` binding): CDX results (24 h TTL), extracted snapshots (no TTL; immutable captures, versioned keys), summaries (no TTL), the IA cooldown flag (60 s TTL), and an approximate daily AI call counter.
- **Rate Limiting binding** (`ratelimits`): `UPSTREAM_LIMIT` caps uncached upstream fetches at 20 per minute per IP, and `AI_LIMIT` caps summary batches at 10 per minute per IP. Cache hits are never limited.
- **Workers AI** (`AI` binding): summaries only.
- **Not used:** R2 (extracted text is small; KV values may be up to 25 MB, and ours are <= 100 KB) and D1 (no relational data). Both are recorded as rejected alternatives.

### 5.5 Where AI is used, and only there

- **Only** in `worker/summarise.ts`, for the one-line summary of a meaningful change. Extraction, diffing, scoring, filtering, sampling and fallback summaries are all deterministic code.
- Model: `@cf/meta/llama-3.2-3b-instruct` (D10). Parameters: `temperature: 0.2`, `max_tokens: 48 × batchSize`. The prompt is versioned (`PROMPT_VERSION = 1`). System message: "You summarise how a web page changed between two archived captures. For each numbered change, reply with exactly one line: `<n>. <summary>`. Each summary is at most 90 characters, neutral, past tense, names concrete things (sections, claims, products of the page itself), no speculation, no quotes, no URLs." The user message is the numbered compact change records.
- Output validation: one line per item, 8-120 characters, no newline, no URL, not equal to the input. An invalid item falls back to `ruleSummary` for that item only.
- Calls are cached per snapshot pair. The model is called at most once per pair, ever. Batch <= 8 pairs per call, and an approximate daily cap (KV counter, default 3,000 calls/day) after which it falls back to rules.
- **Deterministic fallback summary**, used when there is no binding (local dev, tests), on AI error or rate limit, or for invalid output. Example outputs: `Added section "Downloads"; reworded 3 paragraphs (+140 / −62 words)`, `Removed 2 list items under "Features"`, `Title changed to "Git"`. The UI labels it "auto summary".
- Samples: rule summaries by default (`source: 'rule'`). `scripts/bake-sample-summaries.ts` can bake AI summaries into the fixtures through the Workers AI REST API if `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set in `.dev.vars` (never committed). If they are missing, the script prints instructions and exits 0, and the main agent lists "Workers AI token for baking sample summaries" as a non-blocking blocker in STATUS.md.

### 5.6 Change-detection details (owned by `diff-analyst`)

- **Normalisation for comparison** (display keeps the original text) masks the following as tokens: ISO and long-form dates (`2014-03-17`, `17 March 2014`, `Mar 17, 2014`), times, "Last updated/modified …", copyright lines (`© 2009-2014 …`), counters (number + count noun: "1,234 articles", "56 comments", "views", "visitors"), tracking params (`utm_*`, `fbclid`, `gclid`, `mc_eid`, `ref`, session ids), cache-busters, and IA artefacts. It also collapses whitespace, normalises quotes and dashes, and applies NFC.
- **Block diff:** Myers diff on normalised block keys. Adjacent removed+added runs are paired by word-set Jaccard >= 0.5 into `modified` blocks with a word-level diff. Identical text removed in one place and added in another becomes `moved`, with low weight.
- **Score:** weighted changed-word ratio. Headings and title changes count 3×, block add/remove 1×, word edits 1×, number-only edits 0.2×, moves 0.1×. The total is normalised by `max(wordsA, wordsB)`, with an absolute-words floor. Trivial means the score is below the threshold *or* every change is to masked tokens only. Magnitude buckets: `minor`, `moderate` and `major`, with thresholds set by the eval set. Marker area is proportional to the score (radius 5-14 px).
- **ChangeRecord** (summariser input): `{pair, title?, titleChanged?, headingsAdded[], headingsRemoved[], added[] (<= 5 snippets, <= 160 chars each), removed[] (<= 5), modified[] ({before, after}, <= 3, <= 160 chars each), stats: {wordsAdded, wordsRemoved, blocksAdded, blocksRemoved, blocksModified}}`, serialised <= 1,200 chars.
- **Eval set:** `src/core/__eval__/cases/*.json`, >= 24 labelled before/after pairs (trivial must-drop, minor, moderate, major) with an agreement test. It is kept passing whenever thresholds change.

### 5.7 Caching summary

| Layer | Key | TTL | Notes |
|---|---|---|---|
| KV CDX | `cdx:v1:<sha256(normUrl)>` | 24 h | new captures appear daily at most |
| KV snapshot | `snap:v1:e<EXTRACTOR_VERSION>:<sha256(normUrl)>:<ts>` | none | captures are immutable; bump the version to invalidate |
| KV summary | `sum:v1:<model>:p<PROMPT_VERSION>:<sha256(normUrl)>:<from>-<to>` | none | cached by snapshot pair |
| KV cooldown | `ia:cooldown` | 60 s | set on any IA 429 |
| HTTP | `/api/snapshot` immutable 1 y; `/api/captures` `max-age=3600`; `/api/summaries` `no-store` | | browser and edge reuse |
| Browser memory | `Map` of snapshots per run | session | re-scrubbing never refetches |
| Recorder | `.cache/record/<archive>/<sha>.html` (gitignored) | manual | re-running the recorder never refetches |

### 5.8 Testing strategy (RAM-aware)

- Vitest 5 in `node` environment for `src/core`, `src/archive`, `worker` and `scripts`. Component tests (few) use `happy-dom` + `@testing-library/react`. `maxWorkers: 2` in `vite.config.ts` (`test` block). Never watch mode (`pnpm test` = `vitest run`).
- Worker handlers are tested as plain functions with fake `Env` (in-memory KV, fake rate limiter, fake AI) and injected `fetch`/`sleep`. No `@cloudflare/vitest-pool-workers` (D15).
- **Headless smoke** (`scripts/smoke.ts`): see phase 1. UI flows that need the API use Playwright `page.route('/api/**')` with responses generated from the committed sample fixtures (`test/fixtures/api/`), so no Worker, Archive or network is needed. The smoke script blocks all non-localhost requests and reports the count.
- Accessibility automation: `axe-core` (dev dep) injected via `page.addScriptTag`. CVD simulation through an SVG `feColorMatrix` filter (Machado matrices from `src/design/cvd.ts`) applied to `<html>`, plus greyscale.

### 5.9 Open technical decisions (with recommendations)

| ID | Decision | Recommendation | Alternatives | Why |
|---|---|---|---|---|
| D1 | Hosting shape | One Worker with Workers Static Assets via `@cloudflare/vite-plugin`; `run_worker_first: ["/api/*"]` | Pages + Functions; separate API Worker + Pages | single deployable, the current recommended path, and dev/preview mirror prod in `workerd` |
| D2 | Node version on a Node 20 box | `.npmrc` `use-node-version=24.22.0` (Node 24 LTS "Krypton"); `engines.node ">=22.12"` | pin vitest 4 + wrangler <= 4.x with Node 20 support | the current Vitest, wrangler and plugin need Node >= 22; pnpm downloads Node once; Node 24 runs `.ts` scripts natively |
| D3 | TypeScript | `typescript@7` (native `tsc`); three configs (`tsconfig.app.json` DOM, `tsconfig.worker.json` workers types, `tsconfig.node.json` scripts + configs) | TS 5.9 | fast typecheck on a RAM-tight box; fall back to 5.9 only if a tool breaks (record it) |
| D4 | HTML extraction | `htmlparser2` SAX `Parser` in a pure module shared by the Worker and recorder | HTMLRewriter (Worker-only, can't run in Node); linkedom (heavier); DOMParser (browser-only) | one implementation everywhere, about 30 KB, fast, well tested |
| D5 | Diff algorithm | Own `myers.ts` (about 100 lines) with an edit-distance cutoff | `diff` (jsdiff) package | zero runtime deps, control over tokenisation and CPU bounds; diff-analyst owns and tests it |
| D6 | Where extraction and diff run | Extraction in the Worker (cache small extracted JSON, never raw HTML); diff in the browser for display *and* in the Worker for summary input | everything in the Worker; everything in the browser | per-snapshot Worker calls stay short (CPU and subrequest limits); IA is hit once per capture globally; the AI endpoint cannot be abused |
| D7 | CDX query | `collapse=timestamp:6&collapse=digest`, status 200, text/html, `fl=timestamp,digest,length` | `collapse=digest` alone | busy pages change digest at nearly every capture, so digest-only collapse can return 100k+ rows; monthly bounds the response |
| D8 | Sampling | N = 16 default, 24 max; time buckets; per bucket prefer the largest relative `length` change; always keep first and last | uniform time spacing; fetch everything | catches likely change points with zero extra requests |
| D9 | Storage | KV only (+ HTTP caching) | R2, D1, Cache API only | values are small; immutable keys; free tier friendly |
| D10 | Summary model | `@cf/meta/llama-3.2-3b-instruct` | `llama-3.2-1b-instruct` (weaker), `llama-3.1-8b-instruct-fp8` (costlier) | good enough for one-liners from a compact record; cheap; fast |
| D11 | AI binding in local dev | Code treats a missing or failed `env.AI` as "unavailable" and uses rule summaries. If the plugin demands a Cloudflare login at `dev`/`preview` because of the AI binding, move `ai` into `env.production` and build deploys with `CLOUDFLARE_ENV=production` | always-remote AI in dev | dev, preview and verification must work with no login and no key |
| D12 | Recording samples when `web.archive.org` is unreachable from the box | The recorder supports `--archive internet-archive` (default) and `--archive arquivo-pt` (pywb-compatible). Record with arquivo.pt now, store provenance in the fixture, and show it in the UI. Follow-up for Sean: re-run `pnpm record:samples` from an unrestricted machine to re-record from the IA | hand-made fixtures (not real data); WebFetch (blocked; content passes through a model) | real archival data, honest provenance, unblocks the samples |
| D13 | Sample pages (ids `wikipedia-internet-archive`, `git-scm`, `whatwg-faq`) | (1) `https://en.wikipedia.org/wiki/Internet_Archive` (CC BY-SA 4.0) as default; (2) `https://git-scm.com/` (open-source project homepage; site source MIT; coverage 2013-2025); (3) `https://whatwg.org/faq` (web standards org, CC BY 4.0; coverage 2020-2025). Alternates: `https://www.rust-lang.org/` (MIT/Apache-2.0 site), `https://html.spec.whatwg.org/multipage/introduction.html` | python.org, gnu.org free-sw (CC BY-ND, so derivatives are a licence problem) | not finance-related, not tied to any company, licences allow excerpts, and long histories; archive-integration confirms coverage and licence at recording time |
| D14 | Fonts | Self-hosted Fraunces (2 subset woff2) + system serif/sans/mono stacks | system fonts only; external CDN (forbidden at runtime) | distinctive identity at <= 60 KB, offline |
| D15 | Worker tests | Plain Vitest with fake `Env` and injected fetch | `@cloudflare/vitest-pool-workers` | `workerd` per test run is heavy on a 2 GB box |
| D16 | Agent skill / CLI | **Do not ship one** in this plan | a Claude skill; an npm CLI | the anatomy bar (SKILL.md + kit + references + audit scripts + evals) is real work that adds little over the zero-install web app; listed as a roadmap idea |
| D17 | Line-budget accounting | "Changed lines" exclude `pnpm-lock.yaml`, `src/samples/*.json`, `test/fixtures/**`, `src/core/__eval__/cases/**`, `docs/screenshots/**`, fonts, generated PNGs, and verbatim third-party texts (LICENSE, Contributor Covenant, OFL) | count everything | matches CLAUDE.md's "excluding lockfiles/fixtures" intent |

---

## 6. Phases

14 phases, slightly above the 9-12 guide. Merging any pair pushed a phase well past the 400-line review budget, and phases 12 and 13 are docs-heavy and quick to review. If fewer PRs are wanted, phases 12 and 13 are the safest pair to merge. Every phase leaves the app working: the sample view renders after every phase.

### Standard verification (SV), run by the verifier in every phase

1. `pnpm install --frozen-lockfile` → `pnpm lint` (oxlint, 0 errors) → `pnpm typecheck` → `pnpm test` (vitest run) → `pnpm build`. From phase 2 on, also `pnpm size` (budgets in AC 30/32).
2. `pnpm smoke --out docs/screenshots/phase-<n>` (the script ignores a leading `--`, so `pnpm smoke -- --out …` also works). This builds nothing; it requires `pnpm build` first. It starts the preview server, drives every flow registered so far in `scripts/smoke-flows.ts` with system Chrome, saves screenshots, asserts no console errors and **0 blocked non-localhost requests**, runs axe (from phase 2), and **always** kills the server and browser.
3. Look at every screenshot. Check every phase acceptance criterion with evidence.
4. Hard-rule grep: no secrets (`git diff main... | grep -iE "api[_-]?key|token|secret"` reviewed), no `next`/`remix` deps, no `.github/workflows/`, nothing finance-related, no employer mention, nothing deployed.
5. Cleanup: `ps -ef | grep -E "vite|workerd|chrome|wrangler"` shows nothing the verifier started.
6. Screenshot naming: `docs/screenshots/phase-<n>/<flow>-<desktop|mobile>[-dark|-reduced|-protan|-deutan|-tritan|-gray|-kbd].png`. Desktop is 1280×800, mobile 390×844.
7. **UI phases (2, 7, 8, 10, 11):** the main agent runs `a11y-reviewer` before the verifier signs off; its findings are fixed in the same verify loop.

---

### Phase 1: toolchain and built-in sample path

- **Branch:** `phase-1-toolchain-sample`
- **Specialist:** `implementer`
- **Goal:** a working, lint-clean, typed, tested React + Vite app that renders a minimal committed sample instantly and offline, plus the headless smoke tool every later phase relies on.
- **Scope:**
  - `package.json`: `"type": "module"`, `"packageManager": "pnpm@9.15.9"`, `"engines": {"node": ">=22.12"}`. Scripts: `dev` = `vite`, `build` = `vite build`, `preview` = `vite preview --port 4173 --strictPort --host 127.0.0.1`, `lint` = `oxlint`, `typecheck` = `tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json`, `test` = `vitest run`, `smoke` = `node scripts/smoke.ts`, `check` = lint && typecheck && test && build. Deps: `react`, `react-dom`. Dev deps: `vite@8`, `@vitejs/plugin-react`, `vitest`, `oxlint`, `typescript`, `@types/react`, `@types/react-dom`, `@types/node`, `playwright-core`.
  - `.npmrc` (`use-node-version=24.22.0`), `tsconfig.json` (references only), `tsconfig.app.json`, `tsconfig.node.json` (strict, `noUncheckedIndexedAccess`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`), `.oxlintrc.json` (plugins: typescript, react, jsx-a11y, vitest, import; correctness = error), `vite.config.ts` (react plugin, `test: { environment: 'node', maxWorkers: 2 }`).
  - `index.html` (`lang="en"`, title, meta description, no external resources), `src/main.tsx`, `src/app/App.tsx`, `src/app/SampleView.tsx` (minimal: label, URL, ordered list of captures as `<time>` + title, and `data-ready="true"` on the root once rendered).
  - `src/core/types.ts` (the full `SampleFixture` v1 type from section 5.3 and `Block`/`BlockKind`/`ExtractedPage`), `src/core/fixture.ts` (`parseSampleFixture`, `fixtureToSnapshots`) + `fixture.test.ts`.
  - `src/samples/index.ts` (registry; default sample statically imported), `src/samples/illustrative-demo.json`: a tiny **illustrative** fixture (`source.archive: "illustrative"`, a fictional "Example Community Garden" page, 4 snapshots, about 30 blocks). The UI shows "Illustrative demo" in its label. It is replaced by real recordings in phase 4.
  - `scripts/smoke.ts` + `scripts/smoke-flows.ts`. Behaviour: parse `--out <dir>` (default `docs/screenshots/latest`), `--flows a,b`, `--port 4173`. Spawn `pnpm preview` with `detached: true` (own process group) and print the PID. Wait for HTTP 200 (30 s timeout). Launch `playwright-core` `chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--disable-dev-shm-usage'] })`. One browser and one context at a time. `context.route('**/*')` aborts any request whose host is not `127.0.0.1`/`localhost` and counts it. Collect `console` errors and `pageerror`. Run the flows, take screenshots at 1280×800 and 390×844, and print a JSON report (flows, durations, time-to-`data-ready`, blocked count, console errors). In `finally`, close the browser, `process.kill(-pid, 'SIGTERM')`, and after 3 s send `SIGKILL`. Also install `SIGINT`/`SIGTERM`/`uncaughtException` handlers that run the same cleanup. Exit code is non-zero on any failure. Flow `sample-default` in this phase.
  - `ci/github-workflow.yml` (checkout, pnpm/action-setup, setup-node 24, `pnpm install --frozen-lockfile`, lint, typecheck, test, build). `LICENSE` (MIT, "Copyright (c) 2026 geekplux and wayback-diff contributors"). `.gitignore` additions: `.cache/`, `docs/screenshots/latest/`.
- **Acceptance criteria:**
  1. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass under the pnpm-managed Node (`pnpm exec node -v` prints v24.x).
  2. `parseSampleFixture` accepts the committed fixture and rejects at least 5 malformed variants (wrong schema, missing blocks, out-of-range blockIds, non-chronological timestamps, bad timestamp format), with tests.
  3. `pnpm smoke` renders the sample: all 4 capture dates are visible, there are 0 console errors and 0 blocked external requests, time-to-ready is reported, and both screenshots are written.
  4. Kill test: `pnpm smoke` with a deliberately failing flow (`--flows __fail`, a built-in self-test flow) exits non-zero **and** leaves no `vite`/`chrome` processes (`ps` check). The same holds when the script is interrupted with SIGINT mid-run.
  5. No files under `.github/workflows/`. The CI file exists at `ci/github-workflow.yml`.
- **Verifier:** SV 1-6. Screenshots `sample-default-desktop.png`, `sample-default-mobile.png`. Run the kill test from AC 4 and paste the `ps` output.
- **Risks:** `use-node-version` download blocked (mitigation: nodejs.org is reachable; fallback D2 alternative, recorded). TS 7 incompatibilities with `@types/*` (fallback TS 5.9). Chrome needs `--no-sandbox` in this container (allowed flag, documented in the script). About 350 lines.

### Phase 2: design system and app shell

- **Branch:** `phase-2-design-shell`
- **Specialist:** `implementer`; `a11y-reviewer` reviews
- **Goal:** the distinctive visual identity from section 4 in code: tokens, fonts, logo/wordmark, header with sample chips, footer with provenance, light/dark, reduced motion, plus automated palette and size checks.
- **Scope:** `src/design/palette.ts` (tokens as typed constants), `src/design/tokens.css`, `src/design/base.css` (reset, type scale, focus ring, `prefers-reduced-motion`, `forced-colors`), `src/design/cvd.ts` (Machado 2009 matrices, sRGB↔linear, OKLab ΔE, WCAG contrast), `src/design/palette.test.ts` (all contrast pairs from the section 4 table; added/removed ΔE >= 8 under protan/deutan/tritan in both themes; magnitude ramp monotone; `tokens.css` values equal `palette.ts`), `src/design/Logo.tsx`, `src/design/Wordmark.tsx`, `public/favicon.svg`, `public/fonts/Fraunces-*.woff2` + `OFL.txt`, `src/app/AppHeader.tsx`, `src/app/SamplePicker.tsx` (a group of toggle buttons with `aria-pressed`, keyboard-operable), `src/app/AppFooter.tsx` (archive credit, sample provenance and licence, GitHub link), restyled `SampleView.tsx`, `scripts/check-size.ts` + `pnpm size` (gzip budgets from AC 30; fails if `htmlparser2` appears in any client chunk). Smoke additions: flows `sample-default` (light and dark), `reduced-motion`, `keyboard-tab-order`; an axe pass on each flow; and a `--cvd` option that captures protan/deutan/tritan/gray variants.
- **Acceptance criteria:**
  1. The palette test passes and encodes every pair in the section 4 table.
  2. Light and dark themes follow `prefers-color-scheme`. Screenshots show the paper/ink identity, wordmark and logo.
  3. Fonts are served from `public/fonts/` (or the fallback stack is documented in DECISIONS.md). There are 0 external requests.
  4. axe: 0 serious/critical. Tab order is header → sample chips → content → footer links (the URL input joins after the wordmark in phase 10), with a visible focus ring on every stop.
  5. `pnpm size` passes and prints a budget table.
  6. The reduced-motion flow confirms `transition-duration` computes to `0s` on animated elements.
- **Verifier:** SV + screenshots `shell-desktop.png`, `shell-mobile.png`, `shell-desktop-dark.png`, `shell-desktop-kbd.png` (focus visible), `shell-desktop-{protan,deutan,tritan,gray}.png`.
- **Risks:** the font subset tooling (fonttools woff2 needs brotli; if it is missing, ship TTF→WOFF2 via another route or use the fallback stack). Identity drifting toward generic (the a11y-reviewer and main agent compare against section 4). About 380 lines.

### Phase 3: readable-text extraction and URL rules

- **Branch:** `phase-3-extract`
- **Specialist:** `archive-integration`
- **Goal:** a pure, deterministic, tested extractor that turns raw archived HTML into blocks and an outline, plus URL normalisation and validation shared by the UI, Worker and recorder.
- **Scope:** dependency `htmlparser2`. Files: `src/core/extract.ts` (SAX parse; skip `script, style, noscript, template, svg, iframe, nav, header, footer, aside, form, button, select`, elements with `role` in `navigation|banner|contentinfo|search` and `hidden`/`aria-hidden`; prefer `<main>`, `[role=main]` or `<article>` content when present, else `<body>`; strip Wayback toolbar remnants between `<!-- BEGIN WAYBACK TOOLBAR INSERT -->` and `END`; block kinds heading/paragraph/list-item/quote/code/table-row; entity decoding; whitespace collapse; caps of 400 blocks / 30,000 chars with `truncated`; `<title>` captured; `EXTRACTOR_VERSION = 1`), `src/core/outline.ts`, `src/core/url.ts` (normalise: add `https://` if no scheme, lowercase host, drop fragment, default ports, `stripTrackingParams`; validate: http/https only, no credentials, host has a dot, not an IP literal, length <= 2,048; `rawCaptureUrl`, `viewCaptureUrl`, `pairKey`), and `src/core/index.ts` barrel with TSDoc. Tests with small trimmed HTML fixtures under `test/fixtures/html/` (a Wikipedia-like article, an old table-layout homepage with a 1990s `<font>` soup, a page with a Wayback toolbar remnant, a page with `<main>` and noisy nav/footer, a non-UTF-8 meta charset page as already-decoded text, and an empty or broken page).
- **Acceptance criteria:**
  1. Each HTML fixture produces the expected title, block kinds and texts (inline expected snapshots in tests). Nav, footer, scripts and toolbar text never appear.
  2. Extraction is deterministic (same input, deep-equal output) and pure (no globals, no IO; enforced by the lint `no-restricted-globals` rule for `fetch`/`window`/`document` in `src/core/**`).
  3. A 500 KB synthetic page extracts in < 200 ms in Node (loose bound to avoid flakiness), and caps apply with `truncated: true`.
  4. URL tests cover normalisation and rejection (at least 15 cases, including `javascript:`, `ftp:`, `user:pass@`, `127.0.0.1`, `[::1]`, `localhost`, no-dot hosts, and `utm_*` stripping).
  5. `pnpm size` still passes. `htmlparser2` is not in the client bundle.
  6. The app still renders the sample (smoke regression).
- **Verifier:** SV + `sample-default-desktop.png` regression screenshot only.
- **Risks:** over-aggressive boilerplate removal on old table layouts. Mitigated with a fixture plus a fallback: if the "main" selection yields < 50 words, extract the whole body. About 330 lines + fixtures.

### Phase 4: archive client, sample recorder and real samples

- **Branch:** `phase-4-recorder-samples`
- **Specialist:** `archive-integration`
- **Goal:** polite archive access code (CDX, sampling, fetch with backoff) shared by the recorder and the later Worker, a recorder script, and 3 real, trimmed, committed sample fixtures replacing the illustrative one.
- **Scope:** `src/core/cdx.ts`, `src/core/sampling.ts`, `src/archive/archives.ts`, `src/archive/politeFetch.ts` (`politeFetch`, `mapLimit`; UA `wayback-diff/<version> (+https://github.com/geekplux/wayback-diff)`; retries only on 429/502/503/504/network errors, 3 attempts, backoff 1/2/4 s ±20%, `Retry-After` honoured up to 30 s else throws `RateLimitedError{retryAfter}`; `AbortSignal.timeout(20_000)`; `maxBytes` 2 MB with a streaming cutoff; charset detection from the header or `<meta charset>` with `TextDecoder`). `src/samples/samples.config.json` (the 3 pages from D13 with descriptions and licence/attribution strings). `scripts/record-samples.ts` (`pnpm record:samples [--archive internet-archive|arquivo-pt] [--only <id>] [--max 14] [--dry-run]`; concurrency 1, >= 1.5 s between requests; raw HTML cached in `.cache/record/`; extract → trim → intern blocks → write `src/samples/<id>.json`; prints a summary table). The 3 fixtures. Registry and `SamplePicker` updated to 3 samples, with Wikipedia as default. The illustrative fixture is deleted (its test switches to an inline minimal fixture). Fixture test: every committed sample parses, has >= 8 snapshots, is chronological, has unique digests, is <= 150 KB raw, and the default is <= 40 KB gzip. The footer shows each sample's archive provenance and licence.
- **Acceptance criteria:**
  1. Unit tests (all offline, with fake fetch/sleep): CDX URL building (includes both `collapse` params, filters, `fl`), IA JSON and pywb NDJSON parsing, adjacent-digest dedupe, sampling (<= max, first and last kept, deterministic, spread across buckets, prefers large length deltas), politeFetch (UA on every request, backoff sequence on 429/503, `Retry-After` honoured and capped, no retry on 404/403, gives up after 3, size cap), and `mapLimit` never exceeds its limit.
  2. Three real fixtures are committed with truthful `source` metadata. If recorded via arquivo.pt (expected; D12), the UI says "Captures from Arquivo.pt" and the capture links point there.
  3. The recorder is never imported by tests. `grep` shows no live-URL fetch in `*.test.ts`.
  4. The smoke flow `samples-switch` clicks each chip. Each sample renders with 0 external requests.
  5. If neither archive is reachable when the phase runs, the phase still ships the code and tests, keeps the illustrative sample, and the main agent records "record real samples" as a blocker in STATUS.md.
- **Verifier:** SV + screenshots `sample-<id>-desktop.png` for each sample and `samples-mobile.png`. Inspect fixture provenance by hand (open a capture link URL in the report; do not fetch it).
- **Risks:** arquivo.pt politeness and terms (single run, slow, identified UA). Licensing of excerpts (D13 picks permissive pages; attribution shown). Fixture size for Wikipedia (interning + caps; if still over budget, use a shorter article from the alternates). About 400 lines + fixtures.

### Phase 5: diff engine

- **Branch:** `phase-5-diff-engine`
- **Specialist:** `diff-analyst`
- **Goal:** correct, fast block-level and word-level diffs between extracted pages, with comparison normalisation.
- **Scope:** `src/core/normalize.ts`, `src/core/myers.ts`, `src/core/diff.ts` (types `PageDiff`, `BlockOp = equal | added | removed | modified{words: WordOp[]} | moved`, `WordOp = equal | ins | del`; word tokeniser that keeps punctuation attached sensibly and handles CJK by character). Tests and benchmarks only; no UI change beyond the smoke regression.
- **Acceptance criteria:**
  1. Reconstruction property: applying the ops to page A yields page B's blocks exactly (tested over the 3 samples' consecutive pairs and synthetic cases).
  2. Normalisation masks every category in section 5.6, with at least 2 positive and 1 negative test case each (for example "2014 Olympics" must not be masked as a date-only change when the surrounding words change).
  3. Modified-block pairing: a reworded paragraph becomes `modified` with word ops, not `removed` + `added`. A moved paragraph becomes `moved`.
  4. Performance: two 2,000-block pages diff in < 100 ms. A pathological input hits `maxEditDistance` and returns block-level replacement in < 200 ms.
  5. Everything is pure and deterministic; the lint rule from phase 3 still holds.
- **Verifier:** SV (regression screenshot only). Read the test names against AC 1-4.
- **Risks:** Myers edge cases (off-by-one in the trace). The property test catches them. About 380 lines.

### Phase 6: significance, trivial-change filtering, change records and timeline model

- **Branch:** `phase-6-significance`
- **Specialist:** `diff-analyst`
- **Goal:** decide what matters. Score each diff, drop trivial ones with a moving baseline, build compact change records and deterministic summaries, and assemble the `Timeline` model the UI consumes.
- **Scope:** `src/core/score.ts`, `src/core/changeRecord.ts`, `src/core/ruleSummary.ts`, `src/core/timeline.ts` (`buildTimeline`, `appendSnapshot`; entries hold `{from, to, diff, significance, record, ruleSummary}`; `trivialCaptures` list; baseline = last meaningful capture), `src/core/__eval__/cases/*.json` (>= 24 labelled cases) + `eval.test.ts` (prints a confusion matrix; asserts 100% of must-drop trivial cases dropped and >= 90% overall agreement), and a sample sanity test (each committed sample yields 4-15 meaningful changes; record the counts).
- **Acceptance criteria:**
  1. Eval thresholds are met (see above).
  2. `toChangeRecord` output is <= 1,200 chars serialised for every pair in the samples, includes headings added/removed, and contains no snippet longer than 160 chars.
  3. `ruleSummary` is always non-empty and <= 120 chars, mentions the most significant concrete element (a heading name or title) when one exists, and gives word counts otherwise.
  4. The moving baseline is tested: 5 consecutive tiny edits that each fall below the threshold but together exceed it surface as one meaningful change.
  5. `SampleView` lists meaningful changes with magnitude word and rule summary (a temporary simple list, replaced in phase 7), so the smoke screenshot shows real output.
- **Verifier:** SV + `changes-list-desktop.png`. Paste the eval confusion matrix into the report.
- **Risks:** threshold tuning overfitting the 3 samples (the eval set includes cases from other page types). About 390 lines + eval cases.

### Phase 7: timeline UI

- **Branch:** `phase-7-timeline-ui`
- **Specialist:** `implementer`; `a11y-reviewer` reviews
- **Goal:** the signature visual. An SVG seismograph timeline with magnitude-sized markers, keyboard scrubbing, pointer drag, tooltips, and a synced changes list as its text alternative.
- **Scope:** `src/app/timeline/scale.ts` (pure time→x scale, year ticks, collision-aware label placement; tests), `src/app/timeline/Timeline.tsx` (axis, capture hairlines, hollow trivial ticks, magnitude markers using area ∝ score and the `--mag-1..4` ramp, selected ring + caret + date label; `role="slider"` with `aria-valuemin/max/now/valuetext`; keys Left/Right/Home/End/PageUp/PageDown; pointer drag snaps to the nearest change; >= 24 px hit areas; tooltip on hover/focus via an HTML overlay, not the SVG `<title>` alone; `ResizeObserver` width; reduced-motion aware), `src/app/timeline/useScrubber.ts`, `src/app/ChangesList.tsx` (ordered list of buttons with `aria-current`, mono dates, magnitude word, summary), `src/app/urlState.ts` (`?sample=&change=`), `SampleView` replaced by `TimelineView` (timeline + list + a summary/stat panel; full diff comes in phase 8). Smoke flows: `timeline-keyboard` (focus slider, press Right ×3, End, Home, assert `aria-valuetext` changes and the list `aria-current` syncs), `timeline-pointer` (click a marker, drag), `timeline-deeplink`.
- **Acceptance criteria:**
  1. AC 21, 22 (timeline part), 23 (markers), 24, 26, 27 and 28 hold for the timeline and list.
  2. Marker sizes are monotone in score (unit test on the radius function). Three magnitude levels are visually distinct in the greyscale screenshot.
  3. A deep link `?sample=git-scm&change=<from>-<to>` loads with that change selected. An invalid `change` falls back to the latest change without error.
  4. Time-to-ready is still <= 1,000 ms (AC 31). Size budgets hold.
- **Verifier:** SV + screenshots `timeline-desktop.png`, `timeline-mobile.png`, `timeline-desktop-dark.png`, `timeline-desktop-kbd.png`, `timeline-desktop-{protan,deutan,tritan,gray}.png`, `timeline-desktop-reduced.png`, and a tooltip state `timeline-desktop-tooltip.png`.
- **Risks:** dense timelines (24 markers in one year) overlapping. Mitigated by scale padding and collision-aware labels, and on mobile the strip scrolls. SVG accessibility quirks: the slider role lives on a focusable `<div>` wrapping the SVG, and the SVG is `aria-hidden` with the list as the alternative. About 400 lines.

### Phase 8: diff view

- **Branch:** `phase-8-diff-view`
- **Specialist:** `implementer`; `a11y-reviewer` reviews
- **Goal:** show exactly what changed, readable and accessible, with links to the source captures.
- **Scope:** `src/app/diff/DiffView.tsx` (header with both dates and "View capture" links (new tab, `rel="noopener noreferrer"`, labelled with the date); summary line with source label; stats sentence; "Structure" list of heading/title changes; legend explaining `+ − ~` and the text styles; Prev/Next buttons; "Copy link" button with polite confirmation), `src/app/diff/DiffBlock.tsx` (gutter symbol, kind-appropriate element, visually hidden prefixes, tints), `src/app/diff/WordDiff.tsx` (`<ins>`/`<del>` with underline/strikethrough styles), collapse of unchanged runs >= 3 blocks ("Show 12 unchanged paragraphs" button), a "Show trivial edits" toggle that reveals hollow-tick captures as selectable "trivial" entries, a skip link "Skip to diff", and the mobile sticky Prev/Next bar. Component tests (happy-dom) for prefixes and the collapse logic. Smoke flows: `diff-default`, `diff-keyboard` (tab into the diff, expand unchanged, Prev/Next), `diff-copy-link`.
- **Acceptance criteria:**
  1. AC 12, 13 (sample part), 22 (diff part), 23, 25 and 29 hold.
  2. Greyscale and CVD screenshots of the diff remain unambiguous: every added/removed span is identifiable by symbol and text style alone.
  3. With a screen-reader-style text dump (Playwright `page.accessibility.snapshot()` or `innerText` of the diff), the selected diff reads as "Added: …", "Removed: …", "Changed: …" in document order.
  4. The diff panel's DOM stays < 1,500 nodes for the largest sample change with unchanged runs collapsed.
- **Verifier:** SV + screenshots `diff-desktop.png`, `diff-mobile.png`, `diff-desktop-dark.png`, `diff-desktop-{protan,deutan,tritan,gray}.png`, `diff-expanded-desktop.png`, `diff-desktop-kbd.png`, plus the a11y text dump in the report.
- **Risks:** very long modified blocks (clamp at 12 lines with "Show full block"). Copy-link clipboard permission in headless mode (grant `clipboard-write` in the context). About 400 lines.

### Phase 9: Worker archive API with caching and politeness

- **Branch:** `phase-9-worker-archive-api`
- **Specialist:** `archive-integration`
- **Goal:** the Cloudflare Worker that serves the SPA and the `/api/captures` and `/api/snapshot` endpoints, politely and cached, testable with no network.
- **Scope:** dev deps `wrangler`, `@cloudflare/vite-plugin`, `@cloudflare/workers-types`. `vite.config.ts` adds `cloudflare()`. `wrangler.jsonc` (`name: "wayback-diff"`, `main: "worker/index.ts"`, `compatibility_date: "2026-10-01"`, `assets: {not_found_handling: "single-page-application", run_worker_first: ["/api/*"]}`, `kv_namespaces: [{binding: "CACHE", id: "<set-at-deploy>"}]` (local dev uses a simulated store), `ratelimits: [{name: "UPSTREAM_LIMIT", namespace_id: "1001", simple: {limit: 20, period: 60}}]`, `observability: {enabled: true}`). `tsconfig.worker.json` (added to `typecheck`). `worker/index.ts`, `worker/env.ts`, `worker/http.ts` (JSON helpers, error codes `invalid_url | no_captures | excluded | archive_rate_limited | archive_unavailable | too_large | rate_limited | not_found`, security headers on API responses), `worker/cache.ts`, `worker/limits.ts` (rate limit + `ia:cooldown`), `worker/routes/health.ts` (`{ok, version, ai: "unavailable"}` for now), `worker/routes/captures.ts`, `worker/routes/snapshot.ts` (rejects `ts` that isn't 14 digits; IA CDX 403 "blocked site" maps to `excluded`). `.dev.vars.example` (comments only; no keys needed yet). Tests: `worker/**/*.test.ts` with fake Env/KV/limiter and a recorded-response fake fetch built from `test/fixtures/api/` + `test/fixtures/html/`.
- **Acceptance criteria:**
  1. AC 16-19 are proven by unit tests: UA header, retry/backoff/`Retry-After`, cooldown short-circuit, CDX cached 24 h (TTL asserted on the fake KV put), snapshot cached with no TTL, second identical run = 0 upstream calls, 2 MB cap → `too_large`, raw HTML never written to KV.
  2. Input validation: bad URL → 400 `invalid_url`; private and IP hosts rejected; `ts` validated; unknown `/api/*` → 404 JSON.
  3. `pnpm build` produces the client and the Worker. `pnpm preview` (workerd) serves the SPA with the sample working, and `curl -s 127.0.0.1:4173/api/health` returns `{"ok":true,...}`. No Cloudflare login is needed. All processes are killed afterwards.
  4. The smoke regression (sample flows) still passes against the plugin-based preview, with 0 external requests.
- **Verifier:** SV + the `curl` health check (paste output) + regression screenshots. Confirm `workerd` is not left running.
- **Risks:** the plugin preview's RAM use with Chrome at the same time (one browser, kill promptly). Workers free-plan CPU (10 ms) versus extraction of large pages: measure extract time for the biggest fixture HTML. If it exceeds about 8 ms, note "Workers Paid recommended" in DEPLOY docs (phase 14). Rate-limit binding simulation locally (if unsupported, the limiter is optional in code, guarded by `if (env.UPSTREAM_LIMIT)`). About 400 lines.

### Phase 10: live mode (paste a URL)

- **Branch:** `phase-10-live-mode`
- **Specialist:** `implementer` (consult `archive-integration` notes in `src/archive/`); `a11y-reviewer` reviews
- **Goal:** the second input path. Paste any URL, watch the timeline build progressively, with polished loading, empty and error states, cancellation and shareable links.
- **Scope:** `src/app/UrlForm.tsx` (labelled `type="url"` input with `inputmode="url"`, placeholder "Paste any URL, e.g. whatwg.org/faq", inline validation with `aria-describedby`/`aria-invalid`, submit on Enter, the field the visual hero of the header), `src/app/live/api.ts` (typed client; maps error codes to UI states), `src/app/live/useLiveTimeline.ts` (captures → `mapLimit(2)` snapshot fetches in chronological order → `appendSnapshot`; `AbortController`; in-memory cache; partial failures become dashed markers), `src/app/states/{LoadingStatus,EmptyState,ErrorCard}.tsx` (copy from section 4), `urlState.ts` extended for `?url=` (auto-starts on load), "Copy link" for live runs, and the throttled polite live region. `test/fixtures/api/` gains mock responses generated from the git-scm sample (a tiny generator in `scripts/` or test helper) and error variants. Smoke flows use `page.route('/api/**')`: `live-success` (with a 150 ms delay per snapshot to capture the progressive state), `live-cancel`, `live-no-captures`, `live-excluded`, `live-rate-limited`, `live-partial-failure`, `live-no-meaningful-changes`, `live-invalid-url`.
- **Acceptance criteria:**
  1. AC 4, 5, 6, 13 (live part), 14, 15 and 22 (progress announcements) hold, with the mocked API.
  2. A request log in the smoke report shows at most 2 concurrent `/api/snapshot` requests at any time.
  3. Cancel stops further requests within one in-flight response. A new submission aborts the previous run (no stale markers).
  4. Every state screenshot is polished: correct copy, no layout jump larger than the status line, and axe clean.
  5. Samples remain the default first view. Visiting `/` never calls `/api/*`.
- **Verifier:** SV + screenshots `live-loading-desktop.png`, `live-loading-mobile.png`, `live-success-desktop.png`, `live-empty-desktop.png`, `live-no-meaningful-desktop.png`, `live-error-ratelimited-desktop.png`, `live-error-excluded-desktop.png`, `live-partial-desktop.png`, `live-invalid-url-desktop.png`, `live-loading-desktop-reduced.png`. Optionally run one end-to-end check against `pnpm preview` with the Worker and a fake upstream. Not required, since the Archive is unreachable from this box.
- **Risks:** live behaviour against the real IA can only be verified after deploy (documented as a post-deploy check in phase 14). Race conditions in progressive updates (reducer + run id guard). About 400 lines.

### Phase 11: AI one-line summaries (Workers AI, batched, cached, with fallback)

- **Branch:** `phase-11-ai-summaries`
- **Specialist:** `diff-analyst` (prompt, record, validation), with UI wiring in the same PR; `a11y-reviewer` reviews the label UI
- **Goal:** the lean-AI layer. One cached call per batch of meaningful changes; rule summaries everywhere else.
- **Scope:** `wrangler.jsonc` adds `ai: {binding: "AI"}` and `ratelimits` `AI_LIMIT` (D11 if login is demanded). `worker/summarise.ts` (prompt v1 from section 5.5, batch <= 8, parse `<n>. text` lines, validate, per-item fallback, KV cache per pair, daily approximate cap), `worker/routes/summaries.ts` (`POST`, body schema validation, max 8 pairs, loads extracted pages from KV, recomputes records with `src/core`), health reports `ai: "available" | "unavailable"`, `src/app/live/useSummaries.ts` (batches after the run or every 4 meaningful changes; swaps in AI text without moving focus; no live-region chatter), a summary source label component ("AI summary" / "auto summary" with an explanatory tooltip and text), `scripts/bake-sample-summaries.ts` (optional; REST API with `.dev.vars` credentials; no-op with instructions when absent), and `.dev.vars.example` documenting `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (recorder/baker only; the Worker needs none). Tests with a fake `AI` binding: batching, caching (second call = 0 AI invocations), prompt size limits (AC 10), invalid output → per-item fallback, AI throw → all rule, missing binding → all rule, endpoint rejects pairs not in KV with `source: 'rule'` (no upstream fetch triggered).
- **Acceptance criteria:**
  1. AC 9, 10 and 11 hold (unit tests + smoke with mocked `/api/summaries` returning AI text, and a variant returning 500 → rule summaries remain, no error UI).
  2. The model is only reachable through `worker/summarise.ts` (`grep -rn "env.AI" worker src` shows that file only).
  3. Samples stay offline and keyless. Fixtures without baked summaries show "auto summary".
  4. If no Cloudflare credentials are available, the main agent lists "Workers AI token for baking sample summaries (optional)" under blockers in STATUS.md as non-blocking.
- **Verifier:** SV + screenshots `summary-ai-desktop.png`, `summary-fallback-desktop.png`, `summary-label-mobile.png`, plus a `curl` of `/api/health` from `pnpm preview` showing `ai: "unavailable"` locally without login.
- **Risks:** small-model output drift (strict validation + fallback). The AI binding forcing remote mode in dev (D11 mitigation). Cost abuse (server-side records, per-IP limit, daily cap, cache). About 380 lines.

### Phase 12: open-source packaging (docs, community, quality signals)

- **Branch:** `phase-12-oss-packaging`
- **Specialist:** `implementer`
- **Goal:** make the repo welcoming and credible: a README that sells in 10 seconds, plus contribution scaffolding and extension docs.
- **Scope:**
  - `README.md` rewrite: a one-line pitch ("See how any web page changed over the years: a scrubbable timeline of meaningful edits from the Internet Archive."), the hero screenshot (`docs/hero.png`, the best timeline + diff screenshot from phase 8/11, re-captured by the smoke flow `hero`), badges as plain text (licence MIT, "no API key needed"), a **Live demo: _coming soon_** placeholder link, "Try it in 10 seconds" (open the demo; or `pnpm i && pnpm dev`), features, "How it works" (a 6-step pipeline diagram in text/mermaid plus "where AI is used, and where it isn't"), being kind to the Internet Archive, accessibility statement, roadmap, credits (Internet Archive, Arquivo.pt, sample licences, Fraunces OFL), and licence.
  - `CONTRIBUTING.md` (setup with the pnpm-managed Node, scripts, the RAM-friendly test tips, coding conventions, the "tests never hit the network" rule, how to add an eval case, PR checklist), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, verbatim; contact: the maintainers via GitHub private contact on `geekplux/wayback-diff`), `SECURITY.md` (short; private reporting), `.github/ISSUE_TEMPLATE/{bug_report.yml, feature_request.yml, sample_suggestion.yml, config.yml}`, `.github/pull_request_template.md` (nothing under `.github/workflows/`), `CHANGELOG.md` (Keep a Changelog; `0.1.0 - Unreleased` summarising phases 1-12).
  - `docs/EXTENDING.md`: add a built-in sample (config entry + `pnpm record:samples --only <id>` + licence check), swap the summariser (the `Summariser` interface, a no-AI build, another Workers AI model), tune significance (normalisation rules + eval set workflow), add an archive source (archive descriptor), and theme tokens.
  - `docs/GOOD_FIRST_ISSUES.md`: 8-10 scoped candidates, for example a Markdown export of the change list, side-by-side diff mode, a "jump to year" input, more normalisation rules (e.g. weekday names), a sample suggestion, a translated UI string table, a print stylesheet, and a `?n=` capture-count option.
  - `ci/github-workflow.yml` gains `pnpm size` and an optional smoke job. STATUS follow-up: move it to `.github/workflows/` when the token has workflow scope.
- **Acceptance criteria:**
  1. The README's first screen (rendered on GitHub) has the pitch, hero image and "try it" path. Every README link resolves to an existing file or anchor (a small link check in `scripts/check-docs.ts`, run in tests).
  2. All listed files exist. Templates are valid YAML issue forms (parsed in a test).
  3. No employer mention, nothing finance-related, no `.github/workflows/`.
  4. The app is unchanged (smoke regression).
- **Verifier:** SV + render README to HTML locally (or inspect raw) and screenshot `readme-preview.png` via the smoke tool's static-file flow. Review prose for accuracy against the implemented behaviour.
- **Risks:** the README overclaiming (verifier cross-checks every feature claim). About 400 lines, excluding the verbatim Code of Conduct.

### Phase 13: showcase and launch kit

- **Branch:** `phase-13-showcase-launch`
- **Specialist:** `implementer`
- **Goal:** the assets that make people share it: a social preview image, an examples gallery and a launch kit. Nothing is posted anywhere.
- **Scope:** `assets/social-preview.svg` (1280×640: wordmark, logo, the tagline, and a stylised seismograph timeline in the brand palette, flat 2D) → `assets/social-preview.png` via `scripts/render-social.ts` (renders the SVG with the existing playwright-core + system Chrome; no new dependency; kills the browser in `finally`). Optional `docs/hero.gif` only if `ffmpeg` is available (otherwise skipped and noted). `examples/README.md`: a gallery of the 3 samples (screenshot, what to look for, deep link with `?sample=…&change=…`) plus 5 "try these" URLs with what makes each interesting. Use non-commercial, non-finance pages: a Wikipedia article on a historic event, a W3C or WHATWG page, an open-source project homepage, a public-domain library or museum page, a classic personal homepage of a web pioneer. `examples/*.png` thumbnails. `docs/LAUNCH.md` with: a Show HN title + post draft (about 150 words, honest about limits and the Archive's politeness), an X post draft (<= 280 characters), 3 demo scenarios (the fact-checker "when did this wording change", the retrospective "our homepage over 10 years", the standards-history "how a spec FAQ evolved"), a comparison table against alternatives (the Wayback Machine's own Changes feature, change-monitoring services such as Visualping or changedetection.io (future-only monitoring, need setup), manual tab-by-tab diffing, Wikipedia page history (wiki-only)), and a "what we deliberately don't do" list. `docs/LAUNCH.md` states clearly at the top: "Drafts only. Nothing has been posted."
- **Acceptance criteria:**
  1. `assets/social-preview.png` exists at 1280×640, < 1 MB, legible at 50% size, and its text passes AA contrast.
  2. Every gallery deep link opens the stated change (smoke flow `examples-deeplinks` iterates them).
  3. LAUNCH.md has all 4 required parts. The X draft is <= 280 chars (test counts it). No prices, no finance, no employer.
  4. Smoke regression passes, and the render script leaves no Chrome running.
- **Verifier:** SV + screenshot `social-preview.png` (copied into `docs/screenshots/phase-13/`) and `examples-gallery.png`. Run `ps` after `render-social`.
- **Risks:** the comparison being unfair or inaccurate about other tools (keep it factual and neutral, with no claims about their internals). About 300 lines + images.

### Phase 14: Cloudflare deployment preparation (STOP for Sean's approval)

- **Branch:** `phase-14-deploy`
- **Specialist:** `implementer`
- **Goal:** everything ready to deploy with one command. Dry run only, **never deploy**.
- **Scope:** finalise `wrangler.jsonc` (`workers_dev: true`, `preview_urls: false`, observability, KV id placeholder comment, AI and rate-limit bindings, `compatibility_date` refreshed), `public/_headers` (CSP `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, long cache for hashed assets), and `package.json` scripts: **`"check:deploy": "wrangler deploy --dry-run --outdir .wrangler/dry-run"`** (exactly) and `"deploy": "pnpm build && wrangler deploy"` (defined for Sean's use; agents never run it, and settings deny it). `docs/DEPLOY.md`: prerequisites (`wrangler login`; `wrangler kv namespace create CACHE` and paste the id; Workers AI enabled on the account; note on Workers Paid if extraction CPU exceeds the free tier per phase 9 measurement), the **exact deploy command** `pnpm build && pnpm exec wrangler deploy` (equivalent to `pnpm run deploy`), post-deploy checks (`curl https://<name>.<subdomain>.workers.dev/api/health`; open the site; run one live URL; confirm KV cache hits on the second run), rollback (`pnpm exec wrangler rollback`), and costs and limits to watch. README live-demo placeholder instructions. CHANGELOG entry.
- **Acceptance criteria:**
  1. `pnpm build && pnpm run check:deploy` succeeds and writes `.wrangler/dry-run/`. The report includes the bundle size and the listed bindings.
  2. `pnpm preview` serves the app with `_headers` applied (curl `-I` shows the CSP), and the sample works under the CSP with no console CSP violations.
  3. No deploy command was executed (verifier checks shell history in its own session and that `.wrangler/deploy` contains no published state; the settings deny-list is unchanged).
  4. The PR description contains the exact deploy command and a "Awaiting Sean's approval to deploy" section. The main agent sets STATUS.md to `STATE: DONE` with the note "awaiting Sean's approval to deploy".
- **Verifier:** SV + `check:deploy` output + `curl -I` headers + regression screenshots `final-desktop.png`, `final-mobile.png`, `final-desktop-dark.png`.
- **Risks:** the dry run needing an account or login (if it does, record the error, document it, and do not work around it with real credentials). KV ids are placeholders until Sean creates them (documented).

---

## 7. Out of scope (for this plan)

- Monitoring or alerts for future changes (a different product; the comparison in LAUNCH.md explains this).
- Visual/pixel diffs of rendered captures, screenshots of archived pages, and image/CSS/JS diffs. Text and structure only.
- Accounts, saved collections, server-side history, analytics or tracking of users.
- Triggering Save Page Now captures (we only link to it), and bulk/site-wide crawls (`matchType=prefix/domain`).
- Archives other than the Internet Archive in live mode (arquivo.pt is used only by the recorder as a fallback, D12).
- A browser extension, CLI, npm library release, or a Claude agent skill. The anatomy bar (SKILL.md + kit + references + audit scripts + evals) is not worth meeting before the web app proves itself; it goes in the roadmap.
- Side-by-side diff mode, export (Markdown/CSV), i18n of the UI: listed as good-first-issues.
- Deploying. Sean approves and runs it.
- Anything finance-related, decorative 3D, external font or analytics CDNs.

## 8. Risks (cross-cutting)

| Risk | Impact | Mitigation |
|---|---|---|
| `web.archive.org` unreachable from the build box | can't record samples from the IA or test live mode end-to-end here | D12: record via arquivo.pt with honest provenance; all tests are offline by design; live checks listed as post-deploy steps; STATUS follow-up to re-record from the IA |
| Node 20 on the box vs tooling needing Node 22+ | toolchain won't run | D2: pnpm `use-node-version`; fallback pins recorded |
| RAM (about 2 GB free; Chrome + workerd + Vite) | OOM, flaky verifies | one browser, smoke always cleans up, `maxWorkers: 2`, no watch modes, plain-Vitest Worker tests |
| Internet Archive rate limits / outages in production | slow or failed live runs | concurrency 2, backoff, `Retry-After`, global cooldown, aggressive immutable caching, clear rate-limit UI |
| Workers free-plan CPU limit vs HTML extraction | 1102 errors on large pages | 2 MB cap, SAX parser, measured in phase 9; Workers Paid recommendation documented |
| Small-model summaries inaccurate or odd | misleading one-liners | compact factual input, strict validation, "AI summary" label, rule fallback, users always see the actual diff |
| Trivial-change heuristics wrong for some sites | noisy or empty timelines | eval set, moving baseline, "Show trivial edits" toggle, extension docs for new rules |
| Content licensing of fixture excerpts | legal or attribution issues | permissively licensed pages only (D13), attribution in fixture, UI and README |
| AI binding forcing a Cloudflare login in local dev | blocks preview/verification | D11 fallback (`env.production` AI binding) |
| Scope creep beyond about 400 lines per phase | slow reviews | each phase lists its scope; extras go to GOOD_FIRST_ISSUES.md |
| Fonts unobtainable or too heavy | identity weakens or budget blown | subset static instances; documented system-serif fallback |
