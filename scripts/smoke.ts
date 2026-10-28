// Headless smoke check: serves the built app with `vite preview` (Worker in workerd via the
// Cloudflare plugin; killed with the process group), drives the
// flows from smoke-flows.ts in system Chrome, writes screenshots and a JSON
// report, and always tears down the server and browser (even on SIGINT).
//
// Usage: pnpm build && pnpm smoke [--out dir] [--flows a,b] [--port 4173] [--cvd] [--format png|webp]
// --format webp encodes screenshots with Chrome's WebP encoder (quality 0.8), small enough for a pull request.
// --cvd also saves protan/deutan/tritan/gray screenshots for flows marked `cvd`.
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from 'playwright-core';
import { encodeWebp } from './lib/webp.ts';
import { CVD_VARIANTS, assertAxeClean, setCvdFilter } from './smoke-a11y.ts';
import { type FlowResult, flows as baseFlows } from './smoke-flows.ts';
import { calmFlows } from './smoke-calm.ts';
import { liveFlows, replayLog, summaryFlows } from './smoke-live.ts';
import { chromePath } from './lib/chrome.ts';

const flows = [...baseFlows, ...liveFlows, ...summaryFlows, ...calmFlows];

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
  /** The calm-layout audit's desktop size; only flows that ask for it run here. */
  wide: { width: 1440, height: 900 },
} as const;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    out: { type: 'string', default: 'docs/screenshots/latest' },
    flows: { type: 'string' },
    port: { type: 'string', default: '4173' },
    cvd: { type: 'boolean', default: false },
    format: { type: 'string', default: 'png' },
  },
});
if (values.format !== 'png' && values.format !== 'webp') throw new Error('--format must be png or webp');
const outDir = resolve(root, values.out);
const port = Number(values.port);
const baseUrl = `http://127.0.0.1:${port}/`;

let server: ChildProcess | undefined;
let browser: Browser | undefined;
let cleaning: Promise<void> | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** SIGTERM the server's process group, then SIGKILL it if still alive after 3 s. */
async function killServer(): Promise<void> {
  const pid = server?.pid;
  if (!pid || !groupAlive(pid)) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let waited = 0; waited < 3000 && groupAlive(pid); waited += 100) await sleep(100);
  if (groupAlive(pid)) {
    console.error(`smoke: preview group ${pid} ignored SIGTERM; sending SIGKILL`);
    process.kill(-pid, 'SIGKILL');
  }
}

function cleanup(): Promise<void> {
  cleaning ??= (async () => {
    // Playwright also SIGKILLs its Chrome process group on process exit.
    await Promise.race([browser?.close().catch(() => {}), sleep(5000)]);
    await killServer();
  })();
  return cleaning;
}

function exitAfterCleanup(code: number): void {
  void cleanup().finally(() => process.exit(code));
}
process.on('SIGINT', () => {
  console.error('smoke: SIGINT, cleaning up');
  exitAfterCleanup(130);
});
process.on('SIGTERM', () => {
  console.error('smoke: SIGTERM, cleaning up');
  exitAfterCleanup(143);
});
process.on('uncaughtException', (err) => {
  console.error('smoke: uncaught exception', err);
  exitAfterCleanup(1);
});
process.on('unhandledRejection', (err) => {
  console.error('smoke: unhandled rejection', err);
  exitAfterCleanup(1);
});

// `pnpm smoke` runs us as pnpm -> sh -c -> node. A SIGINT sent to pnpm alone
// is neither forwarded to us nor (on this box) makes pnpm exit, so it cannot
// be relied on. As a backstop, watch the launcher chain (Linux /proc) and clean
// up as soon as a launcher is gone (e.g. killed), instead of leaving orphans.
function parentOf(pid: number): number | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
  } catch {
    return undefined;
  }
}
function isGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH';
  }
}
const launchers = [process.ppid];
const grandparent = process.env.npm_lifecycle_event ? parentOf(process.ppid) : undefined;
if (grandparent && grandparent > 1) launchers.push(grandparent);
const watchdog = setInterval(() => {
  const gone = launchers.find(isGone);
  if (gone === undefined) return;
  clearInterval(watchdog);
  console.error(`smoke: launcher process ${gone} exited, cleaning up`);
  exitAfterCleanup(129);
}, 500);
watchdog.unref();

