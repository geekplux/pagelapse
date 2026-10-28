# Changelog

All notable changes to Pagelapse are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pagelapse has not been released yet, so everything so far is under Unreleased.

## [Unreleased]

### Added

- **A gallery on the first view:** under the deck, every sample as a card with its latest picture, and "Recently explored": pages visitors looked up and chose to share with "Add to Recently explored" (plain addresses only, already cached, limited per visitor, with a block list), plus a credit to the Internet Archive's Wayback Machine. It loads only once it scrolls into view; the hero keeps three sample options and a "More pages" link.
- **`pnpm prewarm`:** looks a list of pages up from the maintainer's machine and writes exactly what the Worker would store, for `wrangler kv bulk put`, so those pages open without the archive.
- **Archive logs:** one JSON line per archive event in Workers Logs (failures with their `Retry-After`, cooldowns, how long a run of 429s lasted), without visitor or page addresses.
- **GeekPlux sample:** the home page of the author's site, geekplux.com (2014 to 2026: a blog theme, a minimal landing page, an About page, and two 2026 redesigns), recorded from the Internet Archive with pictures, without the blocks about money, pay or investing. `pnpm record:visuals` now pictures a sample from the archive its text came from.
- **Three more built-in samples:** the Wikipedia articles "Pluto" (2011 to 2026, before and after the 2015 New Horizons flyby) and "World Wide Web" (2008 to 2026), and the weather.gov home page (2009 to 2026), recorded from Arquivo.pt with pictures, with the same money-figure filtering as the others.
- Page-view counts on pagelapse.geekplux.com with Google Analytics: the path only, never the address you look up. Self-hosted copies load no analytics.
- **A first view that shows the idea at once:** the headline, the address field and one option per built-in sample, over a deck of the Wikipedia sample's captures dealt along their dates. Each card opens that capture, and opening grows the card into the stage (a 350 ms view transition). No `?sample=` or `?url=` in the address shows it; Back returns to it.
- **The workspace:** a 1200×750 stage with three compare modes (Slider, the default; Side by side; Single) and Before / After tags, a controls row (Play, previous and next change, the compare mode, Copy link), the time ribbon, the change section and "Every change".
- **The time ribbon:** a thumbnail per capture joined by a hairline to its date on a year axis, a bar per change sized by how much changed, hollow dots for trivial captures, and keyboard and drag scrubbing. It is one slider with a text alternative for screen readers.
- **The change section:** the change's two dates, its one-line summary and source, word counts, new, gone and renamed sections and archive links, beside a text diff with hanging `+` / `−` / `~` markers, underline and strike-through. A long diff shows its first changes with "Show n more changes".
- **Every change:** one row per meaningful change, newest first, with a line for the captures that only changed dates or counters and "Show them".
- **Built-in samples** that work offline: Wikipedia "Internet Archive" (the default and the first view's deck), the NASA home page (nasa.gov, 1997 to 2026) and the Creative Commons home page (creativecommons.org, 2009 to 2026), recorded from Arquivo.pt with pictures of each capture. All three are open-licensed or public, and both text and pictures leave out monetary figures. A config entry is offered only once its fixture is recorded ([docs/EXTENDING.md](docs/EXTENDING.md#add-a-sample-text-and-pictures)).
- **Live mode:** paste any URL to look it up in the Internet Archive. The run's progress (`n of N`, a bar) and Cancel take the title's meta line, captures arrive as text outlines and pending slots, and the selected capture shows the archive's own replay in a sandboxed frame, loaded only when you rest on it.
- **One-line summaries** of each meaningful change: Workers AI on a deployment (batched, cached per pair of captures, capped per day), with a labelled deterministic fallback.
- **Change detection:** readable-text extraction, a word-level diff, significance scoring and a trivial-edit filter (whitespace, dates, counters, tracking parameters), tuned against an evaluation set.
- **Shareable links:** the address keeps the sample or URL, the change, the capture and the compare mode.
- **Motion** from the design spec (deal, lift, open, select, play, arrive, menu), all off under reduced motion.
- **The design system:** Radix sand, cyan (Before) and amber (After) in light and dark, self-hosted Schibsted Grotesk and IBM Plex Mono, four type sizes, 0.5px hairlines, the Sun path logo; contrast and colour-vision-deficiency checks in the tests ([docs/DESIGN.md](docs/DESIGN.md)).
- **A Cloudflare Worker API** for captures, extracted pages and summaries, with caching, per-visitor rate limits and a global cooldown when the archive asks to slow down.
- **Deployment:** a production Wrangler config for Workers Builds with the custom domain pagelapse.geekplux.com, security headers (a Content Security Policy that allows only the archive's replay frames), long caching for hashed assets and sample pictures, and a dry run (`pnpm run check:deploy`). See [docs/DEPLOY.md](docs/DEPLOY.md).
- **Open-source packaging:** README, CONTRIBUTING, Code of Conduct (Contributor Covenant 2.1), security policy, issue and pull request templates, an extension guide ([docs/EXTENDING.md](docs/EXTENDING.md)), good first issues, an [examples gallery](examples/README.md), a social preview and a docs link check that runs with the tests.
- **A light / dark theme button** in the header (a moon or a sun, named for the switch it makes). The page follows the system theme until you pick the other one; the choice is remembered and applies before the first paint, and picking the system's theme again forgets it.
- **The toolchain:** React, Vite, TypeScript, Vitest, oxlint, headless-browser smoke tests, a calm-layout audit and size budgets.

### Changed

- **Live runs fetch the first and latest captures first,** then the middle of each gap, coarse to fine: the decade compare shows after one round (about 5 s instead of most of the run) and the timeline fills in evenly. AI summaries go only to changes no capture still to come can split.
- **Capture lists are kept for good:** refreshed after 24 h, and served as they are when the archive refuses or fails, so a page looked up once keeps opening.
- **The API runs next to the Internet Archive** (Workers placement by hostname), and `robots.txt` keeps crawlers off `/api/`.
- **The rate-limit card says what is happening:** the archive limits the shared cloud network Pagelapse runs on, sometimes for hours; pages looked up before and the samples still open.

- The redesign replaced the paper palette and serif type, the sample tabs (now options of the address field and the first view), the filmstrip and timeline (now the time ribbon), the side card and "Change details" (now the controls row and the change section) and the list of changes (now "Every change").
- Onion skin was removed; an old `view=onion` link opens Slider.
- Wikipedia "Internet Archive" replaced git-scm.com as the default sample; an unknown or unrecorded `?sample=` opens it.

### Removed

- The git-scm.com and rust-lang.org samples, replaced by NASA and Creative Commons. An old `?sample=git-scm` or `?sample=rust-lang` link opens the default sample.

### Fixed

- **The Internet Archive capture list is collapsed to one capture per month again.** It applies only the last of two `collapse` parameters, so the list held every distinct capture (18,640 rows instead of 273 for www.wikipedia.org) and long-lived pages ran past the 2 MB cap and failed.
- `pnpm smoke` and `pnpm render:social` find Chrome on macOS (or `CHROME_PATH`), like the recorders.

- The automatic summary no longer reports a section rename when one side is a number, a date or a count (on the Wikipedia sample, comparing the first capture with the latest read `Renamed section "40" to "2024 cyberattacks"`).

[Unreleased]: https://github.com/geekplux/pagelapse/commits/main
