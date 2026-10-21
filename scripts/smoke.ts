// Headless smoke check: serves the built app with `vite preview`, drives the
// flows from smoke-flows.ts in system Chrome, writes screenshots and a JSON
// report, and always tears down the server and browser (even on SIGINT).
//
// Usage: pnpm build && pnpm smoke [--out dir] [--flows a,b] [--port 4173] [--cvd]
// --cvd also saves protan/deutan/tritan/gray screenshots for flows marked `cvd`.
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from 'playwright-core';
import { CVD_VARIANTS, assertAxeClean, setCvdFilter } from './smoke-a11y.ts';
import { type FlowResult, flows } from './smoke-flows.ts';

const CHROME = '/usr/bin/google-chrome';
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
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
  },
});
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
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    throw new Error('dist/ not found: run `pnpm build` first');
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
    ? wanted.map((name) => {
        const flow = flows.find((f) => f.name === name);
        if (!flow) throw new Error(`unknown flow "${name}" (known: ${flows.map((f) => f.name).join(', ')})`);
        return flow;
      })
    : flows.filter((f) => !f.selfTest);

  mkdirSync(outDir, { recursive: true });
  await startServer();
  browser = await chromium.launch({
    executablePath: CHROME,
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
  const reports: FlowReport[] = [];

  const runs = selected.flatMap((flow) => (flow.schemes ?? ['light']).map((scheme) => ({ flow, scheme })));
  for (const { flow, scheme } of runs) {
    for (const [viewport, size] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, { width: number; height: number }][]) {
      if (flow.viewports && !flow.viewports.includes(viewport)) continue;
      // One context at a time; each flow/viewport/scheme gets a clean one.
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: scheme });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === 'data:' || url.protocol === 'blob:' || LOCAL_HOSTS.has(url.hostname)) {
          return route.continue();
        }
        blocked.push(url.href);
        return route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[${flow.name}/${viewport}/${scheme}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => consoleErrors.push(`[${flow.name}/${viewport}/${scheme}] pageerror: ${err.message}`));

      const started = performance.now();
      const report: FlowReport = { flow: flow.name, viewport, scheme, ok: false, durationMs: 0 };
      try {
        Object.assign(report, await flow.run({ page, baseUrl, viewport, scheme }));
        // Every flow ends with an axe pass on the state it left behind.
        report.notes = [...(report.notes ?? []), await assertAxeClean(page)];
        const base = `${flow.shot ?? flow.name}-${viewport}${scheme === 'dark' ? '-dark' : ''}`;
        const file = join(outDir, `${base}${flow.suffix ?? ''}.png`);
        // Let the sheet's `settle` fade (and any transition) finish so images are not mid-animation.
        await page.evaluate(() =>
          Promise.race([
            Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))),
            new Promise((resolve) => setTimeout(resolve, 3_000)),
          ]),
        );
        // Element shots get a 16 px margin of page around them.
        const box = flow.clip ? await page.locator(flow.clip).boundingBox() : null;
        const clip = box && { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: box.height + 32 };
        const shoot = (path: string) => page.screenshot({ path, fullPage: true, ...(clip && { clip }) });
        await shoot(file);
        report.screenshot = relative(root, file);
        for (const variant of values.cvd && flow.cvd ? CVD_VARIANTS : []) {
          await setCvdFilter(page, variant);
          await shoot(join(outDir, `${base}-${variant}.png`));
        }
        report.ok = true;
      } catch (err) {
        report.error = err instanceof Error ? err.message : String(err);
      } finally {
        report.durationMs = Math.round(performance.now() - started);
        reports.push(report);
        await context.close();
      }
      console.error(`smoke: ${report.ok ? 'ok  ' : 'FAIL'} ${flow.name} (${viewport}, ${scheme}) ${report.durationMs} ms${report.error ? `: ${report.error}` : ''}`);
    }
  }

  const ok = reports.every((r) => r.ok) && blocked.length === 0 && consoleErrors.length === 0;
  const summary = {
    ok,
    baseUrl,
    outDir: relative(root, outDir),
    flows: reports,
    blockedRequests: { count: blocked.length, urls: blocked },
    consoleErrors,
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
