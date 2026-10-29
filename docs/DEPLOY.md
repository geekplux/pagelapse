# Deploying Pagelapse

Pagelapse deploys as **one Cloudflare Worker with Workers Static Assets**, live at **https://pagelapse.geekplux.com**. The app, its fonts and the built-in sample pictures are static files: Cloudflare serves them without running the Worker. Only `/api/*` runs the Worker, which queries the Internet Archive, extracts text, caches in KV and writes AI summaries.

| Binding | Kind | What it does |
|---|---|---|
| `CACHE` | KV namespace | CDX listings (refreshed after 24 h, kept), extracted captures and summaries (kept), the archive cooldown flag, the daily AI counter, the Recently explored entries and block list |
| `UPSTREAM_LIMIT` | Rate limit | 20 uncached archive fetches per minute per visitor |
| `AI_LIMIT` | Rate limit | 10 summary batches per minute per visitor |
| `GALLERY_LIMIT` | Rate limit | 3 pages shared to Recently explored per minute per visitor |
| `AI` | Workers AI | one-line change summaries (production only; without it the app writes rule-based "auto summaries") |

## How the config is laid out

- **[`wrangler.jsonc`](../wrangler.jsonc) is production only.** There are no named environments, so `pnpm run build` (the Cloudflare Vite plugin writes `dist/pagelapse/wrangler.json`, which `wrangler deploy` reads through `.wrangler/deploy/config.json`) followed by a bare `npx wrangler deploy` deploys production with every binding, and prints no "multiple environments" warning. It declares the custom domain (`routes: [{ "pattern": "pagelapse.geekplux.com", "custom_domain": true }]`), so a deploy keeps the domain attached in the dashboard. `placement: { hostname: "web.archive.org" }` runs `/api/*` in the data center nearest the Internet Archive, where nearly every uncached request goes; static assets are still served from the location nearest the visitor.
- **`previews`** (in the same file) is what Workers Builds branch previews (`npx wrangler preview`) get, because previews do not inherit the top-level bindings: their own rate-limit counters (`namespace_id` 5101 and up), **no `CACHE`** and **no `AI`**. Without `CACHE` the Worker uses a small per-isolate memory cache (`memoryKv` in [`worker/cache.ts`](../worker/cache.ts)), so previews work and never touch production KV; without `AI` they write rule summaries (the daily AI cap is counted in KV, so previews stay off the model).
- **[`wrangler.local.jsonc`](../wrangler.local.jsonc)** is what `pnpm dev` uses (picked in [`vite.config.ts`](../vite.config.ts)): the same Worker without `AI` (Workers AI has no local mode and would ask for a login) and without the custom domain; KV is simulated locally. `pnpm preview` serves the production build with remote bindings off, so it needs no login either and writes rule summaries.

## Workers Builds (the Git integration)

The repository is connected to Workers Builds in the dashboard (**Workers & Pages > pagelapse > Settings > Build**):

| Setting | Value |
|---|---|
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler preview` |
| Root directory | `/` |

Every push to `main` deploys production; other branches get preview builds. No build variables are needed (no `CLOUDFLARE_ENV`).

## Prerequisites

1. A Cloudflare account. For a manual deploy from your machine, log in once: `pnpm exec wrangler login`.
2. The custom domain `pagelapse.geekplux.com` is attached in the dashboard (**Settings > Domains & Routes**) and declared in `wrangler.jsonc`. If you run your own copy, change or delete the `routes` line.
3. **The KV namespace.** Production caches in the KV namespace titled `PAGELAPSE_CACHE`, bound as `CACHE`; its id (`d1881ba046b74f8bbd26b6d7164f555f`) is set in the `kv_namespaces` line of `wrangler.jsonc`. A deploy failing with `KV namespace '…' is not valid [code: 10042]` means that id is wrong (the original placeholders were `<set-at-deploy>` and 32 zeros, `00000000000000000000000000000000`). If you recreate it, or run your own copy:

   ```sh
   pnpm exec wrangler kv namespace create PAGELAPSE_CACHE
   ```

   If wrangler offers to add the binding to the config, decline (it would add a second binding named after the title). Copy the printed `id` (32 hex characters) into the existing line instead:

   ```jsonc
   "kv_namespaces": [{ "binding": "CACHE", "id": "<the id wrangler printed>" }],
   ```

   Commit and push it to `main`. Leave `wrangler.local.jsonc` alone (its zeros are a local dummy). A KV id is not a secret, so committing it is fine. `scripts/deploy-config.test.ts` checks it is a non-zero 32-hex id.
4. Workers AI: nothing to create. If the dashboard has not been used for Workers AI before, open **AI > Workers AI** once and accept the terms. The rate-limit bindings need no setup (their `namespace_id`s only need to be unique within the account).

No secrets are needed: Pagelapse has no API keys. Never commit `.dev.vars`.

## Check without deploying

These need no account and no login:

```sh
pnpm install --frozen-lockfile && pnpm build && pnpm run check:deploy
```

`check:deploy` is `wrangler deploy --dry-run --outdir .wrangler/dry-run`: it bundles the Worker into `.wrangler/dry-run/`, lists the bindings (`CACHE`, `AI`, `UPSTREAM_LIMIT`, `AI_LIMIT`) and the upload size, and stops. Build metadata (`dist/client/.vite/`) is kept out of the upload by `public/.assetsignore`.

`pnpm build && pnpm preview` serves the production build locally, with the `public/_headers` security headers applied; remote bindings are off, so `AI` cannot be reached and summaries are rule-based.

## Deploy

Normally: merge to `main` and Workers Builds runs `pnpm run build`, then `npx wrangler deploy`. By hand, from the repository root, the same two steps:

```sh
pnpm build && pnpm exec wrangler deploy
```

`pnpm run deploy` runs them too. The site is served at https://pagelapse.geekplux.com (and at the `pagelapse.<subdomain>.workers.dev` host).

## Post-deploy checks

Set `SITE=https://pagelapse.geekplux.com` first.

