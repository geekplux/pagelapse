import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOC_FILES, anchors, checkDocs, links, slug } from './check-docs.ts';
import { type Yaml, parseYaml } from './lib/yamlLite.ts';

const root = resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
type Obj = Record<string, Yaml>;
const isObj = (v: Yaml | undefined): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

describe('docs links (check-docs)', () => {
  it('every relative link and anchor in the README and docs resolves', () => {
    expect(checkDocs(root)).toEqual([]);
  });

  it('follows GitHub heading slugs and skips code', () => {
    expect(slug('Try it in 10 seconds')).toBe('try-it-in-10-seconds');
    expect(slug('Where AI is used (and where it is not)')).toBe('where-ai-is-used-and-where-it-is-not');
    expect(slug('`pnpm size` & budgets')).toBe('pnpm-size--budgets');
    expect([...anchors('# A\n## A\n```\n# not\n```')]).toEqual(['a', 'a-1']);
    expect(links('[x](a.md) `[y](b.md)`\n```\n[z](c.md)\n```').map((l) => l.target)).toEqual(['a.md']);
  });

  it('reports a missing file, a missing heading and a missing doc', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-docs-'));
    writeFileSync(join(dir, 'b.md'), '# Real heading\n');
    writeFileSync(join(dir, 'a.md'), '[ok](b.md#real-heading) [web](https://example.org/x.md) [gone](c.md) [nope](b.md#nope) [self](#top)\n# Top\n');
    try {
      expect(checkDocs(dir, ['a.md', 'z.md'])).toEqual(['a.md:1 c.md: no such file', 'a.md:1 b.md#nope: no heading #nope', 'z.md: missing']);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('README first screen', () => {
  const top = read('README.md').split('\n').slice(0, 20).join('\n');
  it('has the pitch, the hero picture and the try-it path', () => {
    expect(top).toContain('scrub through a decade of any web page');
    expect(top).toMatch(/!\[[^\]]{20,}\]\(docs\/hero\.webp\)/);
    expect(top).toContain('Live demo');
    expect(top).toContain('#try-it-in-10-seconds');
  });
});

describe('open-source packaging files', () => {
  it('all exist, CI included, and the old ci/ folder is gone', () => {
    const files = [...DOC_FILES, 'LICENSE', 'docs/hero.webp', '.github/workflows/ci.yml', ...['bug_report', 'feature_request', 'sample_suggestion', 'config'].map((f) => `.github/ISSUE_TEMPLATE/${f}.yml`)];
    expect(files.filter((f) => !existsSync(join(root, f)))).toEqual([]);
    expect(existsSync(join(root, 'ci'))).toBe(false);
  });

  it('CI runs the size budgets', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/run: pnpm size/);
  });
});

describe('yamlLite', () => {
  it('parses the subset', () => {
    expect(parseYaml('a: 1\nb:\n  - x\n  - k: "q: r"\n    l: [one, two]\nc: |\n  line 1\n\n  line 2\nd: true # note\n')).toEqual({
      a: 1,
      b: ['x', { k: 'q: r', l: ['one', 'two'] }],
      c: 'line 1\n\nline 2',
      d: true,
    });
  });
  it('rejects what it does not understand', () => {
    expect(() => parseYaml('a:\n\t- x')).toThrow(/tab/);
    expect(() => parseYaml('a: 1\na: 2')).toThrow(/duplicate/);
    expect(() => parseYaml('a: b: c')).toThrow(/ambiguous/);
    expect(() => parseYaml('a: 1\n   b: 2')).toThrow(/indentation/);
  });
});

const TYPES = new Set(['markdown', 'textarea', 'input', 'dropdown', 'checkboxes']);

/** What is wrong with a parsed issue form, against GitHub's form schema (the parts we use). */
function formProblems(form: Yaml): string[] {
  if (!isObj(form)) return ['not a map'];
  const out: string[] = [];
  if (typeof form.name !== 'string' || typeof form.description !== 'string') out.push('needs name and description');
  if (!Array.isArray(form.body) || !form.body.length) return [...out, 'body must be a non-empty list'];
  const ids = new Set<string>();
  form.body.forEach((item, i) => {
    const attrs = isObj(item) ? item.attributes : undefined;
    if (!isObj(item) || typeof item.type !== 'string' || !TYPES.has(item.type) || !isObj(attrs)) return out.push(`body[${i}]: bad item`);
    if (item.type === 'markdown') return typeof attrs.value === 'string' || out.push(`body[${i}]: markdown needs a value`);
    if (typeof attrs.label !== 'string') out.push(`body[${i}]: needs a label`);
    if (typeof item.id !== 'string' || ids.has(item.id)) out.push(`body[${i}]: needs a unique id`);
    else ids.add(item.id);
    const options = attrs.options;
    if (item.type === 'dropdown' && !(Array.isArray(options) && options.every((o) => typeof o === 'string'))) out.push(`body[${i}]: dropdown options`);
    if (item.type === 'checkboxes' && !(Array.isArray(options) && options.every((o) => isObj(o) && typeof o.label === 'string'))) out.push(`body[${i}]: checkbox options`);
  });
  return out;
}

describe('issue forms are valid YAML in GitHub form shape', () => {
  it.each(['bug_report', 'feature_request', 'sample_suggestion'])('%s', (name) => {
    expect(formProblems(parseYaml(read(`.github/ISSUE_TEMPLATE/${name}.yml`)))).toEqual([]);
  });

  it('catches a malformed form', () => {
    expect(formProblems(parseYaml('name: x\ndescription: y\nbody:\n  - type: input\n    attributes:\n      label: a\n  - type: video\n'))).toEqual([
      'body[0]: needs a unique id',
      'body[1]: bad item',
    ]);
  });

  it('config', () => {
    const config = parseYaml(read('.github/ISSUE_TEMPLATE/config.yml'));
    const links = isObj(config) && Array.isArray(config.contact_links) ? config.contact_links : [];
    expect(isObj(config) && typeof config.blank_issues_enabled).toBe('boolean');
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => isObj(l) && typeof l.name === 'string' && typeof l.about === 'string' && /^https:\/\//.test(String(l.url)))).toBe(true);
  });
});
