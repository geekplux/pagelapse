/**
 * Public, typed API of the wayback-diff core: pure functions with no DOM or network
 * access, shared by the browser, the Worker and the recorder. Every export carries
 * TSDoc at its declaration.
 *
 * The HTML extractor (`extractPage`, `EXTRACTOR_VERSION`) lives in `./extract.ts` and is
 * intentionally not re-exported here: it depends on htmlparser2, which must stay out of
 * the browser bundle. Import it directly from the Worker and the recorder.
 * @module
 */
export * from './types.ts';
export * from './fixture.ts';
export * from './timestamp.ts';
export * from './url.ts';
export * from './outline.ts';
export * from './cdx.ts';
export * from './sampling.ts';
export * from './normalize.ts';
export * from './myers.ts';
export * from './diff.ts';
export * from './score.ts';
export * from './changeRecord.ts';
export * from './ruleSummary.ts';
export * from './timeline.ts';
