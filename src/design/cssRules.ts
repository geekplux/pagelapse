/** A tiny CSS scan for the design tests: comments dropped, then every innermost `selector { declarations }` rule. */
export interface CssDecl {
  file: string;
  selector: string;
  prop: string;
  value: string;
  /** The declaration carries a `spacing-allow: <reason>` comment. */
  allowed: boolean;
}

export function cssDecls(file: string, css: string): CssDecl[] {
  // Keep allow comments as markers on their declaration; drop every other comment.
  const text = css.replace(/\/\*\s*spacing-allow:[^*]*\*\//g, '\u0001').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, sel, body]) =>
    body!.split(/;(?![^(]*\))/).flatMap((d) => {
      const i = d.indexOf(':');
      if (i < 0) return [];
      const value = d.slice(i + 1).trim();
      return [{ file, selector: sel!.trim().replace(/\s+/g, ' '), prop: d.slice(0, i).replace('\u0001', '').trim(), value: value.replace('\u0001', '').trim(), allowed: d.includes('\u0001') }];
    }),
  );
}
