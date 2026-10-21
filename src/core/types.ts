/** Kind of a readable content block extracted from a page. */
export type BlockKind = 'heading' | 'paragraph' | 'list-item' | 'quote' | 'code' | 'table-row';

/** All block kinds, in a stable order (useful for validation). */
export const BLOCK_KINDS: readonly BlockKind[] = [
  'heading',
  'paragraph',
  'list-item',
  'quote',
  'code',
  'table-row',
];

/** Heading level, only meaningful for `heading` blocks. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** One readable block of a page: a heading, paragraph, list item, and so on. */
export interface Block {
  kind: BlockKind;
  text: string;
  level?: HeadingLevel;
}

/** The readable content of one page capture, after extraction. */
export interface ExtractedPage {
  title: string;
  blocks: Block[];
  /** True when extraction hit a size cap and dropped trailing content. */
  truncated?: boolean;
}

/** One node of a page's heading outline, see `deriveOutline`. */
export interface OutlineNode {
  level: HeadingLevel;
  text: string;
  children: OutlineNode[];
}

/** An extracted page tied to the capture it came from. */
export interface SnapshotPage extends ExtractedPage {
  /** 14-digit CDX timestamp, `YYYYMMDDhhmmss` (UTC). */
  ts: string;
  digest: string;
}

/** A web archive we can query and fetch captures from. */
export type ArchiveId = 'internet-archive' | 'arquivo-pt';

/** One row of a CDX listing: a capture of the target URL. */
export interface Capture {
  /** 14-digit CDX timestamp, `YYYYMMDDhhmmss` (UTC). */
  ts: string;
  digest: string;
  /** Stored (usually compressed) record length in bytes; 0 when unknown. */
  length: number;
}

/** Provenance of a sample fixture, shown in the UI. */
export interface SampleSource {
  archive: ArchiveId;
  recordedAt: string;
  recorder: string;
  license: string;
  attribution: string;
}

/** A unique block as stored (interned) in a fixture. */
export interface FixtureBlock {
  k: BlockKind;
  t: string;
  l?: HeadingLevel;
}

/** One capture in a fixture; `blockIds` index into `SampleFixture.blocks`. */
export interface FixtureSnapshot {
  ts: string;
  digest: string;
  title: string;
  blockIds: number[];
  truncated?: boolean;
  /** Recorded picture of this capture (optional; see `SampleVisual`). */
  shot?: ShotRef;
}

/**
 * A capture's recorded picture: `public/samples/<id>/<file>.webp` (960×600) and `<file>.thumb.webp` (320×200).
 * `partial`: the archive's copy missed stylesheets or images; `failed`: no picture (`file` absent).
 */
export interface ShotRef {
  /** `"<ts>-<first 8 hex of sha256(full webp)>"`. */
  file?: string;
  status: 'ok' | 'partial' | 'failed';
  /** Archive subresources that failed to load. */
  missing?: { css: number; img: number };
  /** How the recorder decided the page was done: network quiet, or the hard time cap. */
  settle: 'quiet' | 'cap';
  /** Elements hidden before the screenshot (e.g. monetary figures). */
  redacted?: number;
  /** Why the shot failed, e.g. "http 404" or "blank page". */
  reason?: string;
}

/** How a fixture's pictures were recorded: top of page only, at a fixed viewport. */
export interface SampleVisual {
  archive: ArchiveId;
  recordedAt: string;
  recorder: string;
  viewport: { w: 1280; h: 800 };
  full: { w: 960; h: 600 };
  thumb: { w: 320; h: 200 };
  format: 'webp';
  attribution: string;
  notes?: string[];
}

/** A summary stored in a fixture, keyed by `"<fromTs>-<toTs>"`. */
export interface FixtureSummary {
  text: string;
  source: 'ai' | 'rule';
  model?: string;
}

/** A built-in, pre-recorded sample page (schema v1, block-interned). */
export interface SampleFixture {
  schema: 1;
  id: string;
  label: string;
  url: string;
  description: string;
  source: SampleSource;
  blocks: FixtureBlock[];
  snapshots: FixtureSnapshot[];
  summaries?: Record<string, FixtureSummary>;
  /** The curated change the first view opens on, `"<fromTs>-<toTs>"` (both are snapshot timestamps). */
  featured?: string;
  visual?: SampleVisual;
}

/**
 * One word-level edit; `text` is original text (B's for `equal`/`ins`, A's for `del`),
 * whitespace included. An `equal` run whose A text differs (quotes, dashes, spacing) has it in `from`.
 */
export interface WordOp {
  type: 'equal' | 'ins' | 'del';
  text: string;
  from?: string;
}

/**
 * One block-level edit from page A to page B; `a`/`b` index the blocks of A/B. Ops are
 * in B order: replaying the non-`removed` ops rebuilds B (see `applyDiff`).
 * `modified` carries B's kind/level and word ops; `normalizedEqual` is true when the two
 * texts only differ in content that `normalizeForCompare` masks (dates, counters, ...).
 * `moved` is an identical block that changed position.
 */
export type BlockOp =
  | { type: 'equal'; a: number; b: number }
  | { type: 'added'; b: number; block: Block }
  | { type: 'removed'; a: number }
  | { type: 'modified'; a: number; b: number; kind: BlockKind; level?: HeadingLevel; words: WordOp[]; normalizedEqual: boolean }
  | { type: 'moved'; a: number; b: number };

/** Result of `diffPages`. `cutoff` is true when `maxEditDistance` was hit and the diff fell back to block replacement. */
export interface PageDiff {
  ops: BlockOp[];
  titleChanged: boolean;
  cutoff: boolean;
}

/** How much a change matters; `trivial` changes are filtered out of the timeline. */
export type Magnitude = 'trivial' | 'minor' | 'moderate' | 'major';

/** Result of `scoreDiff`: `score` is 0..1 (marker area follows it), `reasons` are short, human-readable. */
export interface Significance {
  score: number;
  magnitude: Magnitude;
  reasons: string[];
}

/** Compact, page-free description of one change: the only input a summariser ever sees (<= 1,200 chars as JSON). */
export interface ChangeRecord {
  /** `"<fromTs>-<toTs>"`, see `pairKey`. */
  pair: string;
  /** The later capture's title (clipped). */
  title: string;
  titleChanged?: true;
  headingsAdded: string[];
  headingsRemoved: string[];
  /** Snippets (<= 160 chars) of the largest added / removed blocks, in page order. */
  added: string[];
  removed: string[];
  /** Excerpts around the first edit of the most-changed blocks. */
  modified: { before: string; after: string }[];
  stats: { wordsAdded: number; wordsRemoved: number; blocksAdded: number; blocksRemoved: number; blocksModified: number };
}

/** One meaningful change on the timeline: `from` is the baseline (last meaningful capture), `to` the new capture. */
export interface TimelineEntry {
  from: string;
  to: string;
  diff: PageDiff;
  significance: Significance;
  record: ChangeRecord;
  ruleSummary: string;
}

/** The model the UI consumes; build with `buildTimeline` or grow with `appendSnapshot`. */
export interface Timeline {
  url: string;
  /** Every capture, chronological. */
  snapshots: SnapshotPage[];
  entries: TimelineEntry[];
  /** Timestamps of captures whose change from the baseline was trivial (hidden, but counted). */
  trivialCaptures: string[];
  /** Index into `snapshots` of the current comparison baseline. */
  baseline: number;
}
