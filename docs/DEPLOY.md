# Deploying Pagelapse

Pagelapse deploys as **one Cloudflare Worker with Workers Static Assets**. The app, its fonts and the built-in sample pictures are static files: Cloudflare serves them without running the Worker. Only `/api/*` runs the Worker, which queries the Internet Archive, extracts text, caches in KV and writes AI summaries.

| Binding | Kind | What it does |
|---|---|---|
| `CACHE` | KV namespace | CDX listings (24 h), extracted captures and summaries (kept), the archive cooldown flag, the daily AI counter |
| `UPSTREAM_LIMIT` | Rate limit | 20 uncached archive fetches per minute per visitor |
| `AI_LIMIT` | Rate limit | 10 summary batches per minute per visitor |
| `AI` | Workers AI | one-line change summaries (production only; without it the app writes rule-based "auto summaries") |

The `AI` binding exists only in the `production` environment of [`wrangler.jsonc`](../wrangler.jsonc), because Workers AI has no local mode and would make `pnpm dev` and `pnpm preview` ask for a login. That is why every deploy builds with `CLOUDFLARE_ENV=production`: the Cloudflare Vite plugin then writes the production bindings into `dist/pagelapse/wrangler.json`, which `wrangler deploy` reads (through `.wrangler/deploy/config.json`).

## Prerequisites

1. A Cloudflare account with a `workers.dev` subdomain (the dashboard asks you to pick one the first time you open Workers & Pages).
2. Log in once: `pnpm exec wrangler login`.
3. Create the KV namespace and paste its id:

   ```sh
   pnpm exec wrangler kv namespace create CACHE
   ```

   Copy the printed `id` (32 hex characters) into `env.production.kv_namespaces[0].id` in `wrangler.jsonc`, replacing `<set-at-deploy>`. The top-level `CACHE` entry is only used by local dev and preview and can keep its placeholder. A KV id is not a secret, so committing it is fine.
4. Workers AI: nothing to create. If the dashboard has not been used for Workers AI before, open **AI > Workers AI** once and accept the terms. The rate-limit bindings need no setup (their `namespace_id`s only need to be unique within the account).

No secrets are needed: Pagelapse has no API keys. Never commit `.dev.vars`.

## Check without deploying

These need no account and no login:

```sh
CLOUDFLARE_ENV=production pnpm build && pnpm run check:deploy
```

`check:deploy` is `wrangler deploy --dry-run --outdir .wrangler/dry-run`: it bundles the Worker into `.wrangler/dry-run/`, lists the bindings (`CACHE`, `AI`, `UPSTREAM_LIMIT`, `AI_LIMIT`) and the upload size, and stops. Build metadata (`dist/client/.vite/`) is kept out of the upload by `public/.assetsignore`.

`pnpm build && pnpm preview` serves the production build locally, with the `public/_headers` security headers applied, and without the `AI` binding.

## Deploy

The exact command, from the repository root:

```sh
CLOUDFLARE_ENV=production pnpm build && pnpm exec wrangler deploy
```

`pnpm run deploy` runs the same two steps. Wrangler prints the URL, `https://pagelapse.<your-subdomain>.workers.dev`.

## Post-deploy checks

Set `SITE=https://pagelapse.<your-subdomain>.workers.dev` first.

1. **Health.** `curl -s "$SITE/api/health"` prints `{"ok":true,"version":"0.1.0","ai":"available"}`. `"ai":"unavailable"` means the build ran without `CLOUDFLARE_ENV=production`.
2. **Headers.** `curl -sI "$SITE/"` shows `content-security-policy` with `frame-src https://web.archive.org`, plus `x-content-type-options: nosniff`, `referrer-policy` and `permissions-policy`. `curl -sI "$SITE/samples/git-scm/20131106090756-302c3cea.webp"` shows `cache-control: public, max-age=31536000, immutable`.
3. **The first view.** Open `$SITE`. The git-scm.com sample shows at once, with its pictures. Try Slider, Side by side, Onion skin and Play.
4. **A live run.** Paste `https://git-scm.com/` and press Enter. Captures arrive one by one and the run ends with a timeline of changes, each with an "AI summary".
5. **The KV cache.** Start the same URL again: it finishes in a few seconds, because the listing and every capture come from KV. To confirm directly:

   ```sh
   curl -s -o /dev/null -w "%{time_total}s\n" "$SITE/api/snapshot?url=https%3A%2F%2Fgit-scm.com%2F&ts=20251218145830"   # first: archive fetch
   curl -s -o /dev/null -w "%{time_total}s\n" "$SITE/api/snapshot?url=https%3A%2F%2Fgit-scm.com%2F&ts=20251218145830"   # again: KV, much faster
   pnpm exec wrangler kv key list --namespace-id <your-kv-id> --remote | head   # snap:v1:… keys
   ```

