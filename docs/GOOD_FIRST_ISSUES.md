# Good first issues

Well-scoped starting points, each with the user value, where to start, and when it is done. Comment on (or open) an issue before you begin, so two people don't build the same thing. Every UI item must keep its view within the Calm layout caps in [DESIGN.md](DESIGN.md): fold new controls behind an existing disclosure rather than adding to the first screen.

1. **Export the changes as Markdown.** *Value:* paste a page's history into notes, a ticket or a blog post. *Start:* a pure `toMarkdown(timeline)` in `src/core/` (dates, magnitude, summary and the capture links per change), plus a "Copy as Markdown" button next to "Copy link" in Change details. *Done when:* unit-tested, and the button announces success the same way "Copy link" does.

2. **A side-by-side text diff.** *Value:* long rewrites are easier to read as two columns than as one interleaved column. *Start:* `src/app/diff/`; the word operations already hold both sides. *Done when:* a "Diff layout" choice lives inside the "Diff key" disclosure, phones keep one column, and the screen-reader text is unchanged.

3. **Jump to a year.** *Value:* go straight to "how did it look in 2016?" on long histories. *Start:* the timeline already supports Page Up / Page Down for about a year; add year labels on the axis that select the first change in that year. *Done when:* keyboard and pointer both work, and the tab-stop cap is kept (the labels are not new tab stops).

4. **Mask opening hours as trivial.** *Value:* shop and library pages stop reporting "changes" that are only this week's hours. *Start:* `src/core/normalize.ts`, and add labelled cases to `src/core/__eval__/cases/` first. *Done when:* the eval still passes at 90% or more and real changes (new days, new services) still count.

5. **Suggest a new built-in sample.** *Value:* more pages that tell a good story. *Start:* the [sample suggestion form](https://github.com/geekplux/pagelapse/issues/new?template=sample_suggestion.yml) and [EXTENDING.md](EXTENDING.md#add-a-sample-text-and-pictures). *Done when:* the page has 8 or more distinct captures, an open licence, no finance topics, and a visible redesign or rewrite.

6. **A UI string table.** *Value:* the first step toward translations, and one place to edit copy. *Start:* move the user-facing strings from `src/app/` into one typed module, starting with the empty and error states. *Done when:* no visible text changes, and a test fails on a missing key.

7. **A print stylesheet.** *Value:* print or save as PDF the selected change and its text diff, for a report or an archive. *Start:* `@media print` in `src/design/`; hide the header controls and the filmstrip, open the diff, keep the `+` / `−` marks. *Done when:* a printed page has the title, both dates, the summary and the diff, in black and white.

8. **Choose how many captures to sample (`?n=`).** *Value:* a quick look with 8 captures, or a closer one with 24. *Start:* the Worker already accepts `max` (2 to 24, default 16) on `/api/captures`; read `n` in `src/app/urlState.ts` and pass it through `src/app/live/api.ts`. *Done when:* links keep `n`, invalid values fall back to 16, and the progress line uses the real count.

9. **Zoom in the picture pane.** *Value:* read small print in an old capture without leaving the page. *Start:* `src/app/visual/`; in Single mode, a zoom toggle that shows a live replay frame at 100% scale (it is scaled down to fit today) or a sample picture at its full 960 px width, in a scrollable mat. *Done when:* it works by keyboard, respects reduced motion, and leaves the compare modes as they are.

10. **Show how many captures the archive holds.** *Value:* users see whether a page has 30 captures or 3,000, and how much the sample covers. *Start:* `/api/captures` already returns `totalCaptures`; show it in the live status line (`src/app/live/`). *Done when:* the status line reads, for example, "16 of 1,204 captures" and screen readers hear it once, not on every update.
