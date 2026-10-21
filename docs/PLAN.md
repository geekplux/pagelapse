# Pagelapse: plan

Planner: `planner` sub-agent. First written 2026-10-19 under the working name wayback-diff; revised 2026-10-20 for Sean's change request (rename to **Pagelapse**, repo `geekplux/pagelapse`, and a visual pane that shows what the page looked like at each capture); revised again 2026-10-21 for Sean's design direction (a calmer layout with one focal point per view: the "Calm layout" rules in section 4, AC 49, and a dedicated polish phase 17 that moves OSS packaging, showcase and deploy to phases 18-20). This plan follows `CLAUDE.md`, which takes precedence wherever the two disagree. Open technical decisions are collected in section 5.9, each with a recommendation, for the main agent to record in `docs/DECISIONS.md`. The local folder stays `/workspace/gx-projects/wayback-diff`.

Environment facts checked while planning. Several phases depend on them:

- The box has Node **20.19.2** and pnpm 9.15.9. Current Vitest (5.x) needs Node >= 22.12, and wrangler (4.151) needs Node >= 22. Phase 1 therefore pins the Node version through pnpm (`use-node-version`, see D2). nodejs.org is reachable.
- Current versions: vite 8.3 (Rolldown-based), vitest 5.0, oxlint 1.89, typescript 7.0 (native `tsc`), react 19.3, @vitejs/plugin-react 6.1, @cloudflare/vite-plugin 1.64 (peer: vite ^6/^7/^8 and wrangler ^4.151), wrangler 4.151, playwright-core 1.64, axe-core 4.14, htmlparser2 12.
- **`web.archive.org` cannot be reached from this box.** The TLS handshake through the egress proxy fails, and WebFetch is blocked too. `archive.org` is reachable, and so is **arquivo.pt**, a pywb-based public web archive with a compatible CDX API, `id_` raw replay and full `mp_` page replay. This is why samples (text and pictures) are recorded from arquivo.pt (D12, D20). The live product still targets the Internet Archive. It runs on Cloudflare and in the user's browser, where the IA is reachable.
- `/usr/bin/google-chrome` (155) exists. `ffmpeg` exists (used for the README hero GIF, phase 19). Python Pillow has WebP and AVIF codecs, but the plan does not depend on it (D21).
- **Visual feasibility test (2026-10-20, two polite loads of one capture, `git-scm.com` 2018-07-16, files deleted afterwards):**
  - System Chrome via playwright-core can render an arquivo.pt replay and take a screenshot.
  - The document committed in 0.66 s. Subresources (CSS, images, JS) are served by arquivo.pt. About 80 requests went to arquivo.pt for this one page, and 11 stylesheets applied.
  - The page still referenced two **live-web** hosts (`fonts.googleapis.com`, `www.googletagmanager.com`). The recorder must block every non-archive host. That keeps the picture faithful to the archive and avoids leaking requests to the live web.
  - The `load` event never fired within 20 s, so the recorder needs a "network quiet or hard cap" wait, not `waitUntil: 'load'`.
  - Loading the `…<ts>if_/<url>` (or `mp_`) URL as a top-level page triggers pywb's **top-frame redirect**: `if (window == window.top) location = wbinfo.top_url`. That redirect adds arquivo.pt's own chrome (a header bar and a year sidebar) around the page. The fix is to load the `mp_` URL inside an `<iframe>` of a local harness page. There, `window != window.top`, so no redirect happens, and the frame shows the bare archived page at a clean 1280×800 viewport (D20). This is also exactly how the live pane embeds the Internet Archive's `if_` replay.
  - Encoded sizes of that screenshot:

    | Size | WebP q60 | WebP q72 | AVIF q50 |
    |---|---|---|---|
    | 1280×800 | 49 KB | 57 KB | 36 KB |
    | 960×600 | 32-34 KB | 37-39 KB | 29-31 KB |
    | 640×400 | 16-17 KB | | |
    | 320×200 | 4 KB | 5 KB | |
    | 240×150 | 3 KB | | |

    These sizes drive the image budget in D21 and AC 40.

---

## 1. User first

### Who reaches for this

1. **The fact-checker or journalist.** Maya covers public institutions. A reader says an organisation "quietly rewrote" its mission page. She needs to know *when* the wording changed and *what* it said before, with links to the archived captures she can cite. A picture of the page as it looked then makes the story land. Today she clicks through dozens of Wayback captures and diffs them by eye.
2. **The researcher, student or digital historian.** Tomas writes about how open-source projects present themselves. He wants to *watch* a project homepage evolve over ten years (the redesigns, the new taglines, the sections that appeared and disappeared) without opening 300 near-identical captures.
3. **The maintainer or writer doing a retrospective.** Priya is writing her project's ten-year anniversary post. She wants "what did our homepage look like and say in 2014, and when did we start calling it X?" in a minute, plus a before/after image she can describe in the post.
4. **The curious web person.** Someone sees the link on Hacker News, clicks it, and wants to be impressed within seconds, without installing anything, signing up, or pasting a key. Watching a familiar page morph through a decade is the moment they share.

### The moment

"I remember this page used to look and say something different. When did it change, and what changed?" That question is the trigger. The Wayback Machine has the data but answers in captures, not changes. Pagelapse answers in changes, and lets you *see* them: a time-lapse of a web page.

### Fastest path to the first "wow" (zero install, no account, no key, no network)

