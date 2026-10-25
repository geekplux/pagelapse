# Good first issues

Well-scoped starting points, each with the user value, where to start, and when it is done. Comment on (or open) an issue before you begin, so two people don't build the same thing. Every UI item must keep its view within the [calm layout caps](DESIGN.md#calm-layout-caps): put new controls where the user already chooses (the controls row, the address menu) or behind an existing disclosure, not onto the first screen.

1. **Space plays from anywhere.** *Value:* start and stop the time-lapse without hunting for the button, as the board's keys row promises ("Space play", `redesign/target/V3Work.html`). *Start:* `src/app/visual/usePlay.ts` and the keys in `src/app/AppFooter.tsx`; listen on the workspace, and ignore Space while focus is in a field, a button, a radio or the ribbon (they use it themselves). *Done when:* Space toggles Play outside controls, the keys row lists it, and screen readers hear the Play button's new name.

2. **1, 2 and 3 pick the compare mode.** *Value:* switch between Slider, Side by side and Single while looking at the picture. *Start:* `src/app/visual/ModePicker.tsx` and `visualState.ts` (`MODES`); the board's keys row shows "1 2 3 compare". *Done when:* the keys work outside text fields, phones (Slider and Single only) ignore the missing mode, the address keeps `view=`, and the footer lists the keys.

3. **Crossfade live replays.** *Value:* scrubbing a live run feels as smooth as a sample, instead of a frame popping in. *Start:* `src/app/visual/LiveFrame.tsx` and `useFramePool.ts`; samples already crossfade their pictures for 250 ms (DESIGN.md, Motion). *Done when:* the new frame fades in over the old one once it has loaded, never before, and reduced motion swaps at once.

4. **The stage outline column.** *Value:* while a live capture's replay loads, its text outline stays readable next to the stage, as in `redesign/target/V1Live.html`, instead of standing in for the picture. *Start:* `src/app/visual/Silhouette.tsx` and `LiveFrame.tsx`. *Done when:* it matches the board at 1440, phones keep the outline in the stage, and the calm caps still pass.

5. **Export the changes as Markdown.** *Value:* paste a page's history into notes, a ticket or a blog post. *Start:* a pure `toMarkdown(timeline)` in `src/core/` (dates, magnitude, summary and the capture links per change), offered beside the archive links in the change section. *Done when:* unit-tested, and it announces success the same way "Copy link" does.

6. **A side-by-side text diff.** *Value:* long rewrites are easier to read as two columns than as one interleaved column. *Start:* `src/app/diff/`; the word operations already hold both sides. *Done when:* the choice sits with the diff, phones keep one column, and the screen-reader text is unchanged.

7. **Jump to a year.** *Value:* go straight to "how did it look in 2016?" on long histories. *Start:* the time ribbon (`src/app/timeline/`) already draws a year axis and supports Page Up / Page Down for about a year; make a year label select the first change in that year. *Done when:* keyboard and pointer both work, and the labels are not new tab stops.

8. **Mask opening hours as trivial.** *Value:* shop and library pages stop reporting "changes" that are only this week's hours. *Start:* `src/core/normalize.ts`, and add labelled cases to `src/core/__eval__/cases/` first. *Done when:* the eval still passes at 90% or more and real changes (new days, new services) still count.

9. **Suggest a new built-in sample.** *Value:* more pages that tell a good story. *Start:* the [sample suggestion form](https://github.com/geekplux/pagelapse/issues/new?template=sample_suggestion.yml) and [EXTENDING.md](EXTENDING.md#add-a-sample-text-and-pictures). *Done when:* the page has 8 or more distinct captures, an open licence, no finance topics, and a visible redesign or rewrite.

10. **A print stylesheet.** *Value:* print or save as PDF the selected change and its text diff, for a report or an archive. *Start:* `@media print` in `src/design/`; hide the header controls and the time ribbon, keep the `+` / `−` marks. *Done when:* a printed page has the title, both dates, the summary and the diff, in black and white.

11. **A UI string table.** *Value:* the first step toward translations, and one place to edit copy. *Start:* move the user-facing strings from `src/app/` into one typed module, starting with the empty and error states. *Done when:* no visible text changes, and a test fails on a missing key.

12. **Zoom in the picture.** *Value:* read small print in an old capture without leaving the page. *Start:* `src/app/visual/`; in Single mode, a zoom toggle that shows a live replay frame at 100% scale (it is scaled down to fit today) or a sample picture at its full 960 px width, in a scrollable stage. *Done when:* it works by keyboard, respects reduced motion, and leaves the other compare modes as they are.

13. **Choose how many captures to sample (`?n=`).** *Value:* a quick look with 8 captures, or a closer one with 24. *Start:* the Worker already accepts `max` (2 to 24, default 16) on `/api/captures`; read `n` in `src/app/urlState.ts` and pass it through `src/app/live/api.ts`. *Done when:* links keep `n`, invalid values fall back to 16, and the progress count uses the real number.

14. **Show how many captures the archive holds.** *Value:* users see whether a page has 30 captures or 3,000, and how much the sample covers. *Start:* `/api/captures` already returns `totalCaptures`; show it in the live run's meta line (`src/app/live/`). *Done when:* the line reads, for example, "16 of 1,204 captures" and screen readers hear it once, not on every update.
