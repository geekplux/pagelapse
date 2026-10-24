# Pagelapse design

This is the design direction every UI change is reviewed against, copied from section 4 of [the plan](PLAN.md#4-design-direction-the-archivists-proof-sheet) (D31). Keep the two in sync. "Calm layout" is binding: a pull request that crowds a view (more regions, tab stops, framed boxes, eyebrow labels or accent fills on the first screen than the caps below allow, or a second focal point) fails review. References such as "AC 44" or "D33" point to the acceptance criteria in [PLAN.md](PLAN.md) and the log in [DECISIONS.md](DECISIONS.md). The source of truth for colours is `src/design/palette.ts`, mirrored in `src/design/tokens.css`.

The identity mixes three familiar objects: an **archival index card** (warm paper, ink, catalogue numbers), a **proofreader's marked-up galley** (insertions and deletions in the margin), and a **photographer's contact sheet** (a strip of numbered frames with the selected one circled). The timeline reads like a **seismograph strip** laid across the years: a quiet baseline with marks where the page "moved". The filmstrip beneath it is the contact sheet of the page's looks. It is specific to this product: time, archives, edits, pictures of the past. It is not a dashboard template. There is no decorative 3D, no gradients-for-gradients'-sake and no glassmorphism.

## Typography (no external font CDN at runtime)

- **Display / wordmark / section headings:** *Fraunces*, self-hosted from `public/fonts/` (SIL OFL 1.1, licence file committed alongside). Static instances are subset to Latin: `Fraunces-SemiBold.woff2` (600, opsz about 72, SOFT 50) and `Fraunces-Italic.woff2` (400 italic, wordmark only), together <= 60 KB. Use `font-display: swap` and preload the first file. Fallback stack: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`. (Built in phase 2.)
- **Reading text (diff content):** `Charter, "Bitstream Charter", "Iowan Old Style", "Sitka Text", Cambria, Georgia, serif`.
- **UI chrome:** `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif`.
- **Timestamps, counts, frame numbers, code:** `ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace`, with `font-variant-numeric: tabular-nums`. Dates are shown as `2014·03·17`, with a full accessible date in `<time datetime>` and as visually hidden long-form text. Frame numbers are `#01`…`#14`.
- Scale: base 16 px / line-height 1.55. Modular ratio 1.25 (12.8, 16, 20, 25, 31.25, 39 px). Diff text measure is capped at 72ch.

## Colour (CSS custom properties; `src/design/palette.ts` is the source of truth, mirrored in `src/design/tokens.css`)

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

## Layout (the visual scrub is the hero)

*Rewritten in phase 17 to match what ships; "Calm layout" below has the rules and the caps.*

- **One measure:** header, content and footer share `min(100% − 2 × gutter, 84rem)`, with 16 px gutters on phones and 40 px from 640 px. No card or sheet frames the content: it sits on `--paper`, grouped by space and alignment.
- **Desktop (≥ 960 px):**
  - **Header (one row, wrapping when narrow):** the wordmark, the URL form (a quiet sentence-case label "See how any page changed" above the input and the solid-ink "Show changes"), then the sample toggles ("Try git-scm.com · Wikipedia: Internet Archive · rust-lang.org" as quiet text buttons).
  - **Hero:** the title (Fraunces 25 px) with one mono meta line (`14 captures · 2013–2025`), then two columns, 2 : 1 with a 40 px gap.
    - **Left (about two thirds): the picture** in its 16:10 mat (`--card`, 1 px `--rule-strong`, 8 px padding), Slider by default, with a one-line caption inside the mat: frame number(s), the date in Single, "Open capture ↗" in Single (one per print in Side by side), and the honest badges. At 1440×900 it is 869 px wide (60%) with its top at 170 px.
    - **Right: the selected change.** The change line (magnitude glyph and word, both dates, the summary in Charter 20 px with its quiet source label) top-aligned with the picture, and one controls row whose bottom edge meets the picture's: Play, `‹ Previous · 9 / 9 · Next ›`, "Compare: Slider ▾" (and the roving `− Before | + After` pair in Single), then "Change details ▸", which opens downward (the row grows below the picture; the controls row stays put).
    - **A live run's status line** (counter, determinate bar, Cancel; "Done: …" or "Start again" afterwards) tops the right column, above the change line, so on phones it sits directly under the picture.
    - Side by side needs the width: there the two prints span both columns and the selected change follows below them.
  - **Scrub strip (24 px below the hero; it is part of the focal point):** the filmstrip (thumbnails, the selected one with a 3 px ink outline on a 2 px paper gap and a caret); then the seismograph timeline; then "Key · 4 trivial hidden ▸" (the legend and "Show trivial edits").
  - **Below (40 px):** "All changes (9) ▸" and "All 14 captures ▸", then the diff panel ("What the text says, <dates>", "Structure · … ▸", "Diff key ▸", the 72ch diff), then the footer.
  - **Footer:** the tagline (the about line), the one-line Internet Archive credit, "About these captures ▸" (the sample's description and page link, text and picture provenance, licence, redaction and archive notes; for live runs, what a replay is), "Keyboard shortcuts ▸", and the GitHub link. It always starts below the first viewport (`main` is at least one viewport tall).
- **Phones (< 640 px):** one column in the same order: header (wordmark; form; short sample labels "git-scm · Wikipedia · Rust", each inside its full accessible name), title and meta, the picture at full width (top ≤ 280 px at 390×844), caption, change line, the controls row (Play and Previous / Next on one line), the scrub strip, the folded lists, the diff. Previous / Next sticks to the bottom of the screen only once its row has scrolled away above (its slot keeps its size, so nothing moves), and `scroll-padding-bottom` keeps focus clear of it. Side by side stacks Before above After.
- **640-959 px:** single column like phones, without the sticky bar.
- Pictures always keep their 16:10 box (explicit `width`/`height` and `aspect-ratio`), so nothing jumps when they load.

## Visual pane and compare modes

- **Single:** one picture (After by default). A two-button toggle `− Before | + After` (`aria-pressed`) flips sides without moving focus.
- **Side by side:** two mats with their own caption strips. At equal width on desktop; stacked on mobile.
- **Slider:** After is drawn over Before and clipped at the divider (`clip-path: inset(0 0 0 var(--split))`, set via CSSOM, which the deploy CSP allows). The divider is a 2 px `--ink` line with a 2 px `--card` halo. The handle is a 32 px `--card` circle with a `--ink` border and `‹ ›` chevrons. "− Before 2013·11·06" and "+ After 2025·12·18" labels are pinned to the top corners on `--card` chips. The handle starts at 50%.
- **Live frames** use the same modes. A 1280×800 frame is scaled into the mat with a CSS transform, so the archived page renders at desktop layout. In compare modes, frames are `inert` with `pointer-events: none`, and a note says "Comparing the top of each page". Single mode lets the user scroll the archived page.
- **Filmstrip:**
  - The selected frame has a 3 px `--ink` outline, a caret above it and `aria-current`.
  - Trivial captures are muted with `filter: grayscale(1) contrast(0.75)` *and* carry a hollow tick glyph and the word "trivial" in their caption.
  - Missing pictures are a dashed `--rule-strong` frame with "no picture".
  - The timeline tooltip shows the hovered capture's thumbnail (samples) or silhouette (live).
- **Silhouette** (live thumbnails and live loading placeholder): a deterministic sketch of the extracted page on `--card`. Title text in mono at the top, headings as thick `--ink-2` bars, paragraphs as hairline bars proportional to their length, list items as dotted bars. It reads as "a page", is honest about being derived from text, and is labelled "text outline" in its caption.

## Motion

- Selecting a change moves the selection ring in 150 ms ease-out. The diff panel and the picture cross-fade in 120 ms. On first render, markers draw in left to right with a stagger capped at 400 ms total. Live-run markers fade in as captures arrive (200 ms). The filmstrip scrolls the selected frame into view smoothly.
- The slider divider follows the pointer or keys directly (no easing). Play swaps one frame per 1.2 s with the 120 ms cross-fade.
- `prefers-reduced-motion: reduce` gives:
  - no stagger and no cross-fades;
  - instant ring moves and instant frame swaps (Play still steps on request);
  - `scroll-behavior: auto`.

  In every mode: no parallax, no looping animation, no auto-play, and nothing flashes. Play is user-started and pausable (WCAG 2.2.2). The progress indicator is a static text counter plus a determinate bar, not a spinner.

## Logo and wordmark for Pagelapse (SVG, `src/design/Logo.tsx` + `public/favicon.svg`; redesigned in phase 9)

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

## Polished states

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

## Calm layout (Sean's design direction, 2026-10-21; binding from phase 17 on)

The UI shows too much at once. These rules refine the proof-sheet concept above; they don't replace it. The same constraints still apply: CVD-safe palette, never colour alone, keyboard operable, reduced motion respected, no decorative 3D.

The planner drafted these rules; phase 17 confirmed them against its 1440/390 audit and amended a few (marked *Amended in phase 17*, listed at the end of this subsection and in DECISIONS.md), with review by the a11y-reviewer and the verifier. Keep this subsection in sync with the code. From phase 17 on, the verifier and the a11y-reviewer judge every UI phase against it, and crowding counts as a design FAIL.

**Product focal point.** The focal point is the **visual scrub**: the page itself, scrubbed along its timeline. The text diff and the compare modes are one step later.

### 1. One focal point per view

| View | The one focal point | Visible but secondary (smaller, `--ink-2`, quieter) | One step away (disclosure) |
|---|---|---|---|
| **Sample hero, desktop** (first load, ≥ 960 px) | The picture in Slider mode on the featured change. It is the largest element on screen, at least 58% of the viewport width at 1440, with its top no more than 220 px from the top of the page | The site title and one mono meta line (`14 captures · 2013–2025`). The change line: dates, magnitude word, summary and its source label. One controls group: Play, `‹ Prev · 9 / 9 · Next ›`, Compare, Change details; Compare and Change details wrap below Prev/Next. A one-line caption under the picture. The scrub strip (filmstrip on top of the timeline) starts in the first viewport | See the disclosure list below |
| **Sample hero, mobile** (< 640 px) | The same picture at full width (16 px gutters), with its top no more than 280 px from the top | A one-line caption (`#14 · 2025·12·18 · Open capture ↗`), the change line and the controls row. The sample switch is a single row of short text toggles ("git-scm · Wikipedia · Rust"; each accessible name contains its visible label) | The same list |
| **Other compare modes** (Single, Side by side) | The picture or pictures | As for the hero; the Before/After toggle only in Single | As for the hero |
| **Text diff** (scrolled to "What the text says") | The diff body (72ch) | The section heading with both dates, and Prev/Next | The Structure list (its summary gives counts, e.g. "Headings: 4 added, 3 removed, 1 renamed"), the "Diff key", and unchanged runs (already collapsed) |
| **Live, running** | The scrub strip filling in, with the progress line (counter, determinate bar, Cancel) at the top of the side column (directly under the pane on phones); at 1440×900 the thumbnails stay fully in view | The pane shows the selected capture's silhouette at reduced emphasis. No frame loads until the user picks a change (existing rule). Cancel is a quiet button | As for the hero |
| **Live, done** | The replay pane (Single mode) | As for the hero (no Play in live mode) | As for the hero |
| **Empty and error states** | The message: heading, one sentence and **one** primary action | The secondary action as a text link ("Open a sample"). For "no meaningful changes", the filmstrip stays visible so the looks can still be flipped through | Nothing else is drawn: no empty stage, timeline frame or filmstrip frame |
| **Invalid URL** | The inline field error | | |
| **Mobile live first view** | The pane or the progress | The sticky `‹ Prev · n / N · Next ›` bar appears only after the in-flow controls row has scrolled out of view, and it never covers the pane caption | |

### 2. What moves behind disclosure

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
  - The visible explanation ("14 captures, oldest first… Arrow keys…") becomes a hidden `#film-hint` paragraph, shipped as the **focused frame's** `aria-describedby="film-hint"` (the strip's one tab stop), so it is read when the strip gets focus.
  - A footer disclosure, **"Keyboard shortcuts"**, lists every key for the timeline, filmstrip, slider, Play, the Before / After toggle (Single) and the Compare picker.
- **Timeline:**
  - The legend (minor / moderate / major marks, trivial ticks) and "Show trivial edits" go behind **"Key · 4 trivial hidden"** (**"Timeline key"** when there are no trivial edits).
  - The trivial count stays visible in the summary text.
- **Changes list:**
  - It sits behind **"All changes (9)"**, closed on every width (it was open on desktop).
  - When open, it is a **single column** in chronological order, at most 72ch (this fixes the zig-zag).
  - It carries one list-level summary-source note (AC 9 carry-over).
  - "All N captures": every capture date as a link to the archive, closed by default.
- **Text diff:** the Structure list and the "Diff key", as in the table above.
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

### 3. First-load caps

These are measured by the smoke flow `calm-audit` at 1440×900 and 390×844. Regions are elements carrying `data-region="header|hero|scrub|text|changes|footer"`. The hero region holds the title, picture, caption, change line and controls row.

| Measure (first viewport, after `data-visual-ready`) | 1440×900 | 390×844 |
|---|---|---|
| Regions intersecting the viewport | ≤ 3 | ≤ 3 |
| Visible tab stops (roving groups count once; the skip links and the wordmark's home link excluded, *amended in phase 17*). The budget is the input, Show changes, 3 samples, slider handle (Slider) or Open capture (Single), Play, Prev, Next, Compare, Change details and the filmstrip | ≤ 13 | ≤ 12 |
| Framed boxes outside form controls and the picture mat (a border on 3 or more sides, a box-shadow, or a background other than `--paper`) | ≤ 2 | ≤ 2 |
| Visible eyebrow labels (uppercase mono section labels) | ≤ 2 | ≤ 1 |
| Solid accent fills (an element of at least 16×16 px with an `--ink` background) | ≤ 1 | ≤ 1 |

The same region cap applies to every audited state view.

### 4. Whitespace and rhythm: one spacing scale

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

### 5. Clear hierarchy, one accent

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

### Phase 17 amendments and how the measures are taken

- **Measures** (`scripts/smoke-calm.ts`): an element counts when it is visible and intersects the first viewport. Framed boxes are non-inline elements of at least 48×24 px with a border on 3 or more sides, a box-shadow, or a background other than `--paper`, outside form controls, `<summary>`, `.btn`, the picture mat and the filmstrip's frames. Eyebrows are the topmost uppercase mono elements with text. `calm-shots` is folded into `calm-audit`: every audit flow saves its first-view shot.
- **Tab stops** exclude the wordmark's home link, like the skip links (site chrome on every view; the drafted budget did not list it).
- **The compare pair's links:** in Slider the caption carries no links; "View capture" for Before and After are in Change details (AC 12, one step away). Single has "Open capture" in the caption; Side by side has one per print.
- **Before / After** is one roving tab stop (Left / Right move between the two radios (a radio group)), like the filmstrip, so a live run's first view stays within the budget with Cancel.
- **The sticky bar** is the in-flow Previous / Next itself, fixed to the bottom on phones once its row has scrolled away above; there is never a second copy of the buttons.
- **Header:** a visible quiet "Try" (above); the URL field keeps a visible sentence-case label.
- **Moved into "About these captures":** the sample's description and its page link (the hero's meta line is only `14 captures · 2013–2025`; the "Cat." number is dropped).
- **Structure** loses its `h4`: its summary ("Structure · headings: 4 added, 3 removed, 1 renamed") names it. The region headings (How it looked, the change, Filmstrip, Timeline, What the text says) stay as headings, `sr-only` where not shown.
- **Live:** the status line (counter, determinate bar, Cancel) tops the hero's side column, above the change line; on phones that is directly under the pane. With no side column (still looking up captures, or nothing meaningful changed) it follows the title. It used to caption the scrub strip, which put it below the first viewport on phones and cut the strip off at 1440×900 (verify round 1). It moves between the two places by remounting, so it carries focus across (Cancel keeps focus when the first change arrives). The timeline key follows the strip.
- **Change details** opens downward on desktop: the controls row is bottom-aligned to the picture only by the closed height; the open panel's height is added below the picture, so the summary and the rows above it stay put (smoke `calm-fit`: ≤ 2 px).
- **Text diff tab stops rise** from the baseline (1 → 4 at 1440, 5 → 6 at 390), within the caps: the Structure and Diff key summaries are new tab stops because those parts are now folded behind them (AC 1 disclosure list).
- **State cards:** the secondary action "Open a sample" is a text link (`.btn-link`), so each card has exactly one button-styled action.
- **Side by side** spans both hero columns on desktop; the selected change follows below.
- **The footer** always starts below the first viewport (`main` is at least one viewport tall), so a short state view shows only its message.

