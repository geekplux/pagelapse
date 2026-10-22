Drafts only. Nothing has been posted.

# Launch kit

Drafts for announcing Pagelapse, plus the facts to keep them honest. Replace `<demo>` with the live demo address once it is deployed. Every post leads with the visual scrub: it is what people share.

## Show HN

**Title:** Show HN: Pagelapse – watch a web page's decade in 15 seconds

**Post:**

> Watch a web page's decade in 15 seconds. Paste a URL and Pagelapse pulls the page's captures from the Internet Archive, keeps the ones where something meaningful changed, and lays them out as a time-lapse. Drag a divider between the looks before and after each change, play the years back, and read which words changed, with a one-line summary per change.
>
> The first view is a built-in sample (git-scm.com, 2013 to 2025) that works offline with no key. Live lookups go through a small Cloudflare Worker.
>
> Limits, honestly: it only sees what the archive captured, and at most 16 captures per page, so it can miss edits between captures. Archived copies sometimes lack styles, and the pane says so. The AI part is one optional line per change. Rules write it when no model is available.
>
> To be kind to the archive it fetches two captures at a time, caches everything, backs off on 429s and identifies itself.
>
> Demo: `<demo>` · Code (MIT): https://github.com/geekplux/pagelapse

## X post

```text
Watch a web page's decade in 15 seconds.

Pagelapse pulls Internet Archive captures of any URL, keeps the ones where something meaningful changed, and lets you drag between the before and after of each change.

Built-in samples work offline, no key. MIT.

https://github.com/geekplux/pagelapse
```

Attach `docs/hero.gif` (or the social preview, `assets/social-preview.png`). A test keeps the post within 280 characters, counting the link as 23 the way X does.

## Demo scenarios

Each one starts from the visual scrub.

### The fact-checker

Someone claims a project's home page "always said" something. Paste the URL, open the first change in Slider and drag the divider, then step with Next until the sentence appears. The text diff shows the exact words that came and went, and "View capture" opens that date in the archive, for a link anyone can check.

### The retrospective

A maintainer prepares a "ten years of our project" post. Open the project's home page and press Play: one capture every 1.2 s, with the release number climbing. Pick the three biggest markers on the timeline (the largest changes), compare each in Side by side, and copy the links into the post.

### Watch a redesign happen

Open the Wikipedia sample, choose the change from February 2022 to March 2023 and drag the divider: Wikipedia's 2022 design arrives, with the contents moving into a sidebar. Switch to Onion skin to fade one look into the other, then read the text diff to see that the words barely changed while the layout did.

## Comparison

Pagelapse looks back at the history the Internet Archive already holds. Each of these tools serves a different need, and several work well alongside it.

| Tool | Best for | Looks at the past | Pictures of the page | Alerts about future changes |
| --- | --- | --- | --- | --- |
| **Pagelapse** | Seeing how any page looked and changed over years, in a minute | Yes, from archive captures | Yes: recorded pictures for samples, the archive's replay for live pages | No |
| **The Wayback Machine's own Changes view** | Comparing two captures you choose, straight in the archive | Yes | The captures as archived | No |
| **Change monitors** (Visualping, changedetection.io) | Getting told when a page changes from now on | Only from when you start watching | Depends on the tool | Yes, that is their purpose |
| **Manual tab-by-tab diffing** | Full control over any captures and any detail | Yes | Yes, one tab per capture | No |
| **Wikipedia page history** | Exact edits of a Wikipedia article, with authors and comments | Yes, every edit | No, text diffs | Watchlists (with an account) |

Where Pagelapse fits: it picks the meaningful changes across a decade for you and puts the pictures and the text side by side. It does not replace a monitor (it has no alerts), and it cannot match Wikipedia's history for wiki articles, because it sees only the captures the archive made, not every edit.

## What we deliberately don't do

- **No monitoring or alerts.** Pagelapse looks back. A change monitor is the right tool for "tell me when this changes".
- **No accounts, cookies or analytics.** Nothing to sign up for, nothing to track.
- **No bulk crawling.** At most 16 captures per page, two at a time, cached, with backoff when the archive is busy.
- **No copies of archived pages.** The Worker stores extracted text, never raw HTML. Live pictures are the archive's own replay, loaded by your browser.
- **No AI on pictures, and no AI-written diffs.** A model writes one optional line per change. Rules write it when no model is available, and the label says which one wrote it.
- **No guessing between captures.** If the archive has no capture of a moment, Pagelapse cannot show it, and the timeline shows the gaps as they are.
