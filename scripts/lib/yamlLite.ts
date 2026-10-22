// A strict parser for the small YAML subset our GitHub issue forms use: block maps, block sequences, `|`/`>`
// block scalars, quoted and plain scalars, and flat `[a, b]` lists. Anything outside the subset (tabs, flow maps,
// anchors, odd indentation, duplicate keys) throws, so a passing parse means the file is well-formed YAML.
// Written instead of adding a YAML dependency (no new deps).

export type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml };

interface Line {
  n: number;
  indent: number;
  text: string;
}

const KEY = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/;

export function parseYaml(src: string): Yaml {
  const raw = src.replace(/\r\n/g, '\n').split('\n');
  const lines: Line[] = raw.map((r, i) => {
    const lead = /^[ \t]*/.exec(r)![0];
    if (lead.includes('\t')) throw new Error(`line ${i + 1}: tab in indentation`);
    return { n: i + 1, indent: lead.length, text: r.slice(lead.length).trimEnd() };
  });
  let pos = 0;
  const significant = (l: Line) => l.text !== '' && !l.text.startsWith('#');
  const peek = (): Line | undefined => {
    while (pos < lines.length && !significant(lines[pos]!)) pos++;
    return lines[pos];
  };
  const fail = (l: Line, msg: string): never => {
    throw new Error(`line ${l.n}: ${msg}`);
  };
  const isItem = (l: Line) => l.text === '-' || l.text.startsWith('- ');

  function node(min: number): Yaml {
    const l = peek();
    if (!l || l.indent < min) return null;
    return isItem(l) ? seq(l.indent) : map(l.indent);
  }

  function blockScalar(parent: number, style: string): string {
    const body: string[] = [];
    pos++;
    while (pos < lines.length && (lines[pos]!.text === '' || lines[pos]!.indent > parent)) body.push(raw[pos++]!);
    while (body.length && body.at(-1)!.trim() === '') body.pop();
    const cut = Math.min(...body.filter((b) => b.trim()).map((b) => /^ */.exec(b)![0].length));
    const text = body.map((b) => b.slice(cut));
    return style.startsWith('>') ? text.join(' ') : text.join('\n');
  }

  function map(indent: number): Yaml {
    const out: Record<string, Yaml> = {};
    for (let l = peek(); l && l.indent === indent && !isItem(l); l = peek()) {
      const m = KEY.exec(l.text) ?? fail(l, `expected "key: value", got "${l.text}"`);
      const [, key, rest] = m as unknown as [string, string, string | undefined];
      if (Object.hasOwn(out, key)) fail(l, `duplicate key "${key}"`);
      if (rest === undefined || rest === '') {
        pos++;
        const next = peek();
        out[key] = next && next.indent === indent && isItem(next) ? seq(indent) : node(indent + 1);
      } else if (/^[|>][-+]?$/.test(rest)) {
        out[key] = blockScalar(indent, rest);
      } else {
        out[key] = scalar(rest, l);
        pos++;
      }
    }
    const after = peek();
    if (after && after.indent > indent) fail(after, 'unexpected indentation');
    return out;
  }

  function seq(indent: number): Yaml {
    const out: Yaml[] = [];
    for (let l = peek(); l && l.indent === indent && isItem(l); l = peek()) {
      const content = l.text.slice(1).trimStart();
      if (!content) {
        pos++;
        out.push(node(indent + 1));
        continue;
      }
      // Re-read the item's content as a line of its own at its real column.
      const col = indent + l.text.length - content.length;
      lines[pos] = { n: l.n, indent: col, text: content };
      out.push(KEY.test(content) ? map(col) : (pos++, scalar(content, l)));
    }
    const after = peek();
    if (after && after.indent > indent) fail(after, 'unexpected indentation');
    return out;
  }

  const result = node(0);
  const left = peek();
  if (left) fail(left, 'unexpected content');
  return result;

  function scalar(text: string, l: Line): Yaml {
    if (text.startsWith('"')) {
      if (!/^"(?:[^"\\]|\\.)*"$/.test(text)) fail(l, 'bad double-quoted string');
      return JSON.parse(text) as string;
    }
    if (text.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(text)) fail(l, 'bad single-quoted string');
      return text.slice(1, -1).replace(/''/g, "'");
    }
    const plain = text.replace(/\s+#.*$/, '');
    if (plain.startsWith('[')) {
      if (!plain.endsWith(']')) fail(l, 'unclosed flow list');
      const inner = plain.slice(1, -1).trim();
      return inner ? inner.split(',').map((s) => scalar(s.trim(), l)) : [];
    }
    if (/^[{&*!%@`]/.test(plain) || /:\s/.test(plain)) fail(l, `unsupported or ambiguous scalar "${plain}"`);
    if (plain === 'true' || plain === 'false') return plain === 'true';
    if (plain === 'null' || plain === '~') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(plain)) return Number(plain);
    return plain;
  }
}