The first 30 seconds. The default sample is expected to be **git-scm.com** (D23; final pick in phase 10 from the recorder's visual-delta report):

| Time | What the user sees or does |
|---|---|
| 0 s | Opens the site. The hero is already a **picture of a real web page**: the git-scm.com home page as archived, split by a before/after slider on the sample's featured change. One side shows the old design and the other the redesign, labelled "− Before 2025·04·04" and "+ After 2025·12·18". Below it sit the seismograph timeline and a filmstrip contact sheet of 14 thumbnails, a decade of looks at a glance. The one-line summary and stats are beside the picture. Everything is pre-recorded, ships with the app, and renders offline with zero non-same-origin requests. Nothing is spinning. |
| 3 s | They drag the slider handle across the page, or focus it and press the arrow keys. The old design wipes into the new. |
| 8 s | They press **Play**, or scrub the timeline or filmstrip with the arrow keys. The page steps through its decade one capture at a time. The mono date ticks (`2013·11·06 → … → 2025·12·18`), the selected frame moves along the filmstrip, and the summary line updates. |
| 15 s | They pick the largest marker. Below the picture, the diff shows the text that changed: `+` and `−` passages with underline and strikethrough. They try **Side by side** or **Onion skin**. |
| 20 s | They switch sample chips (Wikipedia "Internet Archive", rust-lang.org). Each renders instantly with its own pictures. |
| 25 s | They paste their own URL into the single input ("example.org/about" works without a scheme) and press Enter. The live run starts: "Fetching capture 3 of 16 · we go slowly to be kind to the Internet Archive". Markers and text-silhouette thumbnails appear as captures arrive. When they stop on a change, the visual pane loads that capture from the Internet Archive in a sandboxed frame, showing the silhouette while it loads. |
| 30 s+ | Rule summaries are replaced by AI one-liners when the Worker returns them. "Copy link" produces a shareable URL (`?url=…&change=…&view=slider`). |

The cost of the first step is nothing: the sample is already rendered, pictures included, and the only other action is pasting a URL.

---

## 2. Product goal

Pagelapse turns the Internet Archive's raw captures of any web page into a short, scrubbable time-lapse of how that page changed, both in how it **looked** and in what it **said**. Given a URL, it fetches a sampled set of captures from the Wayback Machine, slowly and with aggressive caching. It extracts each page's readable text and outline, diffs consecutive captures, and discards trivial edits (dates, counters, whitespace, tracking parameters). It lays the meaningful changes out on a timeline whose markers are sized by change magnitude, with a visual pane that shows the page itself at the selected capture. That pane is either the archive's own replay in a sandboxed frame, or pre-recorded screenshots for the built-in samples. Changes can be compared side by side, with a before/after slider, or as an onion skin. Each change gets an inline text diff marked with symbols and text styles (never colour alone) and a one-line summary. Summaries come from deterministic rules first, with a small Workers AI model where it helps, all cached. The first view costs nothing: built-in samples, pictures included, render instantly, offline and without any key. The project is MIT-licensed open source, built to be starred, shared and extended.

**Value, then convenience.** The user gets "when, what and how it looked" for any page in about a minute instead of an afternoon of clicking through captures. Every feature below either shortens that path (samples, paste-a-URL, keyboard scrubbing, filmstrip, Play, summaries, deep links) or makes the answer trustworthy: links to the exact captures, visible trivial-change filtering, honest "AI" and "auto" labels on summaries, and honest "missing styles", "slow" and "no picture" states. Anything that does neither is out of scope.

---

## 3. Product acceptance criteria

Each criterion is testable. "Verified by" names the mechanism (U = Vitest unit test, S = headless-browser smoke flow, M = manual or verifier inspection, C = command output). Numbers 1-37 are unchanged in meaning except where marked *(rev)*. Numbers 38-48 were added on 2026-10-20 and 49 on 2026-10-21.

### Functional

1. *(rev)* On first load with no query string, the default built-in sample renders all of the following with **zero network requests to any non-same-origin host**:
   - its timeline;
   - the visual pane on its **featured change** (falling back to the latest meaningful change), in Slider mode, with both pictures;
   - the filmstrip;
   - the summary;
   - the diff.

   (S: smoke blocks and counts non-localhost requests and asserts 0.)
2. 2-3 built-in samples are selectable from the header. Switching samples needs no network beyond same-origin static files and renders within 300 ms on the verifier's desktop profile (S).
3. *(rev)* Every sample fixture is real recorded data from a public web archive. Its provenance is stored in the fixture and shown in the UI footer (U + S). For text, that is the archive, recording date, recorder version, content licence and attribution. For screenshots, it is the archive, recording date, viewport and any redaction note.
4. The URL input accepts `https://…`, `http://…` and bare hosts or paths (`example.org/about`). It rejects non-http(s) schemes, credentials in URLs, IP-literal hosts and empty input, with an inline, programmatically associated error message (U + S).
5. Submitting a URL starts a live run: one captures request (CDX, collapsed monthly and by digest), at most **N = 16 captures by default (hard maximum 24)**, sampled across the full time range with preference for captures whose size changed. Captures are fetched with **at most 2 in flight** from the browser, through the Worker (U + S with mocked API).
6. Captures appear on the timeline progressively, and the run can be cancelled. Starting a new run aborts the previous one (S with mocked API).
7. Consecutive captures are diffed at block level and word level. The baseline for the next comparison is the last *meaningful* capture, so slow drift still surfaces (U).
8. Changes consisting only of whitespace, date/time strings, counters, copyright-year bumps or tracking parameters are classified as **trivial**. They are not shown as change markers but are counted ("9 trivial captures hidden") and visible as hollow ticks (U: eval set, 100% of must-drop cases dropped, >= 90% agreement overall).
9. Each meaningful change shows a one-line summary. A deterministic rule summary is always available instantly. When Workers AI is available, an AI summary replaces it and is labelled "AI summary" (text label, not just an icon). Rule summaries are labelled "auto summary" (U + S).
10. AI is called **only** for summaries of meaningful changes, **at most once per snapshot pair ever** (KV-cached by pair key), batched at <= 8 changes per call. The model input is a compact change record (<= 1,200 characters per change, <= 10,000 per batch), never a whole page and never an image (U).
11. If Workers AI is unavailable (local dev, no binding, error, rate limit), the app keeps working with rule summaries and shows no error to the user (U + S).
12. *(rev)* Every change in the diff view and every picture in the visual pane links to its archived capture (`https://web.archive.org/web/<ts>/<url>`, or the recording archive for samples) (S).
13. *(rev)* Deep links work. `?sample=<id>&change=<from>-<to>` and `?url=<encoded>&change=<from>-<to>` restore the same view, plus the optional `&view=single|side|slider|onion` and `&at=<ts>` (the capture shown in Single mode). "Copy link" copies the current view (S).
14. Error states are specific and actionable: invalid URL, no captures, site excluded from the Archive, Archive rate-limited (with retry time), Archive unavailable, partial capture failures (dashed markers, run continues), and app rate limit. Each offers "Try again" and "Open a sample" (S with mocked API).
15. Empty states: "no captures yet" (with a link to the Archive's Save Page Now) and "no meaningful changes across N captures" (shows the trivial count) (S).

### Politeness to the Internet Archive (and to the recording archive)

16. *(rev)* All upstream requests from the Worker and the recorders carry `User-Agent: pagelapse/<version> (+https://github.com/geekplux/pagelapse)`. The screenshot recorder uses Chrome's own UA with ` pagelapse-recorder/<version> (+https://github.com/geekplux/pagelapse)` appended (U).
17. Upstream retries happen only on 429/502/503/504 or network errors: at most 3 attempts with exponential backoff (1 s, 2 s, 4 s, plus or minus 20% jitter), honouring `Retry-After` up to 30 s. A longer `Retry-After` is surfaced to the user rather than waited out. A 429 from the IA puts the Worker into a 60 s global cooldown (KV flag) during which no uncached upstream requests are made (U).
18. CDX results are cached for 24 h. Extracted captures, which are immutable, are cached indefinitely under versioned keys. A repeated run for the same URL makes **zero** upstream requests from the Worker (U).
19. Raw HTML is never stored. Only extracted text and outline are, capped at 2 MB fetched HTML and 30,000 characters or 400 blocks extracted per capture (U).
20. *(rev)* Tests and CI never touch the live network. The two recorders (`record:samples`, `record:visuals`) are the only code that does. They are never run by tests and run at concurrency 1. The text recorder spaces requests >= 1.5 s apart. The visual recorder spaces page loads >= 5 s apart, blocks every non-archive host and heavy non-visual assets (media, the Ruffle Flash emulator), and reuses a persistent disk cache, so a re-run fetches nothing new (U + M).

### Accessibility

21. Keyboard: the timeline is a single tab stop with `role="slider"`. Left/Right move to the previous or next meaningful change, Home/End go to the first or last, and PageUp/PageDown jump about a year. Every control is reachable in a logical order with a visible focus indicator (>= 3:1 against adjacent colours). A "Skip to diff" link exists (S: keyboard-only flow).
22. Screen readers: the slider has `aria-valuetext` such as "Change 4 of 11: 17 March 2014 to 2 June 2016, major: Added section 'Downloads'". The changes list (an ordered list of buttons with `aria-current`) is a full text alternative to the SVG timeline. Diff blocks carry visually hidden "Added:" / "Removed:" / "Changed:" prefixes in addition to `<ins>`/`<del>`. Live-run progress is announced through a polite live region throttled to at most one update per 2 s (S + M with the a11y-reviewer).
23. Never colour alone. Additions use a `+` gutter symbol and underline, removals use `−` and strikethrough, modified blocks use `~`. Magnitude is shown by marker size, ramp lightness *and* a word ("minor / moderate / major"). Trivial captures are hollow ticks, failed captures are dashed. Before/after pictures are labelled with text plus `−`/`+` symbols (M + S: greyscale screenshot remains fully readable).
24. The palette passes CVD checks. Added and removed colours stay distinguishable under simulated protanopia, deuteranopia and tritanopia (Machado 2009, OKLab ΔE×100 >= 8), and the magnitude ramp is monotone in lightness (U: `palette.test.ts`; S: CVD-simulated screenshots).
25. Contrast meets WCAG 2.2 AA: text >= 4.5:1 (large text >= 3:1) and UI component boundaries and graphics >= 3:1, in light and dark themes. Overlays drawn on top of screenshots (divider, handle, labels) carry their own `--card` backing or halo, so they meet 3:1 / 4.5:1 regardless of the image underneath (U: contrast pairs test; S: axe).
26. *(rev)* `prefers-reduced-motion: reduce` disables all transitions, staggered reveals, picture cross-fades and smooth scrolling. Play still steps on user request, but swaps frames instantly. Nothing flashes, and nothing auto-plays (S: reduced-motion screenshot + computed-style check).
27. axe-core reports 0 serious or critical violations on every screen and state (S).
28. Layout reflows at 320 CSS px wide and at 200% zoom without loss of content. Only the timeline and the filmstrip may scroll horizontally, and only inside their own containers. Pointer targets are >= 24×24 CSS px (S).
29. Forced-colors mode keeps `ins`/`del` styling, focus rings, markers, the slider divider and the filmstrip selection visible (`@media (forced-colors: active)` rules) (M).

### Performance and footprint

30. *(rev)* Budgets (C: `pnpm size` fails the build when over budget):
    - initial JS <= 100 KB gzip;
    - CSS <= 15 KB gzip;
    - self-hosted fonts <= 60 KB total;
    - default sample text payload <= 40 KB gzip;
    - image budgets per AC 40.
31. On the verifier's desktop profile (localhost preview, no throttling), time from navigation to "default sample timeline rendered" (`data-ready="true"`) is <= 1,000 ms (S measures and reports it).
31b. *(new)* On the same profile, time to `data-visual-ready="true"` (both hero pictures of the featured change decoded) is <= 1,500 ms. Hero pictures have explicit `width`/`height`, so there is no layout shift (CLS < 0.02 measured via `PerformanceObserver`) (S).
32. Runtime dependencies: the browser bundle ships only `react` and `react-dom`, and the Worker adds only `htmlparser2`. Any further runtime dependency needs a DECISIONS.md entry. `htmlparser2` must not appear in the client bundle (C: size script checks chunk contents).
33. Diffing two 2,000-block pages takes < 100 ms in Node. A pathological diff hits the edit-distance cutoff and degrades to block replacement instead of hanging (U).

### Offline samples, no-key operation and code quality

34. `pnpm build && pnpm preview` with no `.dev.vars`, no Cloudflare login and no network to the Archive serves a fully working sample experience, pictures included (S).
35. No secrets are in git. `.dev.vars` is gitignored, and `.dev.vars.example` documents optional keys (C: grep).
36. The core pipeline (`src/core/`) is a typed public API with TSDoc on every export, has no DOM or network access, and is shared unchanged by the browser, the Worker and the recorder (C: `tsc`; U).
37. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all pass on every phase branch. The CI definition lives in `ci/github-workflow.yml`, not `.github/workflows/` (C).

### Visual pane ("see the page itself"): new

38. The visual pane is synced to the selection. Changing the selection by timeline, changes list, filmstrip, Prev/Next or Play updates the pane. For samples, the new picture is shown in the next frame when already decoded, else its thumbnail is shown scaled up until the full picture decodes (S).
39. Built-in samples have pre-recorded pictures. Every sampled capture of every sample (41 today: 14 + 14 + 13) has a committed full picture and thumbnail recorded with headless Chrome from a public archive replay, or a `failed` status with a reason. Pictures are served same-origin from `public/samples/<id>/`. The fixture records per-capture status and the recording provenance (U + S).
40. Image budget (C: `pnpm size` + U: samples test):
    - each full picture (960×600 WebP) <= 64 KB;
    - each thumbnail (320×200 WebP) <= 8 KB;
    - all sample pictures together <= **2.2 MB**;
    - pictures needed for the first view (2 hero + the visible thumbnails) <= 160 KB.
41. Filmstrip:
    - one thumbnail per sampled capture, in chronological order, each with a mono date and a frame number (`#01`);
    - a single tab stop, with roving focus on Left/Right/Home/End and activation with Enter/Space;
    - the selected item has `aria-current="true"` and a thick outline plus a caret, not colour alone;
    - trivial captures show a hollow tick and the word "trivial";
    - captures with no picture have a dashed frame and the text "no picture" (S + M).
42. Compare modes:
    - **Single** (with a Before/After toggle), **Side by side**, **Slider** and **Onion skin**, chosen through a labelled radio group;
    - the slider handle is a `role="slider"` (0-100, `aria-valuetext` "40% before (2013), 60% after (2025)"): Left/Right ±5, PageUp/PageDown ±25, Home/End, plus pointer drag with a hit area >= 32 px;
    - onion skin is a native range "After opacity" (0-100, step 5) with a "Swap" button;
    - Before/After are always labelled in text with `−`/`+` symbols and mono dates;
    - the chosen mode persists across selection changes and in the URL (S).
43. Play steps through the captures in Single mode, once per 1.2 s:
    - it never starts on its own;
    - it stops at the last capture, on Pause, or on any key press or pointer down elsewhere;
    - the button is `aria-pressed`, labelled "Play time-lapse" / "Pause";
    - reduced motion swaps frames instantly;
    - no live-region chatter while playing (S).
44. Honest states:
    - **Samples:**
      - captures recorded with missing stylesheets or images show a text badge, "The archive's copy is missing some styles or images";
      - captures with no picture show a hatched card, "No picture of this capture", plus "Open capture ↗".
    - **Live:**
      - while a frame loads, its text silhouette is shown;
      - after 8 s the pane says "Still loading from the Internet Archive. Archived pages can be slow, and some sites block being shown in a frame." with "Open capture ↗".
    - The pane never claims success or failure it cannot observe from a cross-origin frame (S).
45. Live replay frames (S with a stubbed replay route and request log):
    - URL: `https://web.archive.org/web/<ts>if_/<url>`.
    - Attributes: `sandbox="allow-scripts allow-same-origin"` (no top navigation, popups or forms), `allow=""`, `referrerpolicy="strict-origin-when-cross-origin"`, and a `title`.
    - A frame loads only after the selection rests for 400 ms; fast scrubbing loads only the final selection.
    - At most 3 frames are mounted (selected + one neighbour each side). Neighbours preload only after the selected frame has loaded and the selection has rested 2 s, one at a time, and never with Save-Data.
    - No request goes to `web.archive.org` before the user starts a live run.
46. Live filmstrip thumbnails are **text silhouettes** rendered locally from the extracted page (title, headings and paragraph bars). They make no image or frame requests (S).
47. Visual accessibility (S + a11y-reviewer):
    - every picture has alt text naming the site, the long-form date and "top of page";
    - every frame has a title;
    - every compare control works from the keyboard;
    - greyscale and CVD screenshots of each mode are unambiguous;
    - axe is clean;
    - in compare modes, frames are `inert`, so focus never gets trapped inside an archived page.
48. Pictures are shown **only** for captures. No AI looks at pictures, and no image leaves the user's browser or the static asset store (U: grep `env.AI` limited to `worker/summarise.ts`; M).

### Calm layout: new (2026-10-21)

49. Every view follows the "Calm layout" rules in section 4 (from phase 17 on):
    - each view has exactly one focal point, as listed in the per-view table;
    - on first load, the first viewport stays within the caps (regions, tab stops, framed boxes, eyebrow labels, solid accent fills) at 1440×900 and 390×844;
    - spacing in CSS uses only the six `--space-*` tokens;
    - there is one accent;
    - everything folded behind a disclosure stays reachable by keyboard and screen reader, and no feature is removed.

    (S: `calm-audit` and `calm-inventory` smoke flows; U: `spacing.test.ts`, `accent.test.ts`; M: verifier and a11y-reviewer judge crowding against the rules.)

---

## 4. Design direction: "the archivist's proof sheet"

The identity mixes three familiar objects: an **archival index card** (warm paper, ink, catalogue numbers), a **proofreader's marked-up galley** (insertions and deletions in the margin), and a **photographer's contact sheet** (a strip of numbered frames with the selected one circled). The timeline reads like a **seismograph strip** laid across the years: a quiet baseline with marks where the page "moved". The filmstrip beneath it is the contact sheet of the page's looks. It is specific to this product: time, archives, edits, pictures of the past. It is not a dashboard template. There is no decorative 3D, no gradients-for-gradients'-sake and no glassmorphism.

### Typography (no external font CDN at runtime)

- **Display / wordmark / section headings:** *Fraunces*, self-hosted from `public/fonts/` (SIL OFL 1.1, licence file committed alongside). Static instances are subset to Latin: `Fraunces-SemiBold.woff2` (600, opsz about 72, SOFT 50) and `Fraunces-Italic.woff2` (400 italic, wordmark only), together <= 60 KB. Use `font-display: swap` and preload the first file. Fallback stack: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`. (Built in phase 2.)
- **Reading text (diff content):** `Charter, "Bitstream Charter", "Iowan Old Style", "Sitka Text", Cambria, Georgia, serif`.
- **UI chrome:** `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`.
- **Timestamps, counts, frame numbers, code:** `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace`, with `font-variant-numeric: tabular-nums`. Dates are shown as `2014·03·17`, with a full accessible date in `<time datetime>` and as visually hidden long-form text. Frame numbers are `#01`…`#14`.
- Scale: base 16 px / line-height 1.55. Modular ratio 1.25 (12.8, 16, 20, 25, 31.25, 39 px). Diff text measure is capped at 72ch.

### Colour (CSS custom properties; `src/design/palette.ts` is the source of truth, mirrored in `src/design/tokens.css`)

| Token | Light | Dark | Use / check |
|---|---|---|---|
| `--paper` | `#F6F1E7` | `#14120F` | page background |
| `--card` | `#FFFDF8` | `#1D1A16` | panels, diff surface, picture mat, overlay label backing |
| `--ink` | `#1F1B16` | `#EDE6D9` | primary text: 15.2:1 / 15.1:1; slider divider; selected-frame outline |
| `--ink-2` | `#5C5346` | `#A89F90` | secondary text: 6.7:1 on paper / 6.6:1 on card |
| `--rule` | `#D9CFBF` | `#3A342C` | decorative hairlines only; hatch lines of "no picture" cards |
| `--rule-strong` | `#8A7F6E` | `#71685A` | input borders, chip outlines, axis, picture mat border, filmstrip frames: >= 3:1 (see phase 2 decision) |
| `--added` | `#1F5FB0` | `#7FB0EE` | `+` symbol, underline, "added" text, "+ After" label symbol |
| `--added-tint` | `#E3EDFA` | `#1E2A3D` | added block background (lighter or gutter-only variant decided in phase 12 polish) |
| `--removed` | `#B4441A` | `#E8895A` | `−` symbol, strike line, "− Before" label symbol |
| `--removed-tint` | `#FBE6DA` | `#3A2318` | removed block background |
| `--mag-1..4` | `#9C8558 #85693F #5E4826 #3A2A14` | `#7D6946 #957A50 #BFA272 #E6CFA0` | sepia magnitude ramp for markers (single hue, monotone L, every step >= 3:1 vs card and paper) |
| `--mark-plus` / `--mark-minus` | `#7FB0EE` / `#E8895A` | `#1F5FB0` / `#B4441A` | logo accents on its `--ink` tile only |
| focus ring | 2 px `--card` gap + 2 px `--ink` ring | same | colour-agnostic double ring, >= 3:1 everywhere, including over pictures |

How it stays CVD-safe and never colour-alone:

- Added and removed are a **blue/vermillion** pair. Validated with the dataviz palette validator (Machado 2009 simulation): light ΔE×100 22.4 (protan), tritan 28.2, normal 28.6. Dark pair: ΔE 20.5 (protan), tritan 26.3. In dark mode these hues are text and symbol colours. If they are ever used as filled chart marks in dark mode, use the band-safe variants `#5E95D6` / `#D46E3A`.
- Hue is always the *secondary* channel. Primary encodings are:
  - the gutter symbols `+` / `−` / `~`;
  - `<ins>` underline versus `<del>` line-through;
  - the visually hidden text prefixes;
  - marker size and shape;
  - the magnitude word;
  - for pictures, the text labels "− Before" / "+ After" with mono dates, and the filmstrip outline + caret + `aria-current` for the selected frame.
- **Pictures are never recoloured.** Screenshots are shown as recorded. All overlays (divider, handle, labels, badges) sit on `--card` backings or a 2 px `--card` halo, so their contrast never depends on the archived page's colours.
- `palette.test.ts` re-computes all contrast pairs and CVD separations in CI. The smoke script captures protan, deutan, tritan and greyscale screenshots for every visualisation phase.

### Layout (the visual scrub is the hero)

*Rewritten in phase 17 to match what ships; "Calm layout" below has the rules and the caps.*

- **One measure:** header, content and footer share `min(100% − 2 × gutter, 84rem)`, with 16 px gutters on phones and 40 px from 640 px. No card or sheet frames the content: it sits on `--paper`, grouped by space and alignment.
- **Desktop (≥ 960 px):**
  - **Header (one row, wrapping when narrow):** the wordmark, the URL form (a quiet sentence-case label "See how any page changed" above the input and the solid-ink "Show changes"), then the sample toggles ("Try git-scm.com · Wikipedia: Internet Archive · rust-lang.org" as quiet text buttons).
  - **Hero:** the title (Fraunces 25 px) with one mono meta line (`14 captures · 2013–2025`), then two columns, 2 : 1 with a 40 px gap.
    - **Left (about two thirds): the picture** in its 16:10 mat (`--card`, 1 px `--rule-strong`, 8 px padding), Slider by default, with a one-line caption inside the mat: frame number(s), the date in Single, "Open capture ↗" in Single (one per print in Side by side), and the honest badges. At 1440×900 it is 869 px wide (60%) with its top at 170 px.
    - **Right: the selected change.** The change line (magnitude glyph and word, both dates, the summary in Charter 20 px with its quiet source label) top-aligned with the picture, and one controls row whose bottom edge meets the picture's: Play, `‹ Previous · 9 / 9 · Next ›`, "Compare: Slider ▾" (and the roving `− Before | + After` pair in Single), then "Change details ▸".
    - Side by side needs the width: there the two prints span both columns and the selected change follows below them.
  - **Scrub strip (24 px below the hero; it is part of the focal point):** for a live run, the status line with its counter, a determinate bar and Cancel, as the strip's caption; then the filmstrip (thumbnails, the selected one with a 3 px ink outline on a 2 px paper gap and a caret); then the seismograph timeline; then "Key · 4 trivial hidden ▸" (the legend and "Show trivial edits").
  - **Below (40 px):** "All changes (9) ▸" and "All 14 captures ▸", then the diff panel ("What the text says, <dates>", "Structure · … ▸", "Key ▸", the 72ch diff), then the footer.
  - **Footer:** the tagline (the about line), the one-line Internet Archive credit, "About these captures ▸" (the sample's description and page link, text and picture provenance, licence, redaction and archive notes; for live runs, what a replay is), "Keyboard shortcuts ▸", and the GitHub link. It always starts below the first viewport (`main` is at least one viewport tall).
- **Phones (< 640 px):** one column in the same order: header (wordmark; form; short sample labels "git-scm · Wikipedia · Rust", each inside its full accessible name), title and meta, the picture at full width (top ≤ 280 px at 390×844), caption, change line, the controls row (Play and Previous / Next on one line), the scrub strip, the folded lists, the diff. Previous / Next sticks to the bottom of the screen only once its row has scrolled away above (its slot keeps its size, so nothing moves), and `scroll-padding-bottom` keeps focus clear of it. Side by side stacks Before above After.
- **640-959 px:** single column like phones, without the sticky bar.
- Pictures always keep their 16:10 box (explicit `width`/`height` and `aspect-ratio`), so nothing jumps when they load.

### Visual pane and compare modes

- **Single:** one picture (After by default). A two-button toggle `− Before | + After` (`aria-pressed`) flips sides without moving focus.
- **Side by side:** two mats with their own caption strips. At equal width on desktop; stacked on mobile.
- **Slider:** After is drawn over Before and clipped at the divider (`clip-path: inset(0 0 0 var(--split))`, set via CSSOM, which the deploy CSP allows). The divider is a 2 px `--ink` line with a 2 px `--card` halo. The handle is a 32 px `--card` circle with a `--ink` border and `‹ ›` chevrons. "− Before 2013·11·06" and "+ After 2025·12·18" labels are pinned to the top corners on `--card` chips. The handle starts at 50%.
- **Onion skin:** After is stacked on Before with the "After opacity" range (default 50%) and a "Swap" button. Labels as above.
- **Live frames** use the same modes. A 1280×800 frame is scaled into the mat with a CSS transform, so the archived page renders at desktop layout. In compare modes, frames are `inert` with `pointer-events: none`, and a note says "Comparing the top of each page". Single mode lets the user scroll the archived page.
- **Filmstrip:**
  - The selected frame has a 3 px `--ink` outline, a caret above it and `aria-current`.
  - Trivial captures are dimmed to 60% opacity *and* carry a hollow tick glyph and the word "trivial" in their caption.
  - Missing pictures are a dashed `--rule-strong` frame with "no picture".
  - The timeline tooltip shows the hovered capture's thumbnail (samples) or silhouette (live).
- **Silhouette** (live thumbnails and live loading placeholder): a deterministic sketch of the extracted page on `--card`. Title text in mono at the top, headings as thick `--ink-2` bars, paragraphs as hairline bars proportional to their length, list items as dotted bars. It reads as "a page", is honest about being derived from text, and is labelled "text outline" in its caption.

### Motion

- Selecting a change moves the selection ring in 150 ms ease-out. The diff panel and the picture cross-fade in 120 ms. On first render, markers draw in left to right with a stagger capped at 400 ms total. Live-run markers fade in as captures arrive (200 ms). The filmstrip scrolls the selected frame into view smoothly.
- The slider divider follows the pointer or keys directly (no easing). Play swaps one frame per 1.2 s with the 120 ms cross-fade.
- `prefers-reduced-motion: reduce` gives:
  - no stagger and no cross-fades;
  - instant ring moves and instant frame swaps (Play still steps on request);
  - `scroll-behavior: auto`.

  In every mode: no parallax, no looping animation, no auto-play, and nothing flashes. Play is user-started and pausable (WCAG 2.2.2). The progress indicator is a static text counter plus a determinate bar, not a spinner.

### Logo and wordmark for Pagelapse (SVG, `src/design/Logo.tsx` + `public/favicon.svg`; redesigned in phase 9)

- **Mark:** keeps the 24×24 rounded `--ink` tile and the monochrome rule.
  - Inside are two page outlines (1.5 px `--card` stroke, rounded corners). The back page is offset 3 px up and left: an earlier capture.
  - The front page is split by a vertical **before/after divider** with a small round handle at mid-height: the slider that is the product's hero.
  - Left of the divider sit two short dashed text lines in `--mark-minus`. Right of it sit two solid text lines in `--mark-plus`.
  - In monochrome and in the favicon, all strokes are `--card`, and the dashed/solid distinction carries the meaning.
  - Reading: pages over time, compared.
- **Wordmark:** `page` in Fraunces Italic immediately followed by `lapse` in Fraunces SemiBold, lowercase, no space (*page***lapse**).
  - Under `lapse` the old seismograph baseline becomes a **row of five tiny frames**: hairline rectangles of slowly increasing height, a time-lapse strip. The last frame is filled `--ink`.
  - The accessible name is "Pagelapse" (`sr-only`; the visual text is `aria-hidden`).
  - The product name in prose is always "Pagelapse". Package, Worker and UA identifiers are `pagelapse`.
- The mark and a before/after split picture are the basis of the social preview image (phase 19).

### Polished states

- **Loading (live run):** the skeleton timeline shows the full date range immediately from the CDX response, with grey hairlines at every sampled capture. Each capture turns into a marker or hollow tick (and a silhouette in the filmstrip) as it is processed. The status line reads "Fetching capture 5 of 16 (2014·03·17) · we fetch slowly to be kind to the Internet Archive", with a "Cancel" button. The diff panel shows the first finished change as soon as one exists. The visual pane shows the silhouette of the selected capture until its frame has been requested and loaded.
- **Empty:**
  - "The Archive has no captures of `example.org/about` yet.", with a "Save it now" link to `https://web.archive.org/save/<url>` and "Open a sample".
  - Or: "14 captures, 2011-2024: nothing meaningful changed. 13 trivial edits hidden (dates, counters, whitespace).", with a "Show trivial edits" toggle. The filmstrip still lets the user flip through the looks.
- **Error:** a calm card in `--card` with a heading, a one-sentence cause, and the next action. It covers:
  - invalid URL (inline at the field);
  - excluded site;
  - Archive rate limit ("The Internet Archive asked us to slow down. Try again in 40 s.", with a live countdown in text);
  - Archive unavailable;
  - our own rate limit;
  - partial failures (an inline note, "2 captures could not be fetched", plus dashed markers).

  Errors never show stack traces.
- **Picture states:** see AC 44. Badges are text on `--card` with an icon glyph (`◐` partial, `▢` no picture, `⧗` slow), never colour alone.
- Illustrations, if any, are flat 2D line art in the same ink. No decorative 3D.

### Calm layout (Sean's design direction, 2026-10-21; binding from phase 17 on)

The UI shows too much at once. These rules refine the proof-sheet concept above; they don't replace it. The same constraints still apply: CVD-safe palette, never colour alone, keyboard operable, reduced motion respected, no decorative 3D.

The planner drafted these rules; phase 17 confirmed them against its 1440/390 audit and amended a few (marked *Amended in phase 17*, listed at the end of this subsection and in DECISIONS.md), with review by the a11y-reviewer and the verifier. Keep this subsection in sync with the code. From phase 17 on, the verifier and the a11y-reviewer judge every UI phase against it, and crowding counts as a design FAIL.

**Product focal point.** The focal point is the **visual scrub**: the page itself, scrubbed along its timeline. The text diff and the compare modes are one step later.

#### 1. One focal point per view

| View | The one focal point | Visible but secondary (smaller, `--ink-2`, quieter) | One step away (disclosure) |
|---|---|---|---|
| **Sample hero, desktop** (first load, ≥ 960 px) | The picture in Slider mode on the featured change. It is the largest element on screen, at least 58% of the viewport width at 1440, with its top no more than 220 px from the top of the page | The site title and one mono meta line (`14 captures · 2013–2025`). The change line: dates, magnitude word, summary and its source label. One controls row: Play, `‹ Prev · 9 / 9 · Next ›`, Compare, Change details. A one-line caption under the picture. The scrub strip (filmstrip on top of the timeline) starts in the first viewport | See the disclosure list below |
| **Sample hero, mobile** (< 640 px) | The same picture at full width (16 px gutters), with its top no more than 280 px from the top | A one-line caption (`#14 · 2025·12·18 · Open capture ↗`), the change line and the controls row. The sample switch is a single row of short text toggles ("git-scm · Wikipedia · Rust"; each accessible name contains its visible label) | The same list |
| **Other compare modes** (Single, Side by side, Onion skin) | The picture or pictures | As for the hero; the Before/After toggle only in Single, and the opacity range and Swap only in Onion | As for the hero |
| **Text diff** (scrolled to "What the text says") | The diff body (72ch) | The section heading with both dates, and Prev/Next | The Structure list (its summary gives counts, e.g. "Headings: 4 added, 3 removed, 1 renamed"), the Key, and unchanged runs (already collapsed) |
| **Live, running** | The scrub strip filling in, with the progress line (counter and determinate bar) as its caption | The pane shows the selected capture's silhouette at reduced emphasis. No frame loads until the user picks a change (existing rule). Cancel is a quiet button | As for the hero |
| **Live, done** | The replay pane (Single mode) | As for the hero (no Play in live mode) | As for the hero |
| **Empty and error states** | The message: heading, one sentence and **one** primary action | The secondary action as a text link ("Open a sample"). For "no meaningful changes", the filmstrip stays visible so the looks can still be flipped through | Nothing else is drawn: no empty stage, timeline frame or filmstrip frame |
| **Invalid URL** | The inline field error | | |
| **Mobile live first view** | The pane or the progress | The sticky `‹ Prev · n / N · Next ›` bar appears only after the in-flow controls row has scrolled out of view, and it never covers the pane caption | |

#### 2. What moves behind disclosure

All of these use native `<details>`/`<summary>` and are **closed by default at every width**, except the compare picker (D34).

- **Header:**
  - The tagline moves to the footer's about line and the meta description; it is no longer in the header.
  - The "Try a sample" eyebrow becomes visually hidden (it stays the group's accessible label). *Amended in phase 17:* a quiet, `aria-hidden` "Try" in `--ink-2` sentence case precedes the toggles, so sighted users read them as samples.
  - The chips lose their pill borders and become quiet text toggles with `aria-pressed`. The pressed one gets an ink underline plus weight.
- **Pane toolbar:**
  - The compare-mode radio group goes behind a **"Compare: Slider"** button (`aria-expanded`, `aria-controls`; the button names the current mode). The group keeps its fieldset and its "Compare" legend.
  - The "How it looked" eyebrow becomes visually hidden (it stays a heading).
- **Caption:**
  - It shrinks to frame number, date and "Open capture ↗".
  - The archive name, the "may lack some styles or images" note, redaction notes and "top of page" move into **"About these captures"** in the footer.
  - The alt text keeps the long form.
  - Honest-state badges (partial, no picture, slow) **stay visible**: honesty is not optional.
- **Side card → "Change details"**, which holds:
  - the stats sentence (`+54 / −87 words · 11 added · 9 removed · 2 reworded`);
  - the two "View capture ↗" links (in compare modes, the Before and After capture links live here, so AC 12 holds one step away);
  - Copy link.
- **Filmstrip:**
  - The visible explanation ("14 captures, oldest first… Arrow keys…") becomes the strip's `aria-describedby` text.
  - A footer disclosure, **"Keyboard shortcuts"**, lists every key for the timeline, filmstrip, slider, onion skin and Play.
- **Timeline:**
  - The legend (minor / moderate / major marks, trivial ticks) and "Show trivial edits" go behind **"Key · 4 trivial hidden"**.
  - The trivial count stays visible in the summary text.
- **Changes list:**
  - It sits behind **"All changes (9)"**, closed on every width (it was open on desktop).
  - When open, it is a **single column** in chronological order, at most 72ch (this fixes the zig-zag).
  - It carries one list-level summary-source note (AC 9 carry-over).
- **Text diff:** the Structure list and the Key, as in the table above.
- **Footer:**
  - Sample provenance (text and pictures), licence and redaction notes go in **"About these captures"**.
  - The one-line Internet Archive credit and the GitHub link stay visible.

Rules for every disclosure:

- The summary text says what is inside, with a count where there is one.
- Folded content stays in the DOM (it is not unmounted), so in-page search can open it and the summary is always in the accessibility tree.
- Region headings stay real headings (`sr-only` where they are not shown), so heading navigation is unchanged.
- Opening never moves focus.
- Disclosures don't animate.
- The timeline slider's `aria-valuetext` stays the always-available text route. The changes list is one Enter away.

#### 3. First-load caps

These are measured by the smoke flow `calm-audit` at 1440×900 and 390×844. Regions are elements carrying `data-region="header|hero|scrub|text|changes|footer"`. The hero region holds the title, picture, caption, change line and controls row.

| Measure (first viewport, after `data-visual-ready`) | 1440×900 | 390×844 |
|---|---|---|
| Regions intersecting the viewport | ≤ 3 | ≤ 3 |
| Visible tab stops (roving groups count once; the skip links and the wordmark's home link excluded, *amended in phase 17*). The budget is the input, Show changes, 3 samples, slider handle (Slider) or Open capture (Single), Play, Prev, Next, Compare, Change details and the filmstrip | ≤ 13 | ≤ 12 |
| Framed boxes outside form controls and the picture mat (a border on 3 or more sides, a box-shadow, or a background other than `--paper`) | ≤ 2 | ≤ 2 |
| Visible eyebrow labels (uppercase mono section labels) | ≤ 2 | ≤ 1 |
| Solid accent fills (an element of at least 16×16 px with an `--ink` background) | ≤ 1 | ≤ 1 |

The same region cap applies to every audited state view.

#### 4. Whitespace and rhythm: one spacing scale

- **Tokens in `tokens.css`:** `--space-1: 4px`, `--space-2: 8px`, `--space-3: 16px`, `--space-4: 24px`, `--space-5: 40px`, `--space-6: 64px`.
- **Use:**
  - 4/8 inside controls and between a label and its value;
  - 16 between items in a group;
  - 24 between groups in a region;
  - 40 between regions (24 below 640 px), except 24 between the hero and the scrub strip, which belongs to the focal point (*amended in phase 17*);
  - 64 above and below the footer's rule. *Amended in phase 17:* not around the hero, because at 1280×800 the picture, the summary and the first filmstrip thumbnails must all stay above the fold (AC 31b, visual-default).
- **Enforced by `spacing.test.ts`:**
  - Every `margin*`, `padding*`, `gap`/`row-gap`/`column-gap`, `inset*`/`top`/`right`/`bottom`/`left` and `scroll-padding*`/`scroll-margin*` value in `src/**/*.css` must be one of: `0`, `auto`, a `--space-*` token, a negated token, or a `calc()` of tokens.
  - At most 6 commented allowlist entries are allowed (for example a 1-2 px hairline offset).
  - Borders, outline widths and focus-ring offsets are not spacing.
  - The type scale (1.25) is separate and unchanged.
- **Fewer borders and cards.** Remove:
  - the outer stage card and its border;
  - the side card's top rule;
  - the timeline's tinted box;
  - list-row dividers;
  - pill borders on sample toggles, the summary-source label and the magnitude chip.

  Group with space and alignment instead.
- **Borders that stay:**
  - form-control borders (3:1, AC 25);
  - the picture mat (1 px `--rule-strong`: the mounted print);
  - selected-state outlines and carets;
  - the hatched "no picture" card;
  - the message card of an error or empty state (it is that view's focal point).
- **Desktop stage:**
  - The picture column is about two thirds of the width.
  - In the right column, the change line is top-aligned with the picture, and the controls row's bottom edge sits within 8 px of the picture's bottom edge. That fixes the empty space under Prev/Next.
  - The scrub strip spans the full width below.

#### 5. Clear hierarchy, one accent

- **Order in every view:** title, then hero, then supporting text, then controls. The DOM order and the tab order follow it.
- **Sizes:**
  - site title: Fraunces 25 px;
  - summary: Charter 20 px;
  - meta and controls: 14-16 px system or mono in `--ink-2`.
- **Quiet chips:** the magnitude word and the "AI summary" / "auto summary" label are small mono text in `--ink-2`, with no border or fill. The magnitude glyph stays, so the meaning never rests on colour.
- **One accent: `--accent`, which is `--ink` (D33).**
  - A solid accent fill is reserved for one primary action per view ("Show changes").
  - Every selected state (mode, Before/After, sample, filmstrip frame, changes-list item) uses an ink outline, underline or caret, plus weight and the right ARIA state, **not** a solid fill.
  - The only hues are data encodings, each paired with a symbol or a word:
    - `--added`/`--removed` and their tints only in the diff and the Before/After labels;
    - `--mag-*` only on timeline marks and their key.

#### Phase 17 amendments and how the measures are taken

- **Measures** (`scripts/smoke-calm.ts`): an element counts when it is visible and intersects the first viewport. Framed boxes are non-inline elements of at least 48×24 px with a border on 3 or more sides, a box-shadow, or a background other than `--paper`, outside form controls, `<summary>`, `.btn`, the picture mat and the filmstrip's frames. Eyebrows are the topmost uppercase mono elements with text. `calm-shots` is folded into `calm-audit`: every audit flow saves its first-view shot.
- **Tab stops** exclude the wordmark's home link, like the skip links (site chrome on every view; the drafted budget did not list it).
- **The compare pair's links:** in Slider and Onion skin the caption carries no links; "View capture" for Before and After are in Change details (AC 12, one step away). Single has "Open capture" in the caption; Side by side has one per print.
- **Before / After** is one roving tab stop (Left / Right move between the two toggle buttons), like the filmstrip, so a live run's first view stays within the budget with Cancel.
- **The sticky bar** is the in-flow Previous / Next itself, fixed to the bottom on phones once its row has scrolled away above; there is never a second copy of the buttons.
- **Header:** a visible quiet "Try" (above); the URL field keeps a visible sentence-case label.
- **Moved into "About these captures":** the sample's description and its page link (the hero's meta line is only `14 captures · 2013–2025`; the "Cat." number is dropped).
- **Structure** loses its `h4`: its summary ("Structure · headings: 4 added, 3 removed, 1 renamed") names it. The region headings (How it looked, the change, Filmstrip, Timeline, What the text says) stay as headings, `sr-only` where not shown.
- **Live:** the status line (with a determinate bar) is the scrub strip's caption; the timeline key follows the strip.
- **Side by side** spans both hero columns on desktop; the selected change follows below.
- **The footer** always starts below the first viewport (`main` is at least one viewport tall), so a short state view shows only its message.

---

## 5. Architecture

### 5.1 Overview

```
Browser (React SPA, Vite 8 / Rolldown)                     Cloudflare Worker (one Worker, Workers Static Assets)
┌──────────────────────────────────────────────┐            ┌──────────────────────────────────────────────────┐
│ samples/*.json (bundled) ─┐  public/samples/  │            │ GET  /api/health                                 │
│                           │  <id>/*.webp ──────┼─ static ──▶│ GET  /api/captures?url=&max=  ── CDX (IA) ──┐     │
│ src/core (pure, shared) ◄─┘ buildTimeline     │ same-origin│ GET  /api/snapshot?url=&ts=   ── id_ raw ───┤ IA  │
│   diff / score / ruleSummary                  │ ──────────▶│       └ extract (src/core) ─ KV cache       │     │
│ UI: Timeline (SVG) · Filmstrip · VisualPane · │            │ POST /api/summaries {url,pairs}             │     │
│     Compare modes · ChangesList · DiffView ·  │            │       └ recompute ChangeRecord, Workers AI  │     │
│     UrlForm · states                          │            │         (batched) ─ KV cache                │     │
│ Live VisualPane: <iframe sandbox>  ───────────┼── direct ─▶│ everything else → static assets (SPA)       │     │
│   https://web.archive.org/web/<ts>if_/<url>   │  (browser  │ (optional, not built: /api/shot via Browser │     │
└──────────────────────────────────────────────┘   → IA)    │  Rendering + R2, see D25)                   │     │
                                                            └──────────────────────────────────────────────────┘
Node scripts (the only code that touches the live network; never run by tests):
  scripts/record-samples.ts  (src/core + src/archive)       → src/samples/<id>.json        (text)
  scripts/record-visuals.ts  (playwright-core + system Chrome) → public/samples/<id>/*.webp + fixture `visual`/`shot` fields
```

### 5.2 Modules

| Path | Responsibility | Runs in |
|---|---|---|
| `src/core/types.ts` | Public types: `Block`, `BlockKind`, `ExtractedPage`, `Capture`, `SnapshotPage`, `PageDiff`, `BlockOp`, `WordOp`, `Significance`, `Magnitude`, `ChangeRecord`, `Summary`, `Timeline`, `TimelineEntry`, `SampleFixture`, **`SampleVisual`, `ShotRef`, `ShotStatus`, `CompareMode`** | all |
| `src/core/index.ts` | Public API barrel. TSDoc on every export; this is the "typed public API" | all |
| `src/core/fixture.ts` | `parseSampleFixture(json): SampleFixture` (hand-written guards, no zod; validates the optional visual fields), `fixtureToSnapshots()` | browser, recorders, tests |
| `src/core/url.ts` | `normalizeTargetUrl`, `validateTargetUrl`, `stripTrackingParams`, `rawCaptureUrl`, `viewCaptureUrl`, **`replayFrameUrl(archive, ts, url)`** (IA `…/web/<ts>if_/<url>`, arquivo `…/wayback/<ts>mp_/<url>`), `pairKey(from,to)` | all |
| `src/core/extract.ts`, `outline.ts`, `cdx.ts`, `sampling.ts`, `normalize.ts`, `myers.ts`, `diff.ts`, `score.ts`, `changeRecord.ts`, `ruleSummary.ts`, `timeline.ts` | As built in phases 3-6 (see sections 5.3 and 5.6) | as before |
| `src/core/silhouette.ts` | **New (phase 15).** `silhouette(page, opts): SilhouetteRow[]`: pure layout of bars from blocks (kind, relative length), capped at 24 rows | all |
| `src/archive/archives.ts` | Archive descriptors (`internet-archive`, `arquivo-pt`): CDX, raw `id_`, view, and **frame** (`if_` / `mp_`) URL builders | Worker, recorders |
| `src/archive/politeFetch.ts` | `politeFetch(...)`, `mapLimit(...)`, `USER_AGENT` | Worker, recorder, browser (mapLimit) |
| `src/design/` | `palette.ts`, `tokens.css`, `base.css`, `Logo.tsx`, `Wordmark.tsx` (Pagelapse, phase 9), `cvd.ts` | browser, tests |
| `src/app/` | `App.tsx`, `AppHeader.tsx`, `AppFooter.tsx`, `SamplePicker.tsx`, `UrlForm.tsx`, `TimelineView.tsx` (stage layout), `timeline/*`, `ChangesList.tsx`, `diff/*`, `states/*`, `live/{api.ts, useLiveTimeline.ts, useSummaries.ts}`, `urlState.ts` (`sample`, `url`, `change`, `view`, `at`) | browser |
| `src/app/visual/` | **New.** `visualState.ts` (pure: selected change ⇄ shown capture, side, mode; tests), `VisualPane.tsx` (figure, toolbar, caption, badges, link-out), `Shot.tsx` (sample picture: thumbnail-then-full swap, alt text), `Filmstrip.tsx` (roving-focus contact sheet), `ModePicker.tsx`, `SideBySide.tsx`, `CompareSlider.tsx`, `OnionSkin.tsx`, `usePlay.ts`, `LiveFrame.tsx` + `useFramePool.ts` (sandboxed `if_` frames, dwell, pool, timeouts), `Silhouette.tsx`, `visual.css` | browser |
| `src/samples/` | `index.ts` (registry; default statically imported; `featured` change), `<id>.json` fixtures, `samples.config.json` (recorder input incl. `featured`, `visualRedact`) | browser, recorders |
| `public/samples/<id>/` | **New.** `<ts>-<hash8>.webp` (960×600) and `<ts>-<hash8>.thumb.webp` (320×200), plus `README.md` (provenance and licence note) | static assets |
| `worker/` | `index.ts` (router), `routes/{health,captures,snapshot,summaries}.ts`, `cache.ts`, `limits.ts`, `summarise.ts`, `http.ts`, `env.ts`. **No visual route** (D24, D25) | Worker |
| `scripts/` | `smoke.ts`, `smoke-flows.ts` (gains `--format webp`, stubbed-replay support), `check-size.ts` (gains image budgets), `record-samples.ts`, **`record-visuals.ts`**, **`lib/webp.ts`** (PNG → WebP through Chrome's canvas encoder; shared by the recorder and smoke), `bake-sample-summaries.ts`, `render-social.ts`, `render-hero-gif.ts` | Node 24 |

Conventions: ESM everywhere. Relative imports carry explicit `.ts`/`.tsx` extensions, so Node 24 runs the scripts natively. No router library (state lives in `URLSearchParams`) and no state library (`useReducer`). Inline styles are set only through CSSOM (`el.style.setProperty`), never as `style="…"` strings, so the deploy CSP's `style-src 'self'` holds.

### 5.3 Data flow

**Samples (offline):** `src/samples/<id>.json` → `parseSampleFixture` → `fixtureToSnapshots` → `buildTimeline` (in the browser, about 10-30 ms) → UI. Picture URLs are derived as `/samples/<id>/<shot.file>.webp` and `.thumb.webp`. Summaries come from the fixture's `summaries` map (if baked, labelled AI), else `ruleSummary`.

Fixture shape. It stays schema v1: the visual fields are optional and additive, and the parser validates them when present (D22).

```ts
interface SampleFixture {
  schema: 1;
  id: string; label: string; url: string; description: string;
  source: { archive: 'internet-archive' | 'arquivo-pt' | 'illustrative'; recordedAt: string; recorder: string;
            license: string; attribution: string };
  blocks: Array<{ k: BlockKind; t: string; l?: 1 | 2 | 3 | 4 | 5 | 6 }>;
  snapshots: Array<{ ts: string; digest: string; title: string; blockIds: number[]; truncated?: boolean;
                     shot?: ShotRef }>;                      // new, optional
  summaries?: Record<string, { text: string; source: 'ai' | 'rule'; model?: string }>;
  featured?: string;                                         // new, optional: "<fromTs>-<toTs>", must be a meaningful change
  visual?: SampleVisual;                                     // new, optional
}
interface SampleVisual {
  archive: 'internet-archive' | 'arquivo-pt';
  recordedAt: string;                 // ISO date
  recorder: string;                   // "pagelapse record-visuals 0.1.0 (chrome 155)"
  viewport: { w: 1280; h: 800 };      // CSS px, DPR 1, top of page only
  full: { w: 960; h: 600 }; thumb: { w: 320; h: 200 }; format: 'webp';
  attribution: string;                // e.g. "Screenshots of archived captures as replayed by Arquivo.pt; page designs belong to their authors."
  notes?: string[];                   // e.g. "Infobox rows stating monetary figures were hidden before capture."
}
interface ShotRef {
  file: string;                       // "<ts>-<sha256(full webp) first 8 hex>", matched by /^\d{14}-[0-9a-f]{8}$/
  status: 'ok' | 'partial' | 'failed';
  missing?: { css: number; img: number };   // failed archive subresources (partial)
  settle: 'quiet' | 'cap';            // how the recorder decided the page was done
  redacted?: number;                  // elements hidden by visualRedact
  reason?: string;                    // for failed: "http 404", "blank page", "timeout"
}
```

**Recording sample pictures (`pnpm record:visuals`, phase 10; owned by `archive-integration`):**
1. Read each fixture and its config entry. For each snapshot `ts`, build `replayFrameUrl('arquivo-pt', ts, url)` = `https://arquivo.pt/wayback/<ts>mp_/<url>`.
2. Launch system Chrome headless once, with a persistent profile in `.cache/record/chrome-profile` (disk cache reused across runs), viewport 1280×800, DPR 1, `reducedMotion: 'reduce'`, `timezoneId: 'UTC'`, and the UA from AC 16. `context.route('**/*')` lets through only `arquivo.pt` hosts. It aborts:
   - media;
   - `**/static/js/ruffle/**`;
   - every other host.

   The recorder logs counts by host and type.
3. `page.setContent()` a harness page holding `<iframe src=frameUrl width=1280 height=800 style=border:0>`. The frame is not the top window, so pywb's top-frame redirect does not fire.
4. Wait for the frame's `domcontentloaded` (30 s cap). Then wait for network quiet (no in-flight requests for 2 s) or a 15 s hard cap, then `document.fonts.ready` (3 s cap), plus 500 ms.
5. Apply `visualRedact` inside the frame (Wikipedia: hide `.infobox` rows and blocks whose text matches the `dropBlocks` regex) and count the hidden elements.
6. Screenshot the 1280×800 frame area to PNG, cached in `.cache/record/shots/<id>/<ts>.png`. `--offline` re-encodes from that cache with zero network.
7. Classify the shot:
   - `failed`: the document status is not 200, or the page is blank (> 98% one colour);
   - `partial`: any stylesheet failed, or more than 2 images failed;
   - `ok`: otherwise.
8. Encode through `scripts/lib/webp.ts` in the same Chrome: `createImageBitmap(png, {resizeWidth, resizeHeight, resizeQuality: 'high'})` → `OffscreenCanvas.convertToBlob({type: 'image/webp', quality})`. Full: 960×600, quality 0.62 stepping down 0.06 until <= 64 KB. Thumbnail: 320×200, quality 0.5, then <= 8 KB. Name the files by content hash and write `shot` into the fixture. Old files for that sample are removed.
9. Wait >= 5 s before the next capture. Concurrency 1. At the end, print a table (status, bytes, settle, missing, redacted) and a **visual-delta** table: the mean absolute greyscale difference of 64×40 downscales for every meaningful change, which helps pick `featured`. Close the browser in `finally`, with signal handlers, as in the smoke script.

**Live run (text; unchanged):**
1. `GET /api/captures?url=&max=16`. The Worker normalises the URL, checks KV `cdx:v1:<sha256(url)>` (24 h TTL), and on a miss politeFetches the CDX query (`output=json&fl=timestamp,digest,length&filter=statuscode:200&filter=mimetype:text/html&collapse=timestamp:6&collapse=digest`). It then runs `dedupeAdjacentDigests` and `sampleCaptures`, and returns `{url, totalCaptures, firstTs, lastTs, captures}`.
2. The browser fetches `GET /api/snapshot?url=&ts=` for each sampled capture in chronological order with `mapLimit(2)`. The Worker:
   - checks KV `snap:v1:e<EXTRACTOR_VERSION>:<sha256(url)>:<ts>` (no TTL);
   - on a miss, checks the cooldown and rate limit;
   - politeFetches the raw `id_` URL;
   - extracts, stores and returns the page with `Cache-Control: public, max-age=31536000, immutable`.
3. The browser calls `timeline.appendSnapshot` as each snapshot arrives, and computes the capture's silhouette (phase 15).
4. Summaries: as in section 5.5 (`POST /api/summaries`, server-side recomputation, KV per pair).

**Live run (pictures, phase 15):**
1. When the selection rests for 400 ms, `useFramePool` mounts (or reveals) a sandboxed iframe for each capture the current mode needs: the shown capture in Single, or both sides in the compare modes. The URL is `https://web.archive.org/web/<ts>if_/<url>`. The browser loads it directly from the IA; the Worker is not involved (D24).
2. States run `waiting → loading → loaded`, with a `slow` overlay at 8 s. The silhouette shows until `load` fires.
3. After `load` plus a 2 s rest, one neighbour frame preloads in the direction of travel, hidden (`visibility: hidden`, `inert`, `aria-hidden`). The pool holds at most 3 frames (LRU). There are no neighbour preloads in compare modes, with `navigator.connection.saveData`, or while a run is still fetching snapshots.
4. Captures whose `/api/snapshot` failed (dashed markers) never get a frame. They show "No picture: this capture could not be fetched" with a link out.

### 5.4 Cloudflare pieces

- **One Worker with Workers Static Assets** (D1). `wrangler.jsonc` (`name: "pagelapse"`) has `assets: { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, so static files, including `public/samples/**` pictures, never cost a Worker invocation. Built and run with `@cloudflare/vite-plugin`.
- **KV** (`CACHE` binding): CDX results (24 h), extracted snapshots (no TTL), summaries (no TTL), the IA cooldown flag (60 s), and the daily AI counter.
- **Rate Limiting binding**: `UPSTREAM_LIMIT` (20/min/IP uncached upstream fetches) and `AI_LIMIT` (10/min/IP summary batches).
- **Workers AI** (`AI` binding): text summaries only.
- **Not used by default:** R2, D1, **Browser Rendering**. Browser Rendering + R2 is the designed optional provider for live screenshots (D25). It is not built in this plan and not required; the iframe is the default.
- **Static asset headers** (`public/_headers`, phase 20): `/samples/*` → `Cache-Control: public, max-age=31536000, immutable` (file names are content-hashed); `/assets/*` the same.
- **CSP and framing (phase 20):**
  - `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self';`
  - **`frame-src https://web.archive.org; child-src https://web.archive.org;`**
  - `object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`

  Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`. **Do not** set `Cross-Origin-Embedder-Policy: require-corp`, which would block the IA frames. `connect-src` stays `'self'` because neighbour preloading uses frames, not `<link rel=prefetch>` (D24). If Browser Rendering is ever enabled, its pictures are served same-origin through the Worker, so `img-src` stays `'self'`.

### 5.5 Where AI is used, and only there

- **Only** in `worker/summarise.ts`, for the one-line text summary of a meaningful change. Extraction, diffing, scoring, filtering, sampling, fallback summaries, silhouettes, picture recording, compare modes and the visual-delta report are all deterministic code. No model ever sees a picture (AC 48).
- Model: `@cf/meta/llama-3.2-3b-instruct` (D10). Parameters: `temperature: 0.2`, `max_tokens: 48 × batchSize`. The prompt is versioned (`PROMPT_VERSION = 1`). System message: "You summarise how a web page changed between two archived captures. For each numbered change, reply with exactly one line: `<n>. <summary>`. Each summary is at most 90 characters, neutral, past tense, names concrete things (sections, claims, products of the page itself), no speculation, no quotes, no URLs." The user message is the numbered compact change records.
- Output validation: one line per item, 8-120 characters, no newline, no URL, not equal to the input. An invalid item falls back to `ruleSummary` for that item only.
- Calls are cached per snapshot pair (at most once per pair, ever), batched at <= 8 pairs per call, with an approximate daily cap (KV counter, default 3,000 calls/day).
- The deterministic fallback summary is used when there is no binding, on error or rate limit, or for invalid output. The UI labels it "auto summary".
- Samples use rule summaries by default. `scripts/bake-sample-summaries.ts` can bake AI summaries if `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are set in `.dev.vars`. Otherwise it exits 0 with instructions; that is a non-blocking STATUS.md blocker.

### 5.6 Change-detection details (owned by `diff-analyst`)

Unchanged from phases 5-6. The normalisation masks, Myers block diff with Jaccard pairing and move detection, the weighted significance score (thresholds minor 0.07 / moderate 0.30 / major 0.70; see DECISIONS.md), the <= 1,200-character `ChangeRecord`, and the eval set under `src/core/__eval__/cases/`. Visual change is **not** scored: magnitude stays text-based, and the recorder's visual-delta table only informs the human choice of `featured`.

### 5.7 Caching summary

| Layer | Key | TTL | Notes |
|---|---|---|---|
| KV CDX | `cdx:v1:<sha256(normUrl)>` | 24 h | new captures appear daily at most |
| KV snapshot | `snap:v1:e<EXTRACTOR_VERSION>:<sha256(normUrl)>:<ts>` | none | captures are immutable; bump the version to invalidate |
| KV summary | `sum:v1:<model>:p<PROMPT_VERSION>:<sha256(normUrl)>:<from>-<to>` | none | cached by snapshot pair |
| KV cooldown | `ia:cooldown` | 60 s | set on any IA 429 |
| HTTP API | `/api/snapshot` immutable 1 y; `/api/captures` `max-age=3600`; `/api/summaries` `no-store` | | browser and edge reuse |
| HTTP static | `/samples/*` and `/assets/*` immutable 1 y (content-hashed names) | | sample pictures downloaded once per browser |
| Browser memory | `Map` of snapshots and silhouettes per run; decoded `Image` objects for the current sample; frame pool (<= 3 iframes) | session | re-scrubbing never refetches text or pictures; IA frames reuse the browser's HTTP cache |
| Recorder (text) | `.cache/record/<archive>/<sha>.html` (gitignored) | manual | re-running never refetches |
| Recorder (pictures) | `.cache/record/chrome-profile/` (Chrome disk cache) + `.cache/record/shots/<id>/<ts>.png` | manual | `--offline` re-encodes with zero network |

### 5.8 Testing strategy (RAM-aware)

- Vitest 5 in `node` environment, `maxWorkers: 2`, never watch mode. Component tests use `react-dom/server` rendering (phase 8 decision; no happy-dom).
- Worker handlers are tested as plain functions with a fake `Env` (D15).
- **Headless smoke** (`scripts/smoke.ts`):
  - It blocks all non-localhost requests and reports the count.
  - API flows use `page.route('/api/**')` with fixtures from `test/fixtures/api/`.
  - **From phase 15**, live-visual flows route `https://web.archive.org/web/**` to a local stub (`test/fixtures/replay/stub.html`, which prints the requested timestamp in large type). The report lists these as `stubbed`, separate from `blocked`, and logs every stubbed URL with a timestamp, so dwell, pool and preload rules can be asserted.
  - `--format webp` writes committed screenshots as WebP (quality 0.8) through `scripts/lib/webp.ts` (D27).
- Accessibility automation: axe-core injected via `page.addScriptTag`, and CVD simulation through an SVG `feColorMatrix` filter.
- Image checks: `src/samples/samples.test.ts` reads WebP headers (`VP8 `/`VP8L`/`VP8X` dimensions) with a tiny pure parser in `scripts/lib/webpInfo.ts`. It asserts the dimensions, per-file and total budgets, that every referenced file exists, and that no orphan files remain.

### 5.9 Open technical decisions (with recommendations)

D1-D17 were recorded on 2026-10-19 and stand as recorded in DECISIONS.md, including D13 as amended (rust-lang.org replaced the WHATWG FAQ). The summary table is kept below for reference, then the new decisions.

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Hosting shape | One Worker + Workers Static Assets via `@cloudflare/vite-plugin` |
| D2 | Node version | pnpm `use-node-version=24.22.0` |
| D3 | TypeScript | TS 7 native `tsc`, three configs |
| D4 | HTML extraction | `htmlparser2` SAX, shared |
| D5 | Diff algorithm | in-house Myers with cutoff |
| D6 | Where extraction/diff run | extraction in Worker; diff in browser and Worker |
| D7 | CDX query | `collapse=timestamp:6&collapse=digest` |
| D8 | Sampling | 16 default / 24 max, time buckets |
| D9 | Storage | KV only |
| D10 | Summary model | `@cf/meta/llama-3.2-3b-instruct` |
| D11 | AI binding in dev | missing binding → rules; `env.production` if login forced |
| D12 | Recording source | arquivo.pt with honest provenance; re-record from IA later |
| D13 | Samples | Wikipedia "Internet Archive", git-scm.com, rust-lang.org (amended) |
| D14 | Fonts | self-hosted Fraunces subset |
| D15 | Worker tests | plain Vitest, fake Env |
| D16 | Agent skill / CLI | none in this plan |
| D17 | Line budget | excludes lockfile, fixtures, eval cases, screenshots, fonts, generated images, verbatim licences |

**New decisions (2026-10-20), for DECISIONS.md:**

| ID | Decision | Recommendation | Alternatives | Why |
|---|---|---|---|---|
| D18 | How to ship the rename | A small, mechanical **phase 9** (`phase-9-rename-pagelapse`) before any visual work. It covers the wordmark/logo redesign, UA, metadata, footer, recorder strings, docs and links. It does not cover CLAUDE.md, `.claude/**`, `docs/KICKOFF.md`, DECISIONS.md history rows, old screenshots, or the local folder name | fold into the visual phase | keeps the visual PR reviewable; one grep proves the rename; the new identity is in place before the hero is designed |
| D19 | Splitting the visual pane | **Four PRs.** 10 = sample picture recorder + committed WebP + fixture fields + image budgets. 11 = hero layout + visual pane (Single) + filmstrip + sample honest states. 12 = compare modes (side-by-side, slider, onion skin) + Play + diff polish carry-over. 15 = live iframe pane + silhouettes, *after* live mode (14) | the suggested two-way split (a: recorder + pane + modes + filmstrip; b: live) | the a/b split's part (a) measures about 1,000 lines (recorder 300, pane + filmstrip + layout 400, modes + play 350); four PRs keep each near 400. Live frames need live mode's run state, so they follow phase 14 |
| D20 | Recording sample pictures | Headless system Chrome against **arquivo.pt `mp_` replay inside a local harness iframe** (avoids pywb's top-frame redirect and arquivo's chrome). Block every non-archive host plus media and Ruffle. Wait for frame DOMContentLoaded + 2 s network quiet or a 15 s cap. Top of page only (1280×800, DPR 1). Persistent Chrome cache. >= 5 s between captures, concurrency 1 | top-level `mp_`/`if_` load (redirects into arquivo's framed UI, verified); arquivo `noFrame` replay (untested from the box); web.archive.org (unreachable); full-page screenshots (heavier, more copying) | verified feasible on 2026-10-20; faithful to the archive; no live-web leakage; polite |
| D21 | Picture format and sizes | **WebP encoded by Chrome's own canvas encoder** (`scripts/lib/webp.ts`; no new dependency). Full 960×600 at quality about 0.62 (stepped down to <= 64 KB). Thumbnail 320×200 at about 0.5 (<= 8 KB, 2× for 160 px display). Total <= 2.2 MB for 41 captures (expected about 1.6-1.9 MB) | AVIF (measured only about 10% smaller at 960×600; needs Pillow or `sharp`); 1280×800 full (about 50 KB each, 2.3 MB+ total); PNG (10× larger) | zero dependencies, universal browser support, measured budget fits |
| D22 | Where pictures live and how fixtures reference them | `public/samples/<id>/<ts>-<hash8>.webp` and `.thumb.webp` (static, content-hashed, immutable cache). The fixture keeps schema 1, with optional `visual`, per-snapshot `shot` and `featured` fields validated by `parseSampleFixture` | Vite-imported assets (hashing for free, but 82 imports or a glob, and pictures would enter the module graph); base64 in JSON (+33% and blocks the JS budget); schema bump to 2 | static files never touch the JS bundle or a Worker invocation; additive optional fields avoid churn in the 8 merged phases |
| D23 | Hero first view and readiness | The first view opens the default sample on its curated **`featured` change in Slider mode**. The default sample is re-chosen in phase 10 from the visual-delta report: recommend **git-scm.com** if its 2025 redesign is captured cleanly (`ok`), else keep Wikipedia. `data-ready` keeps its meaning (timeline rendered, <= 1,000 ms). A new `data-visual-ready` (hero pictures decoded, <= 1,500 ms) has its own AC. The hero pictures start loading before React's first render (an `Image()` decode in `samples/index.ts`) | latest change in Single mode (consecutive captures often look identical, so there's no wow); gate `data-ready` on images (couples two budgets, and slow disks would fail AC 31) | the most shareable moment is a visible redesign; keeps the proven AC 31 intact; still zero network |
| D24 | Live pictures | The browser embeds the **IA's own `if_` replay directly** in a sandboxed iframe (`allow-scripts allow-same-origin`, no top-navigation/popups/forms, `allow=""`). Mounting rule: 400 ms rest. Pool <= 3, LRU. One hidden neighbour preload after load + a 2 s rest; none in compare modes, under Save-Data, or while a run fetches. 8 s "slow" state. CSP `frame-src https://web.archive.org` | Worker proxy of replay (rewriting, abuse surface, doubles IA load); `<link rel=prefetch>` for neighbours (HTTP-cache partitioning makes it likely wasted IA requests; would need `connect-src` to IA); no live pictures | the IA designed `if_` for embedding; zero Worker cost; the sandbox blocks frame-busting and top navigation; polite by construction |
| D25 | Live thumbnails and Cloudflare Browser Rendering | Live filmstrip thumbnails are **text silhouettes** from the extracted page (deterministic, zero requests). Browser Rendering is **designed but not built**: a future `GET /api/shot?url=&ts=` behind an optional `BROWSER` binding + `SHOTS` R2 bucket, cached forever, rate-limited, health reports `shots: "browser-rendering" | "off"`. Documented in EXTENDING.md and the roadmap | build Browser Rendering now (usage limits and possible cost on the free plan, R2 setup, RAM-heavy local testing); one hidden iframe per thumbnail (16 full IA page loads per run: impolite) | no paid services required; politeness; honest "text outline" labelling |
| D26 | Finance-free pictures | The visual recorder applies `visualRedact` from `samples.config.json`. For Wikipedia: hide infobox rows and blocks whose text matches the existing `dropBlocks` money regex. Record the count per shot and a fixture note shown in the caption ("2 rows with monetary figures hidden"). The verifier inspects the Wikipedia contact sheet by eye | crop to the article column (loses the look); skip Wikipedia pictures | consistent with the text-trim decision and honest about the edit |
| D27 | Repository weight of verifier screenshots | From phase 10 on, committed verifier screenshots are WebP (quality 0.8) via `pnpm smoke --format webp`, and only the files the phase lists are committed (continuing the phase-8 decision). PR bodies embed `.webp` with `?raw=true` | keep PNG (phase 8 alone was 36 MB) | about 5-10× smaller; GitHub renders WebP |
| D28 | Time-lapse Play | Include a user-started, pausable Play that steps one capture per 1.2 s in Single mode (phase 12) | no Play (scrub only) | it is the product's name made literal and the most shareable interaction; small (about 40 lines) |
| D29 | Name and identity | Product name "Pagelapse". Identifiers `pagelapse` (package, Worker, UA, recorder). Mark: offset pages + before/after divider. Wordmark: *page* (Fraunces Italic) + **lapse** (Fraunces SemiBold) over a five-frame strip. Existing palette and type are kept | keep the ± rewind mark | the old mark spoke "diff"; the new one speaks "pages over time, compared", matching the new hero |

**New decisions (2026-10-21, Sean's design direction), for DECISIONS.md:**

| ID | Decision | Recommendation | Alternatives | Why |
|---|---|---|---|---|
| D30 | Polish phase and renumbering | Insert **phase 17 `phase-17-calm-polish`** right before open-source packaging. Renumber OSS packaging 17 → **18** (`phase-18-oss-packaging`), showcase and launch 18 → **19** (`phase-19-showcase-launch`), and deploy 19 → **20** (`phase-20-deploy`). Carry-overs addressed to "phase 17/18/19" in DECISIONS.md and PR bodies follow their phase. Carry-overs addressed to "the polish phase" or "the next UI phase" go to 17 | fold the polish into OSS packaging; polish after the showcase | Sean asked for a dedicated phase before packaging; the README hero, GIF and social preview (18-19) must show the calm layout, so the polish comes first |
| D31 | Where the Calm layout rules live | PLAN.md section 4, "Calm layout": drafted by the planner, then confirmed or amended by the phase 17 implementer with review by the a11y-reviewer and the verifier. Phase 18 copies it to `docs/DESIGN.md` for contributors | a new `docs/DESIGN.md` now | one source of truth while building; the rules are concrete before phase 17 starts, so its ACs are testable |
| D32 | Spacing scale and how it is enforced | `--space-1..6` = 4/8/16/24/40/64 px in `tokens.css`. `src/design/spacing.test.ts` (Vitest, plain-text CSS scan, no new dependency) fails on any non-token spacing value outside an allowlist of at most 6 commented entries | stylelint plus a plugin (new dependencies, outside the VoidZero toolchain); review by eye only | deterministic, zero dependencies, runs in CI |
| D33 | The one accent | `--accent` = `--ink`. A solid ink fill is used for one primary action per view. Selection is shown with ink outline, underline or caret, plus weight and ARIA state. Chromatic colour is left to the data encodings (added/removed, the magnitude ramp), which are always paired with symbols or words | a new chromatic accent (for example a darkroom amber), which needs new CVD separations from added/removed and adds a third hue competing with the data; using `--added` blue as the accent, which confuses "selected" with "added" | no new CVD risk; ink on paper fits the proof-sheet identity; the change itself becomes the only colour that pops |
| D34 | Disclosure mechanism | Native `<details>`/`<summary>` for legends, details, the changes list, Structure, Key, provenance and keyboard help, closed by default at every width. The compare-mode picker sits behind a "Compare: <mode>" button with `aria-expanded`. No modals and no side panel. `?view=` still applies the mode without opening the picker | a side panel or drawer; tabs; a "More options" menu | zero JS for most disclosures and native keyboard and screen-reader semantics; Chrome's find-in-page auto-expands `<details>`; nothing gets trapped |
| D35 | How "calm" is measured | The smoke flows `calm-audit` (caps from section 4 §3, at 1440×900 and 390×844, first viewport) and `calm-inventory` (every feature reachable by keyboard with at most one disclosure opened). From phase 17 on, crowding is a design FAIL in the verify loop. Desktop SV screenshots stay at 1280×800; the audit adds 1440×900 | subjective review only | Sean's direction makes crowding a FAIL; numbers make it reviewable and stop regressions |
| D36 | Carry-overs into phase 17 and the deferral order | Into 17: a list-level summary-source note; the summaries route caps body size before reading; ask for pending summaries on cancel/error; the mobile sticky bar covering the caption; zig-zag changes list; empty space under Prev/Next; the Wikipedia header wrap; the 320 px loading tag covering the outline; and the dark-theme selected-frame outline contrast (moved from the showcase). The showcase (19) keeps the "decade" hero compare and the "Open Before/After capture" link names. If phase 17 runs over about 500 lines, defer in this order: the two summaries carry-overs (to phase 20, as hardening), then the 320 px tag (to GOOD_FIRST_ISSUES). The calm rules, caps, spacing test, inventory, screenshots and layout fixes are never deferred | everything to the showcase phase | carry-overs land in the phase that touches the code; contrast and layout bugs are polish, not showcase |

---
## 6. Phases

20 phases. Phases 1-16 are done (PRs open, stacked). Phase 9 was the rename, and phases 10-12 and 15 delivered the visual pane (D19). Phase 17 is the calm-layout polish (D30). Phases 18-20 are packaging, showcase and deploy. Every phase leaves the app working: the sample view renders after every phase.

Renumbering map (for STATUS.md and DECISIONS.md carry-over notes). Read a phase number in an older note by the plan that was current on its date:

| Plan of 2026-10-19 | Plan of 2026-10-20 | Now (2026-10-21) | Branch |
|---|---|---|---|
| - | 9 | 9 | `phase-9-rename-pagelapse` |
| - | 10 | 10 | `phase-10-sample-pictures` |
| - | 11 | 11 | `phase-11-visual-pane` |
| - | 12 | 12 | `phase-12-compare-play` |
| 9 | 13 | 13 | `phase-13-worker-archive-api` |
| 10 | 14 | 14 | `phase-14-live-mode` |
| - | 15 | 15 | `phase-15-live-visual` |
| 11 | 16 | 16 | `phase-16-ai-summaries` |
| - | - | **17** | **`phase-17-calm-polish`** (new) |
| 12 | 17 | **18** | `phase-18-oss-packaging` |
| 13 | 18 | **19** | `phase-19-showcase-launch` |
| 14 | 19 | **20** | `phase-20-deploy` |

Carry-overs recorded in DECISIONS.md and PR bodies move with their phases:

- "phase 9" politeFetch `Retry-After: 0` floor and `readCapped` boundary went to **13** (done).
- The "phase 9" recorder fix for the truncated "Text co" heading, with an offline re-record, went to **10** (done).
- The "phase 10" footer copy went to **14** (done).
- The "phase 11" rule-summary quality went to **16** (done).
- The design polish carry-over (tints, disabled Next, space between `del` and `ins`) went to **12** (done).
- The "phase 12" GOOD_FIRST_ISSUES (opening-hours masking and others) go to **18**.
- The "phase 18 (showcase)" carry-overs from 2026-10-21 go to **19**: the hero "decade" compare (first ↔ latest) and the "Open Before/After capture" link names. The dark-theme selected-frame outline contrast from the same entry goes to **17** (D36).
- The "phase 14" (2026-10-20 numbering: deploy) exclusion of `dist/.vite/chunk-modules.json` from deploy assets goes to **20**.
- "Phase 19 DEPLOY docs recommend Workers Paid" (extraction CPU) and "deploy must build with `CLOUDFLARE_ENV=production`" (D11, already written as phase 20) go to **20**.
- The **polish phase** carry-overs go to **17** (D36):
  - the list-level "AI summary" note (phase 16);
  - the summaries route capping body size before reading (phase 16);
  - asking for pending summaries on cancel or error (phase 16);
  - the mobile live first view, where the sticky bar covers the pane caption (phase 15);
  - the 320 px loading tag covering the outline (phase 15);
  - the zig-zag 2-column changes list and the empty space under Prev/Next (phase 11);
  - the Wikipedia header wrap (phase 11).

### Standard verification (SV), run by the verifier in every phase

1. `pnpm install --frozen-lockfile` → `pnpm lint` (oxlint, 0 errors) → `pnpm typecheck` → `pnpm test` (vitest run) → `pnpm build` → `pnpm size` (budgets in AC 30, 32 and 40).
2. `pnpm smoke --out docs/screenshots/phase-<n> --format webp` (from phase 10; PNG before). It requires `pnpm build` first. It starts the preview server and drives every registered flow with system Chrome. It saves screenshots and asserts no console errors, **0 blocked non-localhost requests** (stubbed replay requests from phase 15 are reported separately), and axe clean. It **always** kills the server and browser.
3. Look at every screenshot. Check every phase acceptance criterion with evidence.
4. Hard-rule grep:
   - no secrets (`git diff main... | grep -iE "api[_-]?key|token|secret"` reviewed);
   - no `next`/`remix` deps;
   - no `.github/workflows/`;
   - nothing finance-related (including in pictures: inspect the contact sheets);
   - no employer mention;
   - nothing deployed.
5. Cleanup: `ps -ef | grep -E "vite|workerd|chrome|wrangler"` shows nothing the verifier started.
6. Screenshot naming: `docs/screenshots/phase-<n>/<flow>-<desktop|mobile>[-dark|-reduced|-protan|-deutan|-tritan|-gray|-kbd].webp`. Desktop is 1280×800, mobile 390×844. Commit **only** the files the phase lists (D27).
7. **UI phases (2, 7, 8, 9, 11, 12, 14, 15, 16, 17, and 19 for its first-view change):** the main agent runs `a11y-reviewer` before the verifier signs off; its findings are fixed in the same verify loop.
8. **From phase 17 on, crowding counts as a design FAIL**, judged against the "Calm layout" rules in section 4: one focal point per view, the first-load caps, the spacing tokens, one accent, and folded content reachable. For any phase that changes UI, the verifier runs `pnpm smoke --flows calm-audit,calm-inventory` and pastes the audit table. A cap exceeded, or a new always-visible element that competes with the view's focal point, is a FAIL item, even when every functional AC passes.

Phases 1-8 below are kept as specified, as history. Product identifiers in them are updated to the new name; the code is renamed in phase 9.

---

### Phase 1: toolchain and built-in sample path

- **Status:** done, PR #1 (built under the working name wayback-diff).
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
  - `ci/github-workflow.yml` (checkout, pnpm/action-setup, setup-node 24, `pnpm install --frozen-lockfile`, lint, typecheck, test, build). `LICENSE` (MIT, "Copyright (c) 2026 geekplux and Pagelapse contributors"). `.gitignore` additions: `.cache/`, `docs/screenshots/latest/`.
- **Acceptance criteria:**
  1. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass under the pnpm-managed Node (`pnpm exec node -v` prints v24.x).
  2. `parseSampleFixture` accepts the committed fixture and rejects at least 5 malformed variants (wrong schema, missing blocks, out-of-range blockIds, non-chronological timestamps, bad timestamp format), with tests.
  3. `pnpm smoke` renders the sample: all 4 capture dates are visible, there are 0 console errors and 0 blocked external requests, time-to-ready is reported, and both screenshots are written.
  4. Kill test: `pnpm smoke` with a deliberately failing flow (`--flows __fail`, a built-in self-test flow) exits non-zero **and** leaves no `vite`/`chrome` processes (`ps` check). The same holds when the script is interrupted with SIGINT mid-run.
  5. No files under `.github/workflows/`. The CI file exists at `ci/github-workflow.yml`.
- **Verifier:** SV 1-6. Screenshots `sample-default-desktop.png`, `sample-default-mobile.png`. Run the kill test from AC 4 and paste the `ps` output.
- **Risks:** `use-node-version` download blocked (mitigation: nodejs.org is reachable; fallback D2 alternative, recorded). TS 7 incompatibilities with `@types/*` (fallback TS 5.9). Chrome needs `--no-sandbox` in this container (allowed flag, documented in the script). About 350 lines.

### Phase 2: design system and app shell

- **Status:** done, PR #2 (built under the working name wayback-diff).
- **Branch:** `phase-2-design-shell`
- **Specialist:** `implementer`; `a11y-reviewer` reviews
- **Goal:** the distinctive visual identity from section 4 in code: tokens, fonts, logo/wordmark, header with sample chips, footer with provenance, light/dark, reduced motion, plus automated palette and size checks.
- **Scope:** `src/design/palette.ts` (tokens as typed constants), `src/design/tokens.css`, `src/design/base.css` (reset, type scale, focus ring, `prefers-reduced-motion`, `forced-colors`), `src/design/cvd.ts` (Machado 2009 matrices, sRGB↔linear, OKLab ΔE, WCAG contrast), `src/design/palette.test.ts` (all contrast pairs from the section 4 table; added/removed ΔE >= 8 under protan/deutan/tritan in both themes; magnitude ramp monotone; `tokens.css` values equal `palette.ts`), `src/design/Logo.tsx`, `src/design/Wordmark.tsx`, `public/favicon.svg`, `public/fonts/Fraunces-*.woff2` + `OFL.txt`, `src/app/AppHeader.tsx`, `src/app/SamplePicker.tsx` (a group of toggle buttons with `aria-pressed`, keyboard-operable), `src/app/AppFooter.tsx` (archive credit, sample provenance and licence, GitHub link), restyled `SampleView.tsx`, `scripts/check-size.ts` + `pnpm size` (gzip budgets from AC 30; fails if `htmlparser2` appears in any client chunk). Smoke additions: flows `sample-default` (light and dark), `reduced-motion`, `keyboard-tab-order`; an axe pass on each flow; and a `--cvd` option that captures protan/deutan/tritan/gray variants.
- **Acceptance criteria:**
  1. The palette test passes and encodes every pair in the section 4 table.
  2. Light and dark themes follow `prefers-color-scheme`. Screenshots show the paper/ink identity, wordmark and logo.
  3. Fonts are served from `public/fonts/` (or the fallback stack is documented in DECISIONS.md). There are 0 external requests.
  4. axe: 0 serious/critical. Tab order is header → sample chips → content → footer links (the URL input joins after the wordmark in phase 14), with a visible focus ring on every stop.
  5. `pnpm size` passes and prints a budget table.
  6. The reduced-motion flow confirms `transition-duration` computes to `0s` on animated elements.
- **Verifier:** SV + screenshots `shell-desktop.png`, `shell-mobile.png`, `shell-desktop-dark.png`, `shell-desktop-kbd.png` (focus visible), `shell-desktop-{protan,deutan,tritan,gray}.png`.
- **Risks:** the font subset tooling (fonttools woff2 needs brotli; if it is missing, ship TTF→WOFF2 via another route or use the fallback stack). Identity drifting toward generic (the a11y-reviewer and main agent compare against section 4). About 380 lines.

### Phase 3: readable-text extraction and URL rules

- **Status:** done, PR #4 (built under the working name wayback-diff).
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

- **Status:** done, PR #5 (built under the working name wayback-diff).
- **Branch:** `phase-4-recorder-samples`
- **Specialist:** `archive-integration`
- **Goal:** polite archive access code (CDX, sampling, fetch with backoff) shared by the recorder and the later Worker, a recorder script, and 3 real, trimmed, committed sample fixtures replacing the illustrative one.
- **Scope:** `src/core/cdx.ts`, `src/core/sampling.ts`, `src/archive/archives.ts`, `src/archive/politeFetch.ts` (`politeFetch`, `mapLimit`; UA `pagelapse/<version> (+https://github.com/geekplux/pagelapse)`; retries only on 429/502/503/504/network errors, 3 attempts, backoff 1/2/4 s ±20%, `Retry-After` honoured up to 30 s else throws `RateLimitedError{retryAfter}`; `AbortSignal.timeout(20_000)`; `maxBytes` 2 MB with a streaming cutoff; charset detection from the header or `<meta charset>` with `TextDecoder`). `src/samples/samples.config.json` (the 3 pages from D13 with descriptions and licence/attribution strings). `scripts/record-samples.ts` (`pnpm record:samples [--archive internet-archive|arquivo-pt] [--only <id>] [--max 14] [--dry-run]`; concurrency 1, >= 1.5 s between requests; raw HTML cached in `.cache/record/`; extract → trim → intern blocks → write `src/samples/<id>.json`; prints a summary table). The 3 fixtures. Registry and `SamplePicker` updated to 3 samples, with Wikipedia as default. The illustrative fixture is deleted (its test switches to an inline minimal fixture). Fixture test: every committed sample parses, has >= 8 snapshots, is chronological, has unique digests, is <= 150 KB raw, and the default is <= 40 KB gzip. The footer shows each sample's archive provenance and licence.
- **Acceptance criteria:**
  1. Unit tests (all offline, with fake fetch/sleep): CDX URL building (includes both `collapse` params, filters, `fl`), IA JSON and pywb NDJSON parsing, adjacent-digest dedupe, sampling (<= max, first and last kept, deterministic, spread across buckets, prefers large length deltas), politeFetch (UA on every request, backoff sequence on 429/503, `Retry-After` honoured and capped, no retry on 404/403, gives up after 3, size cap), and `mapLimit` never exceeds its limit.
  2. Three real fixtures are committed with truthful `source` metadata. If recorded via arquivo.pt (expected; D12), the UI says "Captures from Arquivo.pt" and the capture links point there.
  3. The recorder is never imported by tests. `grep` shows no live-URL fetch in `*.test.ts`.
  4. The smoke flow `samples-switch` clicks each chip. Each sample renders with 0 external requests.
  5. If neither archive is reachable when the phase runs, the phase still ships the code and tests, keeps the illustrative sample, and the main agent records "record real samples" as a blocker in STATUS.md.
- **Verifier:** SV + screenshots `sample-<id>-desktop.png` for each sample and `samples-mobile.png`. Inspect fixture provenance by hand (open a capture link URL in the report; do not fetch it).
- **Risks:** arquivo.pt politeness and terms (single run, slow, identified UA). Licensing of excerpts (D13 picks permissive pages; attribution shown). Fixture size for Wikipedia (interning + caps; if still over budget, use a shorter article from the alternates). About 400 lines + fixtures.

### Phase 5: diff engine

- **Status:** done, PR #6 (built under the working name wayback-diff).
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

- **Status:** done, PR #7 (built under the working name wayback-diff).
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

- **Status:** done, PR #8 (built under the working name wayback-diff).
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

- **Status:** done, PR #9 (built under the working name wayback-diff).
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

### Phase 9: rename to Pagelapse and new wordmark

- **Branch:** `phase-9-rename-pagelapse`
- **Specialist:** `implementer`; `a11y-reviewer` reviews the new mark and wordmark
- **Goal:** the product is called Pagelapse everywhere user-facing and in metadata, with a redesigned logo and wordmark in the existing identity system. Mechanical and small.
- **Scope:**
  - `package.json` `name: "pagelapse"`, with the description "See how any web page looked and changed over the years, from web archive captures."
  - `index.html`: `<title>Pagelapse: see how any web page changed over the years</title>`, meta description, `og:title` / `og:site_name` / `application-name` = "Pagelapse".
  - `src/design/Logo.tsx`, `src/design/Wordmark.tsx` and `public/favicon.svg` redesigned per section 4 (offset pages + before/after divider; *page***lapse** over a five-frame strip; `sr-only` "Pagelapse"), plus the wordmark CSS in `base.css`. If the mark adds colour pairs, `palette.test.ts` covers them.
  - `src/app/AppFooter.tsx`: "Pagelapse is open source (MIT). Source on GitHub" linking to `https://github.com/geekplux/pagelapse`.
  - `src/archive/politeFetch.ts`: `USER_AGENT = pagelapse/<version> (+https://github.com/geekplux/pagelapse)`, with an exact-string test in `politeFetch.test.ts`.
  - `scripts/record-samples.ts`: recorder string `pagelapse record-samples …`. The `samples.test.ts` regex changes to match. The `source.recorder` field of the 3 committed fixtures is updated by a string edit only, with no re-record (same tool, renamed).
  - Doc comments in `src/core/index.ts` and `src/archive/archives.ts`.
  - `LICENSE` copyright line ("geekplux and Pagelapse contributors").
  - `README.md`: title and pitch only; the full rewrite is in phase 18 (numbered 17 when this phase ran).
  - `ci/github-workflow.yml` comment.
  - `docs/STATUS.md` links → `https://github.com/geekplux/pagelapse/...`.
  - Smoke flow `brand` renders `favicon.svg` at 16, 32 and 64 px on `--paper` and `--ink`.
  - **Not touched:** `CLAUDE.md`, `.claude/**`, `docs/KICKOFF.md`, history rows in `docs/DECISIONS.md`, committed screenshots of earlier phases, and the local folder name.
- **Acceptance criteria:**
  1. `git grep -n -i "wayback-diff" -- . ':!CLAUDE.md' ':!.claude' ':!docs/KICKOFF.md' ':!docs/DECISIONS.md' ':!docs/PLAN.md' ':!docs/screenshots'` returns nothing. (PLAN.md keeps only history notes.)
  2. The UA test asserts exactly `pagelapse/${APP_VERSION} (+https://github.com/geekplux/pagelapse)`.
  3. The wordmark's accessible name is "Pagelapse" (a11y snapshot). The mark reads in greyscale and at 16 px. Palette and contrast tests pass. axe is clean.
  4. The page title and meta are updated; the smoke check reads `document.title`.
  5. The smoke regression of all existing flows passes with 0 external requests, and time-to-ready is still <= 1,000 ms.
- **Verifier:** SV + screenshots `header-desktop.webp`, `header-desktop-dark.webp`, `header-mobile.webp`, `header-desktop-gray.webp`, `brand-favicon.webp`. Paste the AC 1 grep output.
- **Risks:** the identity drifting (the main agent compares against section 4). Broken links in already-open PR bodies, which GitHub redirects; left as is. About 200 lines.

### Phase 10: sample pictures (recorder, committed WebP, fixture fields, budgets)

- **Branch:** `phase-10-sample-pictures`
- **Specialist:** `archive-integration`
- **Goal:** every built-in sample capture has a faithful, small, committed picture (full + thumbnail) recorded politely from arquivo.pt replay, referenced from the fixtures and guarded by budgets. No UI yet besides a review contact sheet.
- **Scope:**
  - `scripts/record-visuals.ts` (`pnpm record:visuals [--only <id>] [--offline] [--dry-run]`), exactly per section 5.3 "Recording sample pictures": harness iframe, host allowlist, wait policy, redaction, PNG cache, status classification, encode and size stepping, content-hash names, orphan cleanup, delta table, kill-safe cleanup.
  - `scripts/lib/webp.ts` (Chrome canvas encoder: `encodeWebp(page, png, {width, height, quality})`), shared with smoke. `scripts/lib/webpInfo.ts` (pure WebP header reader + tests).
  - `src/archive/archives.ts` + `src/core/url.ts`: `replayFrameUrl` for both archives, with tests.
  - `src/core/types.ts` / `fixture.ts`: `SampleVisual`, `ShotRef`, `featured`, with parser validation tests (bad file pattern, unknown status, wrong dimensions, `featured` not a pair key of the fixture).
  - `samples.config.json` gains `visualRedact` (Wikipedia) and `featured` (chosen from the delta table: the meaningful change with the largest visual delta whose two shots are `ok`; the choice is recorded in DECISIONS.md). `src/samples/index.ts` exposes the default sample per D23 (switch to git-scm.com if its featured pair is `ok`).
  - `public/samples/<id>/*.webp` (about 82 files) + `public/samples/README.md` (provenance, "page designs belong to their authors", redaction note).
  - `scripts/check-size.ts`: image budgets (AC 40).
  - `src/samples/samples.test.ts`: files exist, no orphans, dimensions, per-file and total budgets, every snapshot has `shot`, and at least 90% of shots are `ok` or `partial`.
  - `scripts/smoke.ts`: `--format webp`, and a review-only flow `shots-contact-sheet` that renders a generated grid of every thumbnail per sample (from the fixtures) on localhost.
  - Carry-over: the recorder fix for the truncated heading cut mid-block ("Text co"), plus an `--offline` text re-record.
  - `.gitignore` already covers `.cache/`.
- **Acceptance criteria:**
  1. AC 39 and 40 hold. `pnpm size` prints the image budget table (count, largest full, largest thumb, total).
  2. The recorder log (pasted in the PR) shows: only arquivo.pt hosts loaded; blocked hosts listed; >= 5 s between captures; one browser; `ps` clean afterwards. A second run with `--offline` makes 0 network requests and produces byte-identical files.
  3. No picture shows arquivo.pt's own chrome (header bar or year sidebar). Wikipedia pictures show no monetary figures. Both are checked by eye on the contact sheets.
  4. Tests never import the recorders (grep). No test touches the network.
  5. Smoke regression passes. The app still renders samples with 0 external requests; the pictures are not shown yet.
  6. If arquivo.pt is unreachable when the phase runs, the code, tests and budgets still ship, fixtures carry no `shot` fields, and the main agent records "record sample pictures" as a STATUS.md blocker. Phases 11-12 then use the hatched "no picture" state and stay testable.
- **Verifier:** SV + `shots-contact-sheet-<id>.webp` for each sample (3 files). Paste the recorder summary table, the delta table and the `pnpm size` image table. Inspect 5 random full pictures at 100%.
- **Risks:**
  - Replay fidelity: old captures missing CSS. These are honest `partial` badges, not failures.
  - The 15 s cap cutting late-loading content; the `settle` field records it.
  - Run time (about 41 × 20 s ≈ 15 min), handled with resumable caches.
  - Copyright and trademarks in page designs: top-of-page only, attribution, permissive-site samples, and the README note.
  - Chrome RAM: one browser, one page.

  About 380 lines + images.

### Phase 11: the hero visual pane and filmstrip (samples)

- **Branch:** `phase-11-visual-pane`
- **Specialist:** `implementer`; `a11y-reviewer` reviews
- **Goal:** the first view becomes the visual scrub. The stage layout from section 4 puts the picture of the page at the selected capture in front, synced with the timeline, the changes list and a contact-sheet filmstrip, with honest picture states.
- **Scope:**
  - `src/app/visual/visualState.ts` (pure; tests): `captureForChange`, `changeForCapture`, the `at` / `side` defaults, and the trivial-capture lookup.
  - `VisualPane.tsx`: figure, toolbar placeholder (the mode group arrives in phase 12; this phase ships Single with the `− Before | + After` toggle), mat, caption strip, badges, "Open capture ↗" link.
  - `Shot.tsx`: `width`/`height`, alt text, thumbnail-then-full swap, `fetchpriority="high"` on the hero, `decoding="async"`.
  - `Filmstrip.tsx`: roving focus, frame numbers, trivial and no-picture marks, `scrollIntoView({block: 'nearest', behavior})` honouring reduced motion.
  - `visual.css`.
  - `TimelineView.tsx` restructured into the stage + timeline + filmstrip + diff layout (desktop, 640-959 and mobile). The timeline tooltip shows the thumbnail.
  - The first view selects `featured` (fallback: latest).
  - `data-visual-ready` and the pre-render hero decode in `src/samples/index.ts`.
  - `urlState.ts`: `&at=`.
  - Smoke flows:
    - `visual-default` (asserts AC 1 incl. pictures, AC 31 and 31b, CLS);
    - `visual-filmstrip-keyboard` (Tab to the filmstrip, Right ×3, Enter; the timeline `aria-valuetext` and list `aria-current` sync);
    - `visual-timeline-sync` (timeline keys update the picture `src`);
    - `visual-states` (one capture forced to `failed` and one to `partial` by routing its file to 404 and by a test-only query flag `?__shotStatus=` read only in dev/test builds; or real ones if present);
    - `visual-mobile`.
- **Acceptance criteria:**
  1. AC 1 (Single mode until phase 12 makes Slider the default; the featured change is selected), 12 (picture links), 13 (`at`), 31, 31b, 38, 40 (first-view bytes measured from the smoke request log), 41, 44 (sample part), 47 (Single mode, filmstrip).
  2. The stage fits above the fold at 1280×800: picture, summary and the top of the timeline are visible without scrolling.
  3. Greyscale and CVD screenshots: the selected frame, trivial frames and no-picture frames are identifiable without colour.
  4. axe is clean. Keyboard-only flow: skip link → input → chips → pane toolbar → picture link → timeline → filmstrip → changes → diff, in a logical order.
- **Verifier:** SV + `hero-desktop`, `hero-mobile`, `hero-desktop-dark`, `hero-desktop-{protan,deutan,tritan,gray}`, `hero-desktop-reduced`, `filmstrip-desktop-kbd`, `visual-partial-desktop`, `visual-failed-desktop` (all `.webp`). Paste the timings (ready, visual-ready, CLS) and first-view image bytes.
- **Risks:** layout churn in existing smoke flows (update their selectors in the same PR); 14 thumbnails crowding at 960 px (the filmstrip scrolls inside its container); the `__shotStatus` hook leaking into production (guarded by `import.meta.env.DEV || MODE === 'test'`, and the build is grepped). About 400 lines.

### Phase 12: compare modes and time-lapse Play

- **Branch:** `phase-12-compare-play`
- **Specialist:** `implementer`; `a11y-reviewer` reviews
- **Goal:** compare the two captures of a change in three ways and play the page's decade as a time-lapse. All of it works by keyboard, respects reduced motion and never relies on colour alone. The hero opens in Slider mode.
- **Scope:**
  - `ModePicker.tsx`: native radios styled as a segmented control, inside a `fieldset` with the legend "Compare".
  - `SideBySide.tsx`.
  - `CompareSlider.tsx`: CSSOM `--split`; handle `role="slider"` per AC 42; pointer capture drag; double-click or Enter resets to 50%; pure `splitFromKey` / `splitFromPointer` with tests.
  - `OnionSkin.tsx`: native range + Swap.
  - `usePlay.ts` + Play/Pause button: steps `at`; stops per AC 43; tests with fake timers.
  - `urlState.ts`: `&view=`.
  - The default first-view mode becomes Slider (AC 1).
  - Forced-colors rules for the divider and handle.
  - Diff polish carry-over: lighter tints or gutter-only, a distinct disabled Next, and a real space between `del` and `ins` for copy/paste.
  - Smoke flows: `compare-side`, `compare-slider-keyboard` (focus the handle, Left ×4, End, Home; assert `aria-valuenow` and the computed clip), `compare-slider-drag`, `compare-onion` (range keys, Swap), `play` (Play, wait 3 steps, assert `at` advanced 3 and the button text; press a key → stopped), `play-reduced` (no transitions computed), `compare-deeplink` (`?view=onion`).
- **Acceptance criteria:**
  1. AC 1, 13 (`view`), 23 (pictures), 25 (overlay contrast: the handle and labels are measured against both a white and a black test image in a unit test of the token pairs), 26, 29, 42, 43, 47.
  2. In greyscale and CVD screenshots of each mode, Before/After are distinguishable by label and position alone.
  3. Time-to-ready and visual-ready budgets still hold.
- **Verifier:** SV + `compare-slider-desktop`, `compare-slider-mobile`, `compare-slider-desktop-kbd`, `compare-side-desktop`, `compare-side-mobile`, `compare-onion-desktop`, `compare-slider-desktop-{gray,deutan}`, `compare-slider-desktop-dark`, `play-desktop` (mid-play), `diff-polish-desktop`.
- **Risks:** pointer-drag and keyboard conflicts on touch (the handle is a separate element with its own `touch-action: none`); Play conflicting with focus (Play never moves focus); scope creep (zoom and pan are out of scope). About 380 lines.

### Phase 13: Worker archive API with caching and politeness

- **Branch:** `phase-13-worker-archive-api`
- **Specialist:** `archive-integration`
- **Goal:** the Cloudflare Worker that serves the SPA and the `/api/captures` and `/api/snapshot` endpoints, politely and cached, and testable with no network.
- **Scope:**
  - Dev deps `wrangler`, `@cloudflare/vite-plugin`, `@cloudflare/workers-types`. `vite.config.ts` adds `cloudflare()`.
  - `wrangler.jsonc`:
    - `name: "pagelapse"`, `main: "worker/index.ts"`, `compatibility_date: "2026-10-01"`;
    - `assets: {not_found_handling: "single-page-application", run_worker_first: ["/api/*"]}`;
    - `kv_namespaces: [{binding: "CACHE", id: "<set-at-deploy>"}]`;
    - `ratelimits: [{name: "UPSTREAM_LIMIT", namespace_id: "1001", simple: {limit: 20, period: 60}}]`;
    - `observability: {enabled: true}`.
  - `tsconfig.worker.json` (added to `typecheck`).
  - `worker/index.ts`, `worker/env.ts`.
  - `worker/http.ts`: JSON helpers; error codes `invalid_url | no_captures | excluded | archive_rate_limited | archive_unavailable | too_large | rate_limited | not_found`; security headers on API responses.
  - `worker/cache.ts`, `worker/limits.ts`.
  - `worker/routes/health.ts` (`{ok, version, ai: "unavailable"}`), `captures.ts`, `snapshot.ts`.
  - `.dev.vars.example`.
  - Tests with a fake Env/KV/limiter and a recorded-response fake fetch from `test/fixtures/api/` + `test/fixtures/html/`.
  - Carry-overs: the politeFetch `Retry-After: 0` floor and `readCapped` exact-boundary truncation flag.
- **Acceptance criteria:**
  1. AC 16-19 are proven by unit tests. That covers:
     - the UA header;
     - retry, backoff and `Retry-After`;
     - the cooldown short-circuit;
     - CDX cached 24 h and snapshots cached with no TTL;
     - a second identical run makes 0 upstream calls;
     - the 2 MB cap → `too_large`;
     - raw HTML is never written to KV.
  2. Input validation: bad URL → 400 `invalid_url`; private and IP hosts rejected; `ts` validated; unknown `/api/*` → 404 JSON.
  3. `pnpm build` produces the client and the Worker. `pnpm preview` (workerd) serves the SPA with the samples and their pictures working, and `curl -s 127.0.0.1:4173/api/health` returns `{"ok":true,...}`. No Cloudflare login is needed. All processes are killed afterwards.
  4. Smoke regression (all sample and visual flows) passes against the plugin-based preview, with 0 external requests. Sample pictures are served as static assets (no Worker invocation; `run_worker_first` only for `/api/*`).
- **Verifier:** SV + the health `curl` output + regression screenshots `hero-desktop.webp`. Confirm `workerd` is not left running.
- **Risks:**
  - The plugin preview's RAM use alongside Chrome.
  - Workers free-plan CPU versus extraction of large pages: measure it, and if extraction exceeds about 8 ms, note "Workers Paid recommended" in DEPLOY docs (phase 20).
  - Rate-limit binding simulation (optional in code).

  About 400 lines.

### Phase 14: live mode (paste a URL)

- **Branch:** `phase-14-live-mode`
- **Specialist:** `implementer` (consult the `archive-integration` notes in `src/archive/`); `a11y-reviewer` reviews
- **Goal:** the second input path. Paste any URL, watch the timeline build progressively, with polished loading, empty and error states, cancellation and shareable links. Live pictures come in phase 15. Until then, the stage hides the visual pane in live mode, and the summary and diff take its place.
- **Scope:**
  - `src/app/UrlForm.tsx`: labelled `type="url"` input with `inputmode="url"`, placeholder "Paste any URL, e.g. whatwg.org/faq", inline validation, submit on Enter.
  - `src/app/live/api.ts`, `useLiveTimeline.ts`: `mapLimit(2)`, `AbortController`, in-memory cache, dashed partial failures.
  - `src/app/states/{LoadingStatus,EmptyState,ErrorCard}.tsx`.
  - `urlState.ts` `?url=` (auto-starts), "Copy link" for live runs, the throttled polite live region.
  - Carry-over: footer copy ("Live captures come from the Internet Archive") only once live mode exists.
  - `test/fixtures/api/` mocks generated from the git-scm sample, plus error variants.
  - Smoke flows using `page.route('/api/**')`: `live-success` (150 ms per snapshot), `live-cancel`, `live-no-captures`, `live-excluded`, `live-rate-limited`, `live-partial-failure`, `live-no-meaningful-changes`, `live-invalid-url`.
- **Acceptance criteria:**
  1. AC 4, 5, 6, 13 (live part), 14, 15 and 22 (progress announcements) hold, with the mocked API.
  2. The smoke request log shows at most 2 concurrent `/api/snapshot` requests at any time.
  3. Cancel stops further requests within one in-flight response. A new submission aborts the previous run (no stale markers).
  4. Every state screenshot is polished: correct copy, no layout jump larger than the status line, and axe clean.
  5. Samples remain the default first view. Visiting `/` never calls `/api/*` and never requests `web.archive.org`.
- **Verifier:** SV + `live-loading-desktop`, `live-loading-mobile`, `live-success-desktop`, `live-empty-desktop`, `live-no-meaningful-desktop`, `live-error-ratelimited-desktop`, `live-error-excluded-desktop`, `live-partial-desktop`, `live-invalid-url-desktop`, `live-loading-desktop-reduced`.
- **Risks:** live behaviour against the real IA can only be checked after deploy (phase 20 post-deploy checks); progressive-update races (reducer + run id guard). About 400 lines.

### Phase 15: live visual pane (sandboxed Wayback replay + silhouettes)

- **Branch:** `phase-15-live-visual`
- **Specialist:** `implementer` (politeness rules reviewed by `archive-integration`); `a11y-reviewer` reviews
- **Goal:** in live mode, scrubbing shows what the page actually looked like. The Internet Archive's own replay loads in a sandboxed frame, only for the selection, with polite neighbour preloading, text-silhouette thumbnails, the same compare modes, and honest slow and blocked states.
- **Scope:**
  - `src/core/silhouette.ts` (pure; tests) and `src/app/visual/Silhouette.tsx`.
  - `src/core/url.ts` `replayFrameUrl('internet-archive', …)`, if not already covered in phase 10.
  - `src/app/visual/LiveFrame.tsx`:
    - attributes per AC 45;
    - a 1280×800 frame scaled into the mat via `ResizeObserver` + CSSOM transform;
    - `inert` in compare modes;
    - state machine `waiting → loading → loaded` with an 8 s `slow` overlay;
    - the silhouette underneath until load.
  - `src/app/visual/useFramePool.ts` (pure policy `nextFramesToMount(selection, direction, loaded, now, saveData, runActive)` with unit tests; pool <= 3 LRU; rest timers).
  - `VisualPane` / `Filmstrip` / compare modes accept a `source: 'shot' | 'frame'` capture view.
  - The live filmstrip uses silhouettes.
  - Failed captures get the "No picture" state.
  - `test/fixtures/replay/stub.html`. `scripts/smoke.ts` stubbed-replay routing and request log (section 5.8).
  - Smoke flows:
    - `live-visual` (after the run, select a change → exactly 1 frame request after >= 400 ms);
    - `live-visual-scrub` (5 Right presses within 1 s → only the final selection's frame requested);
    - `live-visual-preload` (after load + 2 s, exactly one neighbour request; none in Slider mode);
    - `live-visual-slow` (route held open → the slow state at 8 s with link-out and silhouette);
    - `live-visual-compare` (Slider with two frames, both `inert`);
    - `live-filmstrip-silhouettes` (0 image requests).
- **Acceptance criteria:**
  1. AC 44 (live part), 45, 46 and 47 hold, proven by the request log and DOM assertions.
  2. Pool policy unit tests cover: rest, LRU eviction, no preload in compare mode, under Save-Data or while a run is active, and direction of travel.
  3. Samples are unaffected: visiting `/` and every sample flow makes 0 requests to `web.archive.org` (stubbed count 0).
  4. Memory sanity: after scrubbing across 16 changes, the DOM has <= 3 iframes.
- **Verifier:** SV + `live-visual-desktop`, `live-visual-mobile`, `live-visual-slow-desktop`, `live-visual-compare-desktop`, `live-filmstrip-desktop`, `live-visual-desktop-gray`. Paste the stubbed request log for `live-visual-scrub` and `live-visual-preload`.
- **Risks:**
  - IA framing headers or `if_` behaviour can't be observed from this box. The honest slow state and link-out cover it, and phase 20 adds a post-deploy check.
  - Archived pages with heavy scripts or audio (`allow=""` blocks autoplay-with-sound permissions and the sandbox blocks popups).
  - Cross-origin frames can't report errors (the copy never claims a cause it can't observe).

  About 400 lines.

### Phase 16: AI one-line summaries (Workers AI, batched, cached, with fallback)

- **Branch:** `phase-16-ai-summaries`
- **Specialist:** `diff-analyst` (prompt, record, validation), with UI wiring in the same PR; `a11y-reviewer` reviews the label UI
- **Goal:** the lean-AI layer. One cached call per batch of meaningful changes; rule summaries everywhere else.
- **Scope:**
  - `wrangler.jsonc` adds `ai: {binding: "AI"}` and the `AI_LIMIT` rate limit (D11 applies if login is demanded).
  - `worker/summarise.ts` and `worker/routes/summaries.ts` per section 5.5. Health reports `ai: "available" | "unavailable"`.
  - `src/app/live/useSummaries.ts`.
  - The summary source label component.
  - `scripts/bake-sample-summaries.ts` (optional) and `.dev.vars.example` (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`; baker only).
  - Carry-over: rule-summary quality (heading rename → "Renamed …", call out version bumps, pick the informative heading).
  - Tests with a fake `AI` binding: batching, caching, prompt size limits, invalid output, an AI throw, a missing binding, and pairs not in KV.
- **Acceptance criteria:**
  1. AC 9, 10, 11 and 48 hold (unit tests + smoke with a mocked `/api/summaries`, plus a 500 variant).
  2. `grep -rn "env.AI" worker src` shows `worker/summarise.ts` only.
  3. Samples stay offline and keyless. Fixtures without baked summaries show "auto summary".
  4. Without credentials, the main agent lists "Workers AI token for baking sample summaries (optional)" in STATUS.md as non-blocking.
- **Verifier:** SV + `summary-ai-desktop`, `summary-fallback-desktop`, `summary-label-mobile`, plus `/api/health` from `pnpm preview` showing `ai: "unavailable"` without login.
- **Risks:** small-model drift (strict validation + fallback); the AI binding forcing remote mode in dev (D11); cost abuse (server-side records, limits, daily cap, cache). About 380 lines.

### Phase 17: calm layout polish (one focal point per view)

- **Branch:** `phase-17-calm-polish`
- **Specialist:** `implementer`; `a11y-reviewer` reviews (before the verifier signs off); the verifier checks. Small Worker and summaries carry-overs may be done by the implementer directly (they are a few lines each); `diff-analyst` is not needed.
- **Goal:** apply Sean's 2026-10-21 design direction to every existing view without removing any feature:
  - the visual scrub is the one focal point;
  - fewer elements are visible at once (progressive disclosure);
  - one spacing scale, more whitespace, fewer borders and cards;
  - a clear hierarchy with one accent.

  The same CVD, never-colour-alone, keyboard, reduced-motion and no-3D constraints apply. Ship it with before/after evidence at 1440 and 390 px.
- **Order of work:**
  1. **Baseline first (first commit).** Add the smoke flows `calm-audit` and `calm-shots`. Both tolerate a missing `data-region` and report "n/a". Run them on the **unmodified** phase-16 UI and commit `docs/screenshots/phase-17/before/` together with the baseline audit numbers, which go in the PR.
  2. **Rules.** Confirm or amend the "Calm layout" subsection of section 4 (focal point table, disclosure list, caps, spacing and accent rules), and rewrite the older "Layout" subsection to match. Amendments are allowed only if the audit shows a rule can't be met without removing a feature. Each amendment is recorded in DECISIONS.md.
  3. **Implement** (scope below), then commit `after/`.
- **Scope:**
  - **Tokens and checks:**
    - `src/design/tokens.css`: `--space-1..6` and `--accent: var(--ink)`.
    - `src/design/spacing.test.ts` (D32).
    - `src/design/accent.test.ts`, a CSS scan:
      - `--added`/`--removed` and their tints appear only in diff, compare-label and logo selectors;
      - `--mag-*` appears only in timeline and key selectors;
      - `background` of `--ink`/`--accent` appears only on the allowlisted primary-action selector and the logo tile.
    - `palette.test.ts` gains the dark-theme selected-frame outline pair, ≥ 3:1 against both the dark paper and a white thumbnail edge (carry-over).
  - **CSS** (`base.css`, `visual.css`, `live.css`): convert all spacing to tokens; remove the outer stage card, the side-card rule, the timeline's tinted box, list dividers and pill borders (section 4 "Calm layout" §4); quiet chips; selected states become outline, underline or caret plus weight instead of solid fills.
  - **Components** (each top-level block gets a `data-region`):
    - `AppHeader.tsx`: one row with the wordmark, the input and "Show changes"; the tagline moves to the footer. This also fixes the Wikipedia header wrap.
    - `SamplePicker.tsx`: quiet text toggles, a visually hidden group label, short visible labels on phones.
    - `TimelineView.tsx`: region structure; the desktop stage grid with the controls row bottom-aligned to the picture (the Prev/Next space carry-over); the scrub strip as one region (filmstrip over timeline).
    - `VisualPane.tsx` and `ModePicker.tsx`: one controls row (Play, Prev/Next, "Compare: <mode>" disclosure button, "Change details"); the caption shrunk to frame number, date and link; honest badges kept.
    - `Filmstrip.tsx`: the help text moves to `aria-describedby`.
    - `timeline/Legend.tsx`: behind "Key · N trivial hidden", with "Show trivial edits" inside.
    - `ChangesList.tsx`:
      - closed by default;
      - a single column in chronological order (the zig-zag carry-over);
      - a **list-level summary-source note** (carry-over): "Summaries: AI summary (Workers AI)", "auto summary (rules)" or "mixed: items marked AI are by Workers AI". In the mixed case, each AI item carries a short text "AI".
      - The timeline tooltip shows the same source word.
    - `diff/DiffView.tsx`: Structure and Key behind disclosures.
    - `AppFooter.tsx`: "About these captures" (provenance, licence, archive notes, redaction) and "Keyboard shortcuts" disclosures; the tagline goes here.
    - `live/LiveView.tsx` and `states/*`:
      - the running-state focal point (the progress line captions the scrub strip);
      - no empty stage in states;
      - the sticky Prev/Next bar is shown only when the in-flow controls row is out of view (IntersectionObserver), with `scroll-padding-bottom` equal to the bar height (the mobile live first-view carry-over);
      - the 320 px loading tag no longer covers the silhouette (it wraps below or truncates with a full accessible name).
  - **Summaries carry-overs:**
    - `worker/routes/summaries.ts` rejects a body over 16 KiB **before reading it**. It checks `Content-Length` first, then reads with a byte cap so it never buffers more than cap + 1 bytes, and answers `bad_request` (unit test with a counting stream).
    - `src/app/live/useSummaries.ts`: when a run is cancelled or errors, it asks once for the meaningful changes that were never requested. It keeps ≤ 8 pairs per call and once per pair (unit test).
  - **Smoke** (`scripts/smoke-flows.ts`):
    - `calm-audit` measures the caps in section 4 §3 per view and width, plus the picture's size and top, the controls-row alignment, the sticky-bar overlap and the changes-list order. It prints a table and fails on a cap.
    - `calm-shots` takes screenshots of the audited views.
    - `calm-inventory` is described in AC 5.
    - Update existing flows' selectors where a control moved behind a disclosure: open it first, but keep their assertions unchanged.
  - **Audited views** (each at 1440×900 and 390×844):
    1. `hero` (git-scm, Slider);
    2. `hero-wikipedia`;
    3. `compare-side`;
    4. `single`;
    5. `text-diff` (scrolled to the diff, with the changes list opened);
    6. `live-running`;
    7. `live-done` (stub frame);
    8. `live-empty`;
    9. `live-no-meaningful`;
    10. `live-error-ratelimited`;
    11. `live-invalid-url`.
- **Acceptance criteria:**
  1. **Rules written.** Section 4 "Calm layout" matches what ships: the focal point table covers every audited view, and the disclosure list names every folded item. The a11y-reviewer signs off on it, and any amendment is in DECISIONS.md.
  2. **First-load caps** (`calm-audit`, first viewport after `data-visual-ready`) hold for `/` and for every audited view:
     - at 1440×900: ≤ 3 regions, ≤ 13 visible tab stops, ≤ 2 framed boxes outside form controls and the mat, ≤ 2 eyebrow labels, ≤ 1 solid accent fill;
     - at 390×844: ≤ 3 regions, ≤ 12 tab stops, ≤ 2 framed boxes, ≤ 1 eyebrow label, ≤ 1 accent fill.

     Every number is ≤ its baseline, and the PR shows the baseline next to the result.
  3. **One focal point.** On the hero, the picture is the largest visible element of the first viewport:
     - at 1440×900: width ≥ 58% of the viewport, top ≤ 220 px;
     - at 390×844: width ≥ viewport − 32 px, top ≤ 280 px.

     The DOM order of the hero region is title → picture → change line → controls (checked by the smoke flow).
  4. **Spacing and accent.**
     - `spacing.test.ts` passes. The tokens are exactly 4/8/16/24/40/64, and the allowlist has ≤ 6 commented entries.
     - `accent.test.ts` passes.
     - No raw colour literals exist outside `tokens.css` (grep).
  5. **No feature removed** (`calm-inventory`). Each item in a fixed inventory is reachable with Tab, Enter and Space only, opening at most one disclosure, and its accessible name is in the tree. The inventory:
     - URL input, Show changes, the 3 sample toggles;
     - Compare picker with all 4 modes, Play, Before/After toggle, slider handle, onion range, Swap, Prev, Next;
     - Copy link, both View capture links, Open capture;
     - filmstrip, timeline slider, Show trivial edits, the key items;
     - the changes list items, Structure, the diff Key, Show unchanged blocks;
     - Skip to diff, About these captures, Keyboard shortcuts, the GitHub link.

     All existing smoke flows pass. Their assertions are unchanged, and only their selectors or a disclosure-opening step are added.
  6. **Accessibility.**
     - axe reports 0 serious or critical issues on every audited view, with disclosures both closed and all open.
     - Keyboard-only screenshots show focus on a folded item after opening its disclosure.
     - Heading navigation lists the same region headings as before (compare the a11y snapshot with the baseline).
     - AC 21-29 and 47 still hold.
  7. **CVD, contrast and motion.**
     - `palette.test.ts` passes, including the dark-theme selected-frame outline at ≥ 3:1 (carry-over).
     - Greyscale and deuteranopia screenshots of the hero are unambiguous (selected states are visible without colour).
     - The reduced-motion flow computes 0 s transitions, including on disclosures and the sticky bar.
  8. **Budgets.**
     - AC 30 (CSS ≤ 15 KB gzip, JS ≤ 100 KB gzip), 31 (≤ 1,000 ms) and 31b (`data-visual-ready` ≤ 1,500 ms, CLS < 0.02) hold at 1280×800 and 1440×900.
     - The first-view image bytes (AC 40) are unchanged or lower.
  9. **Carry-overs**, each with evidence:
     - (a) the list-level summary-source note, in all three variants (smoke with mocked summaries);
     - (b) an oversized summaries body is rejected before reading (unit test);
     - (c) pending summaries are requested on cancel and on error (unit test);
     - (d) at 390×844, for both sample and live first views, the pane caption's rectangle never intersects the sticky bar's rectangle, and the bar is hidden while the in-flow controls are visible;
     - (e) when the changes list is open, item tops increase strictly in DOM order;
     - (f) at 1280 and 1440, the bottom of the controls row is within 8 px of the picture's bottom;
     - (g) for all 3 samples at 1280×800, the scrub strip's top is in the first viewport (the Wikipedia wrap);
     - (h) at 320 px, the loading tag covers ≤ 10% of the silhouette.
  10. **Before/after evidence.** `docs/screenshots/phase-17/before/` and `after/` hold the listed pairs, and the PR embeds them side by side.
- **Verifier:** SV (including SV 8) plus:
  - the `calm-audit` table (baseline vs after, per view and width);
  - the `calm-inventory` report;
  - the a11y snapshot heading diff.

  Committed screenshots (WebP, D27):
  - before/after pairs for `hero`, `hero-wikipedia`, `text-diff`, `live-running`, `live-done` and `live-error-ratelimited`, at `-1440` and `-390` (24 files);
  - after-only `hero-1440-dark`, `hero-1440-gray`, `hero-1440-deutan`, `hero-1440-reduced`, `hero-1440-kbd-disclosure`, `hero-390-sticky-scrolled` and `live-390-first-view`.

  All other audited views are checked in the report but not committed.
- **Line budget and deferral:** expected about 450-500 changed lines, excluding screenshots. Roughly: CSS 150, components 160, tests 60, smoke 110, carry-overs 50. If the diff goes over about 500 lines, defer in this order (D36):
  1. carry-overs 9b and 9c, to phase 20 as hardening;
  2. 9h, to GOOD_FIRST_ISSUES in phase 18.

  Record each deferral in DECISIONS.md and under "Known gaps". Never defer the rules (AC 1), the caps, the spacing test, the inventory, the before/after shots, or carry-overs 9a, 9d-9g.
- **Risks:**
  - Over-folding makes the first view feel empty or hides the "wow". The focal picture must get *bigger*, not just lonelier; the a11y-reviewer and the main agent judge it against the before shots.
  - A closed `<details>` hides the changes list from screen readers. The timeline slider's `aria-valuetext` stays the full route, and the list is one Enter away; this is checked in AC 6.
  - Smoke-selector churn across about 40 flows. Add a shared `openDisclosure(name)` helper and don't change any assertion.
  - Tokenising spacing shifts layouts slightly. CLS and fold assertions catch regressions.
  - Scope creep into new features. This phase only rearranges, folds and restyles.

### Phase 18: open-source packaging (docs, community, quality signals)

- **Branch:** `phase-18-oss-packaging`
- **Specialist:** `implementer`
- **Goal:** make the repo welcoming and credible: a README that sells in 10 seconds with the visual scrub as its hero, plus contribution scaffolding and extension docs.
- **Scope:**
  - `README.md` rewrite:
    - the pitch "**Pagelapse**: scrub through a decade of any web page. See how it looked and what changed, capture by capture, from the Internet Archive.";
    - the hero image `docs/hero.webp` (the Slider mode on the featured sample change, re-captured by the smoke flow `hero` from the calm layout of phase 17; the GIF lands in phase 19);
    - plain-text badges (MIT, "no API key needed", "works offline for samples");
    - a **Live demo: _coming soon_** placeholder;
    - "Try it in 10 seconds";
    - features (visual scrub, compare modes, Play, text diff, summaries);
    - "How it works" (pipeline in text/mermaid, plus where AI is used and where it isn't, and where the pictures come from);
    - being kind to the Internet Archive;
    - privacy (live pictures load directly from the Internet Archive in your browser);
    - accessibility statement, roadmap (including the Browser Rendering screenshot provider, D25), credits (Internet Archive, Arquivo.pt, sample licences, picture attribution, Fraunces OFL) and licence.
  - `CONTRIBUTING.md` (incl. `pnpm record:visuals` and the image budget), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, verbatim; contact via `geekplux/pagelapse`), `SECURITY.md`.
  - `.github/ISSUE_TEMPLATE/{bug_report.yml, feature_request.yml, sample_suggestion.yml, config.yml}` and `.github/pull_request_template.md`. Nothing under `.github/workflows/`.
  - `CHANGELOG.md`.
  - `docs/EXTENDING.md`: add a sample (text and pictures), the summariser interface, significance tuning, archive sources, theme tokens, and the optional screenshot provider design.
  - `docs/GOOD_FIRST_ISSUES.md`: 8-10 candidates, e.g. Markdown export, side-by-side *text* diff, "jump to year", opening-hours masking (carry-over), a sample suggestion, UI string table, print stylesheet, `?n=`, and zoom in the picture pane, plus anything phase 17 deferred (D36).
  - `docs/DESIGN.md`: a copy of section 4, including "Calm layout" (D31). `CONTRIBUTING.md` says UI changes are reviewed against it and that crowding is a FAIL.
  - `ci/github-workflow.yml` gains `pnpm size` and an optional smoke job.
- **Acceptance criteria:**
  1. The README's first screen has the pitch, the hero picture and the "try it" path. Every link resolves (`scripts/check-docs.ts`, run in tests).
  2. All listed files exist, and the templates are valid YAML.
  3. No employer mention, nothing finance-related, no `.github/workflows/`.
  4. The app is unchanged (smoke regression).
- **Verifier:** SV + `readme-preview.webp`. Cross-check every README claim against behaviour.
- **Risks:** the README overclaiming (for example, live pictures depend on the IA's replay). About 400 lines, excluding the verbatim Code of Conduct.

### Phase 19: showcase and launch kit

- **Branch:** `phase-19-showcase-launch`
- **Specialist:** `implementer`
- **Goal:** the assets that make people share it, built around the visual scrub. Nothing is posted anywhere.
- **Scope:**
  - `assets/social-preview.svg` → `assets/social-preview.png` (1280×640) via `scripts/render-social.ts`: the wordmark and mark, the tagline, and a real before/after split picture of the featured sample with the divider and labels, in the brand frame, flat 2D.
  - `scripts/render-hero-gif.ts`: drives the `play` flow and captures one frame per step at 960×600, then runs `ffmpeg` palettegen/paletteuse → `docs/hero.gif` (<= 3 MB, about 12 frames at 0.8 s, loops). The README uses it above the static hero. If `ffmpeg` is missing, the script skips with a note.
  - `examples/README.md`: a gallery of the 3 samples (picture, what to look for, deep links with `&view=slider`) plus 5 "try these" URLs (non-commercial, non-finance).
  - `docs/LAUNCH.md` ("Drafts only. Nothing has been posted." at the top):
    - a Show HN draft that leads with "watch a web page's decade in 15 seconds";
    - an X post (<= 280 chars);
    - 3 demo scenarios, each starting from the visual scrub: the fact-checker, the retrospective, and "watch a redesign happen";
    - a comparison table (the Wayback Machine's own Changes feature, Visualping / changedetection.io, manual tab-by-tab diffing, Wikipedia history);
    - a "what we deliberately don't do" list.
  - **Carry-overs from phase 12** (recorded as "carry to phase 18 (showcase)" under the 2026-10-20 numbering):
    - **Hero "decade" compare.** The default sample's first view opens the Slider on the **first ↔ latest** capture (a decade in one drag), or on a featured pair with a bigger visual jump if the verifier's side-by-side review prefers it. The choice and its visual-delta number go in DECISIONS.md. `?change=` deep links and AC 1, 31 and 31b still hold. The hero pictures' pre-render decode follows the new pair.
    - **Link names.** In Side by side, the two links read "Open Before capture ↗" and "Open After capture ↗", with the dates in their accessible names.
  - The social preview, the GIF and the gallery are captured from the calm layout (phase 17).
- **Acceptance criteria:**
  1. The social preview is 1280×640, < 1 MB, legible at 50%, and its text passes AA contrast.
  2. `docs/hero.gif` is <= 3 MB, or a skip note is present.
  3. Every gallery deep link opens the stated change and mode (smoke `examples-deeplinks`).
  4. LAUNCH.md has all parts. The X draft is <= 280 chars (test). No prices, finance or employer.
  5. Smoke regression passes. The render scripts leave no Chrome or ffmpeg running.
  6. Carry-overs:
     - the first view's Slider shows the decade pair (smoke asserts both `src` timestamps), and `data-visual-ready` ≤ 1,500 ms and CLS < 0.02 still hold;
     - the side-by-side link names are asserted in the a11y snapshot;
     - `calm-audit` still passes (SV 8).
- **Verifier:** SV + `social-preview.webp`, `examples-gallery.webp`, `hero-decade-desktop.webp`, `hero-decade-mobile.webp`, and one frame of the GIF. `ps` after the render scripts. The `a11y-reviewer` reviews the first-view change.
- **Risks:** an unfair comparison (keep it factual); GIF weight (cap the frames and the palette); the decade pair includes an old capture with `partial` styles (pick the earliest `ok` capture instead, and say so in the caption). About 360 lines + images.

### Phase 20: Cloudflare deployment preparation (STOP for Sean's approval)

- **Branch:** `phase-20-deploy`
- **Specialist:** `implementer`
- **Goal:** everything ready to deploy with one command. Dry run only, **never deploy**.
- **Scope:**
  - Finalise `wrangler.jsonc`:
    - `name: "pagelapse"`, `workers_dev: true`, `preview_urls: false`;
    - observability;
    - a KV id placeholder comment;
    - the rate-limit bindings at the top level, and the AI binding **only in `env.production`** (D11, as built in phase 16);
    - a refreshed `compatibility_date`.
  - **Exclude `dist/.vite/chunk-modules.json` from the deployed assets** (carry-over). For example, stop emitting it into the assets directory or list it in an `.assetsignore` there. The dry-run output must not contain it.
  - **Production build.** Every deploy-bound build runs with **`CLOUDFLARE_ENV=production`**, so `@cloudflare/vite-plugin` writes the production environment, including the `AI` binding, into the output config. Dev, preview and verify keep building without it, so they need no login.
  - `public/_headers` with the CSP from section 5.4 (incl. **`frame-src https://web.archive.org; child-src https://web.archive.org`**, no COEP), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and immutable caching for `/assets/*` and `/samples/*`.
  - `package.json` scripts: **`"check:deploy": "wrangler deploy --dry-run --outdir .wrangler/dry-run"`** (exactly) and `"deploy": "CLOUDFLARE_ENV=production pnpm build && wrangler deploy"` (for Sean; agents never run it).
  - Any phase-17 carry-over deferred here (D36: the summaries body cap and pending summaries on cancel/error), if it was deferred.
  - `docs/DEPLOY.md`:
    - prerequisites: a Cloudflare account; `wrangler login`; `wrangler kv namespace create CACHE` with the id pasted into `wrangler.jsonc`;
    - the **exact deploy command** `CLOUDFLARE_ENV=production pnpm build && pnpm exec wrangler deploy`;
    - post-deploy checks:
      - health;
      - a live URL run;
      - KV hits on the second run;
      - **`curl -sI "https://web.archive.org/web/<ts>if_/https://git-scm.com/"`** to confirm the IA does not send `X-Frame-Options` or a `frame-ancestors` CSP that blocks embedding;
      - a live visual check that a frame renders under our CSP;
    - rollback;
    - costs and limits, including **"Workers Paid recommended"**: extraction measured about 20 ms warm and about 96 ms cold CPU on a 682 KB page (phase 13), which is over the free plan's 10 ms CPU limit for large pages. Also: the Workers AI daily cap, KV usage, and the rate limits.
  - README live-demo instructions. CHANGELOG entry.
- **Acceptance criteria:**
  1. `CLOUDFLARE_ENV=production pnpm build && pnpm run check:deploy` succeeds and writes `.wrangler/dry-run/`. The report includes the bundle size and the listed bindings: `CACHE`, `UPSTREAM_LIMIT`, `AI_LIMIT`, and `AI` in production. `.wrangler/dry-run/` and the assets manifest contain no `chunk-modules.json`. A plain `pnpm build && pnpm preview` still needs no login.
  2. `pnpm preview` serves the app with `_headers` applied (`curl -I` shows the CSP incl. `frame-src`). Samples, pictures, compare modes and Play work with no CSP violations in the console. The stubbed live-visual flow loads its frame under the CSP. (The stub is served for `https://web.archive.org/**`, so the frame-src rule is exercised.)
  3. No deploy command was executed (shell history; `.wrangler/deploy` has no published state; the settings deny-list is unchanged).
  4. The PR has the exact deploy command and an "Awaiting Sean's approval to deploy" section. STATUS.md is `STATE: DONE` with the note "awaiting Sean's approval to deploy".
- **Verifier:** SV + `check:deploy` output + `curl -I` headers + `final-desktop.webp`, `final-mobile.webp`, `final-desktop-dark.webp`, `final-live-visual-desktop.webp`.
- **Risks:** the dry run needing a login, for example because of the production `AI` binding (record it as a STATUS.md note and don't work around it; the dry run without `CLOUDFLARE_ENV` must still pass); KV ids are placeholders; the IA's framing policy can only be confirmed post-deploy (documented check, plus the honest slow state and link-out as fallback).

---

## 7. Out of scope (for this plan)

- Monitoring or alerts for future changes (a different product; the LAUNCH.md comparison explains this).
- **Automated visual change detection**: pixel diffs, highlighted visual regions, or scoring changes by picture. Magnitude stays text-based. The recorder's visual-delta table is only a curation aid for `featured`.
- **Full-page (below the fold) sample pictures**, zoom and pan in the picture pane, and mobile-viewport recordings. Top of page at 1280×800 only (zoom is a good-first-issue candidate).
- **Live screenshot generation** (Cloudflare Browser Rendering or any headless service). It is designed as an optional provider (D25) but not built. Proxying or rewriting archive replay through our Worker is also out of scope.
- Image, CSS or JS *content* diffs.
- Accounts, saved collections, server-side history, analytics or tracking of users.
- Triggering Save Page Now captures (we only link to it), and bulk or site-wide crawls (`matchType=prefix/domain`).
- Archives other than the Internet Archive in live mode. arquivo.pt is used only by the two recorders (D12, D20).
- A browser extension, CLI, npm library release, or a Claude agent skill (D16; roadmap).
- Side-by-side *text* diff mode, export (Markdown/CSV) and UI i18n: listed as good-first-issues. (Side-by-side *pictures* are in scope, phase 12.)
- Deploying. Sean approves and runs it.
- Anything finance-related (including in pictures, D26), decorative 3D, and external font or analytics CDNs.

## 8. Risks (cross-cutting)

| Risk | Impact | Mitigation |
|---|---|---|
| `web.archive.org` unreachable from the build box | can't record from the IA, or test live text and live frames end-to-end here | D12/D20 record via arquivo.pt with honest provenance; all tests offline; stubbed replay in smoke; post-deploy checks in phase 20; STATUS follow-up to re-record from the IA |
| arquivo.pt replay quirks (top-frame redirect, never-firing `load`, live-web references, Ruffle injection) | broken or chrome-wrapped pictures, hung recorder, leaked requests | verified on 2026-10-20: harness iframe, quiet-or-cap wait, host allowlist, Ruffle blocked (D20) |
| Replay fidelity of old captures (missing CSS or images) | ugly or misleading pictures | `partial` status with an honest badge; never "fixed up"; link to the capture |
| Repository weight (pictures + verifier screenshots; phase 8 alone added 36 MB) | slow clones for an OSS repo | pictures <= 2.2 MB total (D21); verifier screenshots as WebP and only the listed files (D27); the hero GIF is capped at 3 MB |
| Copyright and trademarks in screenshots of third-party designs | takedown or attribution complaints | permissively licensed sample sites, top of page only, attribution in fixture, footer, README and `public/samples/README.md`; easy to remove a sample |
| Finance content visible in pictures (Wikipedia infobox) | hard-rule breach | `visualRedact` (D26), recorded note, verifier inspects contact sheets |
| IA framing policy or `if_` behaviour changes | live pictures blank | sandboxed frame + 8 s honest slow state + link-out; post-deploy curl check; Browser Rendering provider designed as a fallback (D25) |
| Live frames load many subresources from the IA | impolite load, user bandwidth | frame only after a 400 ms rest; pool <= 3; one neighbour preload after a 2 s rest; none in compare modes, under Save-Data, or during runs; no Worker proxying |
| Archived pages misbehaving in frames (frame-busting, popups, audio) | hijacked tab, noise | sandbox without top navigation or popups, `allow=""`, `inert` in compare modes |
| Node 20 on the box vs tooling needing Node 22+ | toolchain won't run | D2 |
| RAM (shared box; Chrome + workerd + Vite + recorder) | OOM, flaky verifies | one browser, smoke and recorders always clean up, `maxWorkers: 2`, no watch modes |
| Internet Archive rate limits / outages in production | slow or failed live runs | concurrency 2, backoff, `Retry-After`, global cooldown, immutable caching, clear UI |
| Workers free-plan CPU vs HTML extraction | 1102 errors on large pages | 2 MB cap, SAX parser, measured in phase 13 |
| Small-model summaries inaccurate | misleading one-liners | compact input, validation, "AI summary" label, rule fallback, the diff and the picture are always visible |
| Trivial-change heuristics wrong for some sites | noisy or empty timelines | eval set, moving baseline, "Show trivial edits", filmstrip still shows every look |
| Hero performance (pictures on first view) | slower first impression | static same-origin WebP, about 160 KB first-view budget, pre-render decode, explicit sizes, separate `data-visual-ready` budget |
| Crowding creeping back after the polish phase, or over-folding that hides what users need | a busy first view, or a "where did X go?" experience | Calm layout rules (section 4), `calm-audit` caps and `calm-inventory` in SV 8 for every UI phase from 17 on; crowding is a design FAIL; the focal picture must grow, not just stand alone |
| Scope creep beyond about 400 lines per phase (phases 1-8 ran at up to 2×) | slow reviews | the visual work is split into four PRs (D19); extras go to GOOD_FIRST_ISSUES.md |