6. **The archive allows framing.** Live pictures are the Internet Archive's own replay in a sandboxed frame, so the archive must not forbid embedding:

   ```sh
   curl -sI "https://web.archive.org/web/20251218145830if_/https://git-scm.com/" | grep -iE "x-frame-options|content-security-policy"
   ```

   Expect no `X-Frame-Options` and no `frame-ancestors` that excludes other sites. If the archive ever starts sending them, the pane shows its slow state and the "Open capture" link-out still works; record it as an issue.
7. **The frame under our CSP.** In the live run from step 4, select a change and rest on it. The picture pane shows the archived page, and the browser console has no "Refused to frame" or other Content Security Policy errors.

## Set the live-demo link

Once the site is up, point the docs at it (replace the origin with yours):

1. `README.md`: replace `_coming soon_` after **Live demo:** with `[pagelapse.<your-subdomain>.workers.dev](https://pagelapse.<your-subdomain>.workers.dev)`, and drop "A hosted live demo on Cloudflare" from the roadmap.
2. `examples/README.md`: the gallery's deep links start with `http://localhost:5173` so they work for anyone running the quick start. Swap the origin:

   ```sh
   sed -i 's#http://localhost:5173#https://pagelapse.<your-subdomain>.workers.dev#g' examples/README.md
   ```

3. `scripts/smoke-flows.ts`: the `examples-deeplinks` flow parses those links with two regexes that contain `http:\/\/localhost:5173`. Replace that part with the escaped new origin (`https:\/\/pagelapse\.<your-subdomain>\.workers\.dev`) in both, then run `pnpm build && pnpm smoke --flows examples-deeplinks` (the flow opens each link's path on the local preview).
4. `docs/LAUNCH.md`: fill in the demo link in the post drafts.

## Rollback

```sh
pnpm exec wrangler deployments list --name pagelapse
pnpm exec wrangler rollback --name pagelapse               # the previous version
pnpm exec wrangler rollback <version-id> --name pagelapse  # a specific one
```

A rollback changes code and static assets only. KV data stays; if an extraction change made cached captures wrong, bump `EXTRACTOR_VERSION` in [`src/core/extract.ts`](../src/core/extract.ts) (it is part of the snapshot cache key) and deploy again instead. To take the site down entirely: `pnpm exec wrangler delete --name pagelapse`.

## Costs and limits

Figures are Cloudflare's published limits at the time of writing; check the current Workers, KV and Workers AI limits pages before relying on them.

- **Workers Paid recommended.** Text extraction measured about **20 ms CPU warm and about 96 ms cold** on a 682 KB page (phase 13). The free plan allows 10 ms of CPU per request, so large pages would fail there with error 1102. Small pages and everything static work on the free plan. Responses are capped at 2 MB and parsed with a streaming parser to keep CPU bounded.
- **Static files are free.** Requests for the app, fonts and sample pictures do not run the Worker and do not count against Worker request limits. The first view of a sample costs no Worker invocation at all.
- **Requests.** One fresh live run makes about 18 API requests (1 listing, up to 16 captures, 1-2 summary batches). A repeat of a cached page makes the same number of requests but no archive fetches.
- **KV.** A fresh page writes up to about 35 keys (listing, up to 16 captures, summaries, counters); a cached page only reads. The free plan's 1,000 writes per day is roughly 30 fresh pages a day; the paid plan raises it far beyond what this app needs. Captures are stored without expiry, so storage grows slowly with the number of distinct pages looked up.
- **Workers AI.** At most one model call per batch of up to 8 changes, each pair of captures summarised once and then cached. The app stops calling the model after **3,000 calls a day** (`DAILY_CAP` in [`worker/summarise.ts`](../worker/summarise.ts)) and falls back to auto summaries. The free daily Workers AI allocation covers typical use; lower the cap if you want to stay well within it.
- **Rate limits.** Per visitor: 20 uncached archive fetches and 10 summary batches per minute (`UPSTREAM_LIMIT`, `AI_LIMIT` in `wrangler.jsonc`). A 429 from the Internet Archive starts a 60-second cooldown for everyone, during which only cached pages work. These protect the archive first; please do not raise them much.
- **Logs.** Workers Logs (`observability` in `wrangler.jsonc`) records requests, including the looked-up URL in the query string, as the README's privacy section says. Set `head_sampling_rate` lower, or `enabled: false`, to log less.
