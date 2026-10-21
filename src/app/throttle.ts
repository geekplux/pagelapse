/** Calls `emit` with the latest pushed value at most once every `ms`: the first at once, later ones deferred. */
export function throttleLatest<T>(ms: number, emit: (v: T) => void) {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: T;
  const fire = () => {
    timer = undefined;
    last = Date.now();
    emit(latest);
  };
  return {
    push(v: T) {
      latest = v;
      if (timer === undefined) {
        const wait = last + ms - Date.now();
        if (wait <= 0) fire();
        else timer = setTimeout(fire, wait);
      }
    },
    /** Drops a deferred value; the next push waits out the rest of the interval as usual. */
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
