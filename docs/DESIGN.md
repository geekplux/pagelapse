# Pagelapse design (v3)

The v3 design boards are kept in [redesign/target/](redesign/target/) as static HTML (`V3*.html`, open them in a browser) and as screenshots ([redesign/target/shots/](redesign/target/shots/)). `V1Live.html` is the reference for the live-run state and `V1System.html` for the logo (option A, Sun path) and colour swatches. When this spec and a board disagree, the board wins for looks and this spec wins for behaviour.

## Binding UI rules

1. Never use the middle dot "·" as a copy separator.
2. No redundant explanatory text.
3. Copy is clear, plain and sized to its job; no filler, no coined words.
4. Every colour comes from Radix Colors and follows its 12-step roles (1-2 backgrounds, 3-5 component backgrounds, 6-8 borders, 9-10 solids, 11-12 text).
5. Optical alignment; nested radii are concentric (outer = inner + padding).
6. Lines and borders are 0.5px.
7. Minimal transitions, ease-out, 250 ms base.
8. At most four font sizes: 12, 14, 20, 40. Hierarchy comes from weight, colour and space.
9. Fewer decisions for the user; choices sit where the user already means to choose.
10. No casual radius or shadow; no card with a coloured left stripe.
11. No habitual eyebrows or overlines above headings.

Plus the repo's own rules: never colour alone (cyan/amber always come with a word, a ring/dot or a −/+), CVD-safe, keyboard-operable, reduced motion respected, no third-party requests (fonts are self-hosted).

## Tokens

- Ground: light `#fff` (`--bg`), dark Radix sand-1. Pictures sit on `--frame` (light `#fff`, dark sand-2).
- Radix sand (neutral: text, hairlines, controls), cyan (Before: the older capture, removed words), amber (After: the newer capture, added words, the selected change). Light and dark scales as in `redesign/target/V3Work.html` (`.pl.light` / `.pl.dark` blocks). On white, amber marks use amber-11 (amber-9 fails 3:1).
- Type: Schibsted Grotesk 400/500/600/700 (UI and text), IBM Plex Mono 400/500 (dates, numbers, keys). Self-host woff2 (latin) under `public/fonts/` with their OFL. Sizes 12/16, 14/20, 20/28, 40/48 (40 has -0.025em tracking). `font-variant-numeric: tabular-nums` only on numeric spans, never on running text (it widens commas in Schibsted).
- Radii: 4 (thumbnails, tags), 6 (inner segmented buttons, tags on pictures, cards in the hero deck), 8 (buttons, fields, the stage, outer segmented), 12 (menus). Shadows only where a layer sits over a picture or over other layers (stage tags, divider knob, deck cards, menu).
- Hairlines 0.5px sand-6/7/8.

## Page structure

One page, two states. No separate landing page and no sample tabs.