1. **Health.** `curl -s "$SITE/api/health"` prints `{"ok":true,"version":"0.1.0","ai":"available"}`. `"ai":"unavailable"` means the `AI` binding is missing from `wrangler.jsonc` (or you are on a preview, which has none by design).
2. **Headers.** `curl -sI "$SITE/"` shows `content-security-policy` with `frame-src https://web.archive.org`, plus `x-content-type-options: nosniff`, `referrer-policy` and `permissions-policy`. `curl -sI "$SITE/samples/nasa/19970605230559-47f6dc29.webp"` shows `cache-control: public, max-age=31536000, immutable`.
3. **The first view.** Open `$SITE`. The hero shows at once, with the Wikipedia sample's captures dealt as a deck. Open the nasa.gov sample and try Slider, Side by side, Single and Play.
4. **A live run.** Paste `https://git-scm.com/` (a page that is not a built-in sample, so the run really asks the archive) and press Enter. Captures arrive one by one and the run ends with a timeline of changes, each with an "AI summary".
5. **The KV cache.** Start the same URL again: it finishes in a few seconds, because the listing and every capture come from KV. To confirm directly:

   ```sh
   curl -s -o /dev/null -w "%{time_total}s\n" "$SITE/api/snapshot?url=https%3A%2F%2Fgit-scm.com%2F&ts=20251218145830"   # first: archive fetch
   curl -s -o /dev/null -w "%{time_total}s\n" "$SITE/api/snapshot?url=https%3A%2F%2Fgit-scm.com%2F&ts=20251218145830"   # again: KV, much faster
   pnpm exec wrangler kv key list --binding CACHE --remote | head   # snap:v1:… keys
   ```

6. **The archive allows framing.** Live pictures are the Internet Archive's own replay in a sandboxed frame, so the archive must not forbid embedding:

   ```sh
   curl -sI "https://web.archive.org/web/20251218145830if_/https://git-scm.com/" | grep -iE "x-frame-options|content-security-policy"
   ```

   Expect no `X-Frame-Options` and no `frame-ancestors` that excludes other sites. If the archive ever starts sending them, the pane shows its slow state and the "Open capture" link-out still works; record it as an issue.
7. **The frame under our CSP.** In the live run from step 4, select a change and rest on it. The picture pane shows the archived page, and the browser console has no "Refused to frame" or other Content Security Policy errors.

## Live-demo links

The README, the [examples gallery](../examples/README.md) deep links, the page's canonical and Open Graph tags (`index.html`), `public/robots.txt` and `public/sitemap.xml` point at https://pagelapse.geekplux.com. If you deploy your own copy elsewhere, replace that origin in those files and in the `examples-deeplinks` regexes of `scripts/smoke-flows.ts`, then run `pnpm build && pnpm smoke --flows examples-deeplinks` (the flow opens each link's path on the local preview).

## Pre-warm the cache

A page whose captures are in KV opens without the Internet Archive, so it never meets the archive's rate limit. `pnpm prewarm` looks up the pages in `scripts/prewarm-urls.txt` (or `--urls <file>`) from your machine, politely (one request at a time, 3 s apart, cached in `.cache/prewarm/`), computes exactly what the Worker would store (`worker/keys.ts`), and writes `.cache/prewarm/kv-bulk.json`. Then upload it to production KV:

```sh
pnpm prewarm
pnpm exec wrangler kv bulk put --remote --binding CACHE .cache/prewarm/kv-bulk.json
```

Capture lists are refreshed by the Worker after 24 h, and kept if the archive refuses, so a warmed page stays fast. A 429 or a refused connection (the archive blocks an IP that asks too much) stops the run and writes what is done; run it again later and it resumes from its cache. A capture that times out or arrives broken is skipped, as the Worker would skip it.

## Recently explored

