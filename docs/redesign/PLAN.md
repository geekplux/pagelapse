# Pagelapse redesign: implementation plan

Goal: ship the approved v3 design (`docs/DESIGN.md`, `docs/redesign/target/`) without losing any working feature (samples offline, live lookups, compare, play, text diff, summaries, shareable links, keyboard, screen-reader text, light/dark).

## Process (Sean's build process, speed mode)

- One phase = one PR, stacked: each phase branch starts from the previous phase's branch and its PR targets that branch. Phase 1 targets `main`.
- Branches: phase 1 `claude/project-thread-jw5zc1`, later `claude/project-thread-jw5zc1-<n>-<slug>`.
- Per phase: an implementer builds it and commits; a verifier (never edits feature code) runs `pnpm check` (lint, typecheck, tests, build), a headless-browser pass of the flows the phase touched (light and dark at 1440, plus 390 when layout changed) against the target boards, and every acceptance criterion; FAIL lists exact problems; the implementer fixes them; a second review. Exactly two review rounds, then the PR goes up with any open item under "Known gaps".
- PR body: What / why, How verified (commands, results, rounds), Screenshots (1-2 WebP per phase under `docs/screenshots/redesign-<n>/`, before/after where useful), Known gaps.
- Never merge, never deploy. Tests are updated when behaviour changes on purpose, never skipped or deleted to get green.

## Phases

### 1. Foundations: tokens, fonts, logo, header and footer
- Replace the paper palette and Fraunces/Charter with Radix sand/cyan/amber tokens (light + dark), self-hosted Schibsted Grotesk and IBM Plex Mono (woff2 + OFL), the 12/14/20/40 scale, 0.5px hairlines, radii and focus ring from DESIGN.md. Remove fonts no longer used.
- Logo A (Sun path) as `Logo.tsx` + favicon; wordmark "Pagelapse" 20/700.
- Footer per DESIGN.md (Made by GeekPlux: geekplux.com, Vert, Explorable, Reasontrail, markvis; keys row).
- Update the palette/CVD tests to the new tokens.
- Acceptance: the existing workspace renders in the new tokens and type in light and dark without layout breakage; no request leaves the origin for fonts; contrast and CVD tests pass; `pnpm check` green.

### 2. Hero state and samples as options
- No `?sample=`/`?url=` → hero (headline, lede, 48px field, "Or open a sample" options, the deck, caption). A sample option or a submitted address → workspace (URL updated as today; Back returns to the hero).
- Deck: Wikipedia captures dealt along time, Latest tag, axis + bars, deal animation, hover/focus lift with date and amber bar, each card a button that opens that capture in the workspace.
- Workspace header: the address field holds the current page; focusing it shows the samples menu (current one checked). Remove the sample tabs.
- Acceptance: matches `target/V3Hero*.html`, `target/V3Menu.html`, `target/V3HeroPhone.html`; keyboard: Tab reaches field, button, options, each deck card; deep links still open their sample or URL directly.

### 3. Workspace stage and controls
- Title block (label, meta, Sample tag), stage 1200x750 with Slider / Side by side / Single (onion skin removed, URL `view=onion` falls back to slider), Before/After tags, divider and knob, controls row (Play, previous/next with "Change n of N", segmented control, Copy link).
- Acceptance: matches the top of `target/V3Work.html`; divider by pointer and arrows; Play still works.

### 4. Time ribbon
- Replace filmstrip + timeline with the ribbon (thumbnails, hairlines to true dates, bars, trivial dots, selected span and rings, years). Keep it a keyboard slider with the current text alternative.
- Acceptance: matches the ribbon in `target/V3Work.html` for Wikipedia and git-scm; clicking a thumbnail or a bar selects; arrow keys move.

### 5. Change section, diff, every change
- Two-column change section, restyled diff with hanging markers, "Every change" table with the trivial line, "Show them".
- Fix the rule summary that names a heading by a number (Wikipedia first-to-latest compare reads `Renamed section "40" to "2024 cyberattacks"`): a rename needs both texts to be headings that look like titles; add a test.
- Acceptance: matches the lower half of `target/V3Work.html`; the summary bug has a failing-then-passing test.

### 6. Live run, phone, motion
- Live meta + progress bar, outline thumbnails and stage outline, pending slots (`target/V1Live.html`).
- Phone layouts (`target/V3HeroPhone.html`, `target/V3WorkPhone.html`).
- Motion table from DESIGN.md (open view transition, select, play, arrive, menu); reduced motion off switch.
- Acceptance: 390px has no horizontal scroll; reduced-motion run shows no animation; live flow smoke passes against the mocked archive.

### 7. Samples and docs
- Wikipedia is the default and the hero deck. Add NASA and Creative Commons entries to the sample config with licences/attribution, guarded so unrecorded samples are not offered; document the recording command for Sean. Update README hero image and screenshots, CHANGELOG.
- Acceptance: options show only recorded samples; docs check passes.