1. **Hero** (no `?sample=`/`?url=` in the address): header (logo + wordmark, theme button, GitHub icon); centred 40px headline "See how any web page changed over the years", 20px lede, 48px address field with "Show its history", then "Or open a sample" with an option button for each of the first three samples and a "More pages" link down to the gallery. Under it the **deck**: every capture of the default hero sample (Wikipedia) as a card whose left edge sits at its capture date (latest whole on the right with a "Latest" tag), a year axis with a bar per meaningful change under the slivers, and a one-line caption. Under the deck, below the first viewport, the **gallery**: "Samples" (every sample as a card: its latest picture's thumbnail, name, host, years and captures), "Recently explored" (pages visitors shared, as text cards: title, address, years and captures; loaded only when the gallery scrolls into view) and the credit to the Internet Archive's Wayback Machine. Footer.
2. **Workspace** (a sample or a URL is open): header with the address field (holds the page address; focusing it opens a menu listing the samples, current one checked), the theme button and the GitHub icon. Title = sample label (live: the host), meta line (captures, span, changes, trivial edits hidden, "Sample" tag). Stage 1200x750, controls, time ribbon, change section, "Every change", footer.

## Components

- **Theme button** (header, before the GitHub icon, same 40px target and 20px icon): a moon while light shows, a sun while dark shows, named "Switch to dark theme" / "Switch to light theme", no text. The page follows the system until a click picks the other theme (stored in localStorage, applied before first paint by `public/theme.js`); picking the system's theme again clears it. No transition beyond the existing colour fades.

- **Stage**: Slider (default), Side by side, Single. Onion skin is removed. Phone offers Slider and Single. Before/After tags on the picture: ring dot + "Before" in cyan-11 + mono date; filled dot + "After" in amber-11 + mono date. Divider: 3px white line with a 0.5px dark outline, 40px round knob with chevrons.
- **Controls row**: Play (line button), previous/next change with "Change n of N" (or "First and latest"), segmented compare control, "Copy link" flush right.
- **Time ribbon**: thumbnails evenly spaced (16:10, radius 4); a 0.5px hairline bends from each thumbnail down to its real date on a year axis; each meaningful change is a 3px bar whose height is 6 + sqrt(score) x 38; a trivial capture is a hollow dot; the first capture a filled dot. Selected pair: cyan ring on the Before thumbnail, amber ring on the After one, their hairlines in cyan/amber, the bar in amber-11, the span between them shaded sand-3 with a cyan line at its start. Hover a thumbnail: lifts 2px.
- **Change section**: left column 352px (Before/After dates, 20/600 summary with curly quotes, "Auto summary"/"AI summary" tag, facts: Words +n −n, New sections, Gone, Renamed, archive links), 96px gap, right column the text diff. Diff markers (+ − ~) hang 28px outside the column; added rows amber-2, removed rows cyan-2 with sand-11 text, word-level ins = amber-4 + underline amber-11, del = cyan-3 + line-through cyan-11. Lines max 680px. Unchanged runs collapse to "Show n unchanged blocks".
- **Every change**: one row per change (date range in mono, magnitude bar + word, summary), newest first, selected row sand-2, hover sand-2. Table padding hangs 12px outside the column. Last row: "n captures only changed dates or counters." + "Show them".
- **Footer**: logo + name, one paragraph ("Captures come from the Internet Archive. No accounts; page views are counted, never the pages you look up.", then "Source on GitHub", then a 12px muted "Live AI summaries are capped per day; samples always work." whose cap is `DAILY_CAP` in worker/summarise.ts), keyboard keys (workspace only), and "Made by GeekPlux": geekplux.com first, then Vert, Explorable, Reasontrail, markvis.
- **Live run**: meta line "Reading captures from the Internet Archive", "n of N", a 2px progress bar; the stage shows the selected capture's text outline while its replay loads; thumbnails are text outlines; pending captures are empty sand-2 slots (`redesign/target/V1Live.html`).
- **Add to Recently explored** (live run, done): a text button at the end of the meta line; once pressed it becomes "Added to Recently explored" (a status), or the Worker's reason it was refused. Only for a page address without a query string.
- **Logo**: option A Sun path (`redesign/target/V1System.html`): rounded square, night-to-dusk gradient, five sun dots arcing cyan to amber, horizon line. Logos are exempt from the UI rules.

## Motion (redesign/target/V3Motion.html)

| Motion | Trigger | Spec |
|---|---|---|
| Deal | Hero, once on load | Cards slide out from under the latest to their dates, 450 ms ease-out, 35 ms apart, newest first; then change bars grow from the axis, 250 ms ease-out |
| Lift | Hover/focus a deck sliver | Card rises 12px, its date shows above it, its bar turns amber, 250 ms ease-out |
| Open | Click a deck card or a sample | Shared-element view transition from the card to the stage, hero text fades, the field settles into the header, 350 ms ease-out; falls back to an instant swap without View Transitions |
| Divider | Slider | Follows the pointer 1:1; arrow keys move 5% steps with 250 ms ease-out; a new change resets it to 50% |
| Select | Ribbon, list, keys | Span band and hairlines move, 250 ms ease-out; pictures crossfade 250 ms; diff swaps at once |
| Play | Play / Space | Single mode, 250 ms crossfade, 1.2 s hold, playhead slides linearly |
| Arrive | Live run | Outline fades in 250 ms; bar grows when scored; progress bar eases |
| Menu | Focus the address field | Opacity + 4px rise, 150 ms ease-out; closes instantly |

`prefers-reduced-motion: reduce` turns every animation and transition off.

## Calm layout caps

One focal point per view: the stage in the workspace, the deck in the hero. The smoke flow `calm-audit` measures the first viewport of each view at 1440×900 and 390×844 (after `data-visual-ready`), and a view over a cap fails review:

| Measure | 1440×900 | 390×844 |
|---|---|---|
| Regions (`data-region`: header, hero, scrub, text, changes, footer) in the viewport | ≤ 3 | ≤ 3 |
| Visible tab stops (a radio group counts once; skip links and the wordmark's home link excluded) | ≤ 13 | ≤ 12 |
| Framed boxes outside controls and the stage (a border on 3 or more sides, a shadow, or a filled background) | ≤ 2 | ≤ 2 |
| Eyebrow labels (uppercase mono) | ≤ 2 | ≤ 1 |
| Solid sand-12 fills of 16×16 px or more (the one primary action) | ≤ 1 | ≤ 1 |

New controls go where the user already means to choose (the address menu, the controls row) or behind an existing disclosure, not onto the first screen.

## Samples

Wikipedia: Internet Archive is the default and the hero deck. The options come from `src/samples/samples.config.json`, in its order, and only entries with a recorded fixture are offered: a hero option, an address-menu item or a `?sample=` link to an unrecorded entry never appears (the link opens the default). Today the options are Wikipedia, NASA and Creative Commons, in that order. The hero shows the first three as options; the gallery shows them all.

NASA (nasa.gov, US government work) and Creative Commons (creativecommons.org, CC BY 4.0) replaced git-scm.com and rust-lang.org: all three samples are open-licensed or public, with the same money-figure filtering in text and pictures. NASA opens on its 2000 to 2008 redesign, Creative Commons on its 2022 to 2023 one. Recording needs network access to the archives ([EXTENDING.md](EXTENDING.md#add-a-sample-text-and-pictures) has the steps).
