/**
 * A dynamic import requested at most once at a time: a success is kept (and readable at once with `loaded`), a
 * failure is forgotten, so the next `load` asks again instead of repeating a cached rejection. (The browser may still
 * keep the failed module itself; the app's Try again therefore reloads the page.)
 */
export function retryableImport<T>(importer: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  let value: T | undefined;
  return {
    load: (): Promise<T> =>
      (pending ??= importer().then(
        (m) => (value = m),
        (err: unknown) => {
          pending = undefined;
          throw err;
        },
      )),
    loaded: (): T | undefined => value,
  };
}

/**
 * The sample workspace (TimelineView with the visual pane, timeline and diff): its own chunk, since the hero is the
 * first view. main.tsx awaits it before the first render when the address opens the workspace, so a deep link paints
 * the workspace at once.
 */
export const workspace = retryableImport(() => import('./TimelineView.tsx'));