Visitors can list a page they have just looked up in "Recently explored" on the home page (`POST /api/gallery`). The Worker accepts only plain addresses (no query string) whose capture list and at least half of their sampled captures are already in KV, refuses a short list of finance and adult terms in the host, path and title, and limits sharing to 3 pages a minute per visitor. The home page lists the newest 12. When there are more, it links to the full list (`?explored`, served by `GET /api/gallery?all`, 60 entries a page).

Each entry carries its changes (where each meaningful change falls, drawn as dots on the card's years), computed from its cached captures when it is shared. Entries shared before they were stored show their years with a bare line until the page is shared again (`POST /api/gallery` with the same address fills them in and keeps the entry's place):

```sh
curl -X POST -H 'content-type: application/json' -d '{"url":"https://example.org/"}' https://pagelapse.geekplux.com/api/gallery
```

To remove a page or a whole site, add it to the block list, a JSON array of hosts (`example.org`, matched with or without `www.`) or full addresses, under the KV key `gallery:block`:

```sh
pnpm exec wrangler kv key put --remote --binding CACHE gallery:block '["example.org","https://other.example/page"]'
```

Blocked entries disappear from the listing within 5 minutes (its browser cache) and cannot be shared again. Their captures stay cached. To delete an entry outright, delete its `gallery:v1:*` key and its `gallery:url:*` pointer (`wrangler kv key list --remote --binding CACHE --prefix gallery:` lists them).

## Rollback

```sh
pnpm exec wrangler deployments list --name pagelapse
pnpm exec wrangler rollback --name pagelapse               # the previous version
pnpm exec wrangler rollback <version-id> --name pagelapse  # a specific one
```

A rollback changes code and static assets only. KV data stays; if an extraction change made cached captures wrong, bump `EXTRACTOR_VERSION` in [`src/core/extract.ts`](../src/core/extract.ts) (it is part of the snapshot cache key) and deploy again instead. To take the site down entirely: `pnpm exec wrangler delete --name pagelapse`.

## Costs and limits

Figures are Cloudflare's published limits at the time of writing; check the current Workers, KV and Workers AI limits pages before relying on them.

- **Workers Paid recommended.** Text extraction measured about **20 ms CPU warm and about 96 ms cold** on a 682 KB page. The free plan allows 10 ms of CPU per request, so large pages would fail there with error 1102. Small pages and everything static work on the free plan. Responses are capped at 2 MB and parsed with a streaming parser to keep CPU bounded.
- **Static files are free.** Requests for the app, fonts and sample pictures do not run the Worker and do not count against Worker request limits. The first view of a sample costs no Worker invocation at all.
- **Requests.** One fresh live run makes about 18 API requests (1 listing, up to 16 captures, 1-2 summary batches). A repeat of a cached page makes the same number of requests but no archive fetches.
- **KV.** A fresh page writes up to about 35 keys (listing, up to 16 captures, summaries, counters); a cached page only reads. The free plan's 1,000 writes per day is roughly 30 fresh pages a day; the paid plan raises it far beyond what this app needs. Captures are stored without expiry, so storage grows slowly with the number of distinct pages looked up.
- **Workers AI.** At most one model call per batch of up to 8 changes, each pair of captures summarised once and then cached. The app stops calling the model after **3,000 calls a day** (`DAILY_CAP` in [`worker/summarise.ts`](../worker/summarise.ts)) and falls back to auto summaries. The free daily Workers AI allocation covers typical use; lower the cap if you want to stay well within it.
- **Rate limits.** Per visitor: 20 uncached archive fetches and 10 summary batches per minute (`UPSTREAM_LIMIT`, `AI_LIMIT` in `wrangler.jsonc`). A 429 from the Internet Archive, or a refused connection (521, 522 or 523: the archive also turns Cloudflare's shared egress away this way), starts a cooldown for everyone, as long as its `Retry-After` and at least 60 seconds, during which only cached pages work. These protect the archive first; please do not raise them much.
- **Logs.** Workers Logs (`observability` in `wrangler.jsonc`) records requests, including the looked-up URL in the query string, as the README's privacy section says. Set `head_sampling_rate` lower, or `enabled: false`, to log less. The Worker also writes one JSON line per archive event, without the visitor or the looked-up URL; `kind` is `cdx` or `capture`. Filter on `event` in the dashboard (Workers, `pagelapse`, Observability), or run `pnpm exec wrangler tail pagelapse --format json`:
  - `archive_failure`: a failed attempt, with `status` (or `network`), the raw `retryAfter` header and `attempt`.
  - `archive_cooldown_start`: a 429 or a refused connection (`status`) started a cooldown of `cooldown` seconds; `retryAfter` null means the archive gave no hint and 60 s is the default; `streak` is how long the archive has refused so far.
  - `archive_cooldown_hit`: a visitor's request was turned away by the cooldown, `wait` seconds before it ends.
  - `archive_recovered`: the first success after a run of 429s, `after` seconds after it began. This is how long a real wait takes.
