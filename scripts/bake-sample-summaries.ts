// Optional: bakes Workers AI one-liners into the built-in samples (PLAN 5.5), so their first view can read "AI summary"
// offline. Same prompt, batching and validation as the Worker (worker/prompt.ts), through the REST API, with the
// credentials in .dev.vars only. Pairs already baked are skipped; a line that fails validation is left out (the app
// falls back to the rule summary). Without credentials it prints how to add them and exits 0.
// Usage: node scripts/bake-sample-summaries.ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeFixture } from './lib/fixtureFile.ts';
import { fixtureToSnapshots, parseSampleFixture } from '../src/core/fixture.ts';
import { buildTimeline } from '../src/core/timeline.ts';
import { MODEL, batches, messages, parseSummaries } from '../worker/prompt.ts';

const root = resolve(import.meta.dirname, '..');
const vars = existsSync(resolve(root, '.dev.vars')) ? readFileSync(resolve(root, '.dev.vars'), 'utf8') : '';
const read = (name: string) => new RegExp(`^${name}=(.+)$`, 'm').exec(vars)?.[1]?.trim();
const [account, token] = [read('CLOUDFLARE_ACCOUNT_ID'), read('CLOUDFLARE_API_TOKEN')];
if (!account || !token) {
  console.log(`No Workers AI credentials, nothing baked: samples keep their rule summaries ("auto summary").
To bake AI summaries, copy .dev.vars.example to .dev.vars and set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
(a token with the "Workers AI: Read" permission), then run this script again.`);
  process.exit(0);
}

const config = JSON.parse(readFileSync(resolve(root, 'src/samples/samples.config.json'), 'utf8')) as { id: string }[];
for (const { id } of config) {
  const file = resolve(root, `src/samples/${id}.json`);
  const fixture = parseSampleFixture(JSON.parse(readFileSync(file, 'utf8')));
  const summaries = { ...fixture.summaries };
  const todo = buildTimeline(fixture.url, fixtureToSnapshots(fixture)).entries.map((e) => e.record).filter((r) => !summaries[r.pair]);
  for (const batch of batches(todo)) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: messages(batch), temperature: 0.2, max_tokens: 48 * batch.length }),
    });
    const body = (await res.json()) as { success?: boolean; result?: { response?: string } };
    if (!res.ok || !body.success) throw new Error(`Workers AI answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    for (const s of parseSummaries(body.result?.response ?? '', batch)) {
      if (s.source === 'ai') summaries[s.pair] = { text: s.text, source: 'ai', model: MODEL };
    }
  }
  writeFixture(file, parseSampleFixture({ ...fixture, summaries }));
  console.log(`${id}: ${todo.length} asked, ${Object.keys(summaries).length} baked in all`);
}