async function startServer(): Promise<void> {
  if (!existsSync(join(root, 'dist', 'client', 'index.html'))) {
    throw new Error('dist/client/ not found: run `pnpm build` first');
  }
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  // Same flags as `pnpm preview`, with the requested port. Detached = own
  // process group, so cleanup can kill the whole group.
  server = spawn(
    process.execPath,
    [viteBin, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: root, detached: true, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  console.error(`smoke: preview server pid ${server.pid} (process group) on ${baseUrl}`);
  let exited = false;
  server.once('exit', () => (exited = true));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error('preview server exited early (port in use?)');
    try {
      if ((await fetch(baseUrl)).status === 200) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error('preview server did not answer HTTP 200 within 30 s');
}

interface FlowReport extends FlowResult {
  flow: string;
  /** Archive replay frames answered by the local stub (live flows only). */
  stubbed: number;
  viewport: string;
  scheme: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  screenshot?: string;
}

async function main(): Promise<number> {
  const wanted = values.flows?.split(',').map((f) => f.trim()).filter(Boolean);
  const selected = wanted
    ? wanted.flatMap((name) => {
        // `calm-audit` names the group `calm-audit:*`.
        const group = flows.filter((f) => f.name === name || f.name.startsWith(`${name}:`));
        if (!group.length) throw new Error(`unknown flow "${name}" (known: ${flows.map((f) => f.name).join(', ')})`);
        return group;
      })
    : flows.filter((f) => !f.selfTest);

  mkdirSync(outDir, { recursive: true });
  await startServer();
  browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    // We own signal handling (cleanup above). --no-sandbox: this container
    // lacks the namespaces Chrome's sandbox needs.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--no-proxy-server'],
  });

  const blocked: string[] = [];
  const consoleErrors: string[] = [];
  const cspViolations: string[] = [];
  const reports: FlowReport[] = [];
  // public/_headers is served by the preview, so every flow runs under the deploy CSP; without it "0 violations" means
  // nothing, so a missing CSP fails the run.
  const csp = (await fetch(baseUrl)).headers.get('content-security-policy');
  if (!csp?.includes('frame-src https://web.archive.org')) consoleErrors.push(`CSP header missing or without frame-src on ${baseUrl}: ${csp}`);

  const runs = selected.flatMap((flow) => (flow.schemes ?? ['light']).map((scheme) => ({ flow, scheme })));
  for (const { flow, scheme } of runs) {
    for (const [viewport, size] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, { width: number; height: number }][]) {
      if (flow.viewports ? !flow.viewports.includes(viewport) : viewport === 'wide') continue;
      // One context at a time; each flow/viewport/scheme gets a clean one.
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: scheme, bypassCSP: !!flow.bypassCsp });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === 'data:' || url.protocol === 'blob:' || LOCAL_HOSTS.has(url.hostname)) {
          return route.continue();
        }
        blocked.push(url.href);
        return route.abort('blockedbyclient');
      });
      // Report every CSP violation by name (Chrome also logs most of them as console errors).
      await context.addInitScript(() =>
        document.addEventListener('securitypolicyviolation', (e) =>
          console.error(`CSP violation: ${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} (${e.sourceFile}:${e.lineNumber})`),
        ),
      );
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.text().startsWith('CSP violation:') || msg.text().includes('Content Security Policy')) cspViolations.push(`[${flow.name}/${viewport}/${scheme}] ${msg.text()}`);
        if (flow.apiErrors && msg.text().startsWith('Failed to load resource') && new URL(msg.location().url, baseUrl).pathname.startsWith('/api/')) return;
        if (msg.type() === 'error') consoleErrors.push(`[${flow.name}/${viewport}/${scheme}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => consoleErrors.push(`[${flow.name}/${viewport}/${scheme}] pageerror: ${err.message}`));

      const started = performance.now();
      const stubbedBefore = replayLog.length;
      const report: FlowReport = { flow: flow.name, viewport, scheme, ok: false, durationMs: 0, stubbed: 0 };
      try {
        Object.assign(report, await flow.run({ page, baseUrl, viewport, scheme }));
        // Let any animation or transition finish first, so neither the axe contrast check nor the
        // screenshot sees a picture or text mid-animation.
        await page.evaluate(() =>
          Promise.race([
            Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
            new Promise((resolve) => setTimeout(resolve, 3_000)),
          ]),
        );
        // Every flow ends with an axe pass on the state it left behind.
        report.notes = [...(report.notes ?? []), await assertAxeClean(page)];
        const base = `${flow.shot ?? flow.name}-${flow.widthTag ? size.width : viewport}${scheme === 'dark' ? '-dark' : ''}`;
        const file = join(outDir, `${base}${flow.suffix ?? ''}.${values.format}`);
        // Element shots get a 16 px margin of page around them.
        const box = flow.clip ? await page.locator(flow.clip).boundingBox() : null;
        const clip = box && { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: box.height + 32 };
        const shoot = async (path: string) => {
          const png = await page.screenshot({ fullPage: !flow.firstView, ...(clip && { clip }) });
          writeFileSync(path, values.format === 'webp' ? await encodeWebp(page, png, { quality: 0.8 }) : png);
        };
        await shoot(file);
        report.screenshot = relative(root, file);
        for (const variant of values.cvd && flow.cvd ? CVD_VARIANTS : []) {
          await setCvdFilter(page, variant);
          await shoot(join(outDir, `${base}-${variant}.${values.format}`));
        }
        report.ok = true;
      } catch (err) {
        report.error = err instanceof Error ? err.message : String(err);
      } finally {
        report.durationMs = Math.round(performance.now() - started);
        report.stubbed = replayLog.length - stubbedBefore;
        reports.push(report);
        await context.close();
      }
      console.error(`smoke: ${report.ok ? 'ok  ' : 'FAIL'} ${flow.name} (${viewport}, ${scheme}) ${report.durationMs} ms${report.error ? `: ${report.error}` : ''}`);
    }
  }

  const ok = reports.every((r) => r.ok) && blocked.length === 0 && consoleErrors.length === 0 && cspViolations.length === 0;
  const summary = {
    ok,
    baseUrl,
    outDir: relative(root, outDir),
    flows: reports,
    // Unmocked external requests (must be 0); stubbed replay frames are counted apart (samples: 0).
    blockedRequests: { count: blocked.length, urls: blocked },
    stubbedRequests: { count: replayLog.length, sampleFlows: reports.filter((r) => !r.flow.startsWith('live')).reduce((n, r) => n + r.stubbed, 0), log: replayLog },
    consoleErrors,
    // The CSP from public/_headers on `/`, and any violation under it (must be none).
    csp: { header: csp, violations: cspViolations },
  };
  writeFileSync(join(outDir, 'smoke-report.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  return ok ? 0 : 1;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  console.error('smoke:', err instanceof Error ? err.message : err);
} finally {
  await cleanup();
}
process.exit(code);
