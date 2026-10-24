/** vite.config.ts `sampleCatalog`: the id, label and url of every samples.config.json entry, in order. */
declare module 'virtual:sample-catalog' {
  const catalog: readonly { id: string; label: string; url: string }[];
  export default catalog;
}
