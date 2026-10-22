// Pure helpers for the launch kit's test (docs/LAUNCH.md): the X post's length and the document's parts.

/** X counts every link as 23 characters, whatever its length. */
const URL_RE = /https?:\/\/\S+/g;
const X_LINK_LENGTH = 23;

/** Length of a post as X counts it: code points, with each link counted as 23. */
export function xLength(post: string): number {
  return [...post.replace(URL_RE, '')].length + (post.match(URL_RE)?.length ?? 0) * X_LINK_LENGTH;
}

/** The body of the first fenced block after the `## <heading>` line, or `undefined`. */
export function fencedAfter(md: string, heading: string): string | undefined {
  const at = md.indexOf(`\n## ${heading}\n`);
  if (at < 0) return undefined;
  return /```[a-z]*\n([\s\S]*?)\n```/.exec(md.slice(at))?.[1];
}

/** The text of the `## <heading>` section (up to the next `## `). */
export function section(md: string, heading: string): string {
  const at = md.indexOf(`\n## ${heading}\n`);
  if (at < 0) return '';
  const rest = md.slice(at + heading.length + 5);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}
