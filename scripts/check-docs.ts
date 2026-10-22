// Checks that every relative link and image in the README and the contributor docs resolves to a file in the
// repo, and every `#anchor` to a heading of its target (GitHub's slug rules). External links are not fetched:
// this runs inside the offline unit tests. Usage: node scripts/check-docs.ts (exits non-zero on a broken link).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOC_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'docs/DESIGN.md',
  'docs/EXTENDING.md',
  'docs/GOOD_FIRST_ISSUES.md',
  '.github/pull_request_template.md',
  'public/samples/README.md',
];

/** Lines outside fenced code blocks, with inline code spans blanked (links in code are not links). */
function prose(md: string): string[] {
  let fenced = false;
  return md.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line.replace(/`[^`]*`/g, (m) => (m.length > 2 ? 'x' : m));
  });
}

/** GitHub's heading anchor: lower case, punctuation dropped (but not `-`/`_`), spaces to `-`; repeats get -1, -2. */
export function slug(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function anchors(md: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  let fenced = false;
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const h = fenced ? null : /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (!h) continue;
    const base = slug(h[1]!);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

export function links(md: string): { target: string; line: number }[] {
  const out: { target: string; line: number }[] = [];
  prose(md).forEach((text, i) => {
    for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ target: m[1]!, line: i + 1 });
    for (const m of text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/g)) out.push({ target: m[1]!, line: i + 1 });
    for (const m of text.matchAll(/<(?:img|a)\s[^>]*(?:src|href)="([^"]+)"/g)) out.push({ target: m[1]!, line: i + 1 });
  });
  return out;
}

/** Every broken link in `files` (paths relative to `root`), as "file:line target: reason". */
export function checkDocs(root: string, files: string[] = DOC_FILES): string[] {
  const problems: string[] = [];
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
  for (const file of files) {
    if (!existsSync(join(root, file))) {
      problems.push(`${file}: missing`);
      continue;
    }
    for (const { target, line } of links(read(file))) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue; // https:, mailto: … are not checked offline
      const [path = '', anchor] = target.split('#');
      const rel = path ? (path.startsWith('/') ? path.slice(1) : join(dirname(file), decodeURI(path))) : file;
      const where = `${file}:${line} ${target}`;
      if (!existsSync(join(root, rel))) {
        problems.push(`${where}: no such file`);
        continue;
      }
      if (anchor === undefined) continue;
      if (!rel.endsWith('.md') || statSync(join(root, rel)).isDirectory()) problems.push(`${where}: anchor on a non-Markdown target`);
      else if (!anchors(read(rel)).has(decodeURIComponent(anchor))) problems.push(`${where}: no heading #${anchor}`);
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkDocs(resolve(import.meta.dirname, '..'));
  for (const p of problems) console.error(p);
  console.log(problems.length ? `check-docs: ${problems.length} broken link(s)` : `check-docs: ${DOC_FILES.length} files, all links resolve`);
  process.exit(problems.length ? 1 : 0);
}
