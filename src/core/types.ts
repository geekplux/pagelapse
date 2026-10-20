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

/** Where a sample fixture's data came from. */
export type SampleArchive = ArchiveId | 'illustrative';

/** Provenance of a sample fixture, shown in the UI. */
export interface SampleSource {
  archive: SampleArchive;
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
}
