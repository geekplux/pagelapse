# Sample pictures

Pictures of the built-in samples' captures, shown by Pagelapse's visual pane. They are served as static files, so the first view stays offline and zero-network.

- **What they show:** the top of each archived page (a 1280×800 viewport, device pixel ratio 1), as replayed by [Arquivo.pt](https://arquivo.pt/). Each file is a screenshot of an archived capture, not of the live site. The page designs, logos and text belong to their authors.
- **How they were made:** `pnpm record:visuals` (`scripts/record-visuals.ts`) runs headless Chrome. It loads each capture's `mp_` replay in a frame of a local page, lets only arquivo.pt load, waits for the network to go quiet (at most 15 s), and screenshots the page. It works politely: one capture at a time, at least 5 s apart, with an identified User-Agent, and everything is cached so re-runs never reload a capture.
- **Files:** `<id>/<timestamp>-<hash>.webp` is 960×600 (≤ 64 KB) and `.thumb.webp` is 320×200 (≤ 8 KB). The names are content-hashed, so the files can be cached forever. Each fixture in `src/samples/<id>.json` records per capture whether the picture is `ok`, `partial` (the archive's copy is missing some styles or images) or `failed` (no picture).
- **Edits:** for the Wikipedia sample, infobox rows and paragraphs that state monetary figures were hidden before the screenshot. The fixture records how many elements were hidden in each capture. Nothing else was altered.
- **Licences:** the Wikipedia article is CC BY-SA (by Wikipedia contributors). The git-scm.com and rust-lang.org site sources are MIT-licensed (rust-lang.org is also available under Apache-2.0). Trademarks belong to their owners.
