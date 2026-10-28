/** vite.config.ts `sampleCatalog`: every samples.config.json entry, in order, with a recorded one's gallery card. */
declare module 'virtual:sample-catalog' {
  const catalog: readonly {
    id: string;
    label: string;
    url: string;
    card?: { captures: number; firstTs: string; lastTs: string; shot?: string };
  }[];
  export default catalog;
}
