function debounce<Args extends unknown[], R>(
  func: (...args: Args) => Promise<R> | R,
  delay: number,
) {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

export default debounce;

/**
 * Like `debounce`, but the returned function carries a `flush()` that runs a
 * pending invocation immediately (used to persist trailing edits on
 * unmount/navigation) and a `cancel()` that drops it.
 */
export function debounceWithFlush<Args extends unknown[], R>(
  func: (...args: Args) => Promise<R> | R,
  delay: number,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;

  const invoke = () => {
    timeout = null;
    if (!lastArgs) return;
    const args = lastArgs;
    lastArgs = null;
    void func(...args);
  };

  const debounced = (...args: Args) => {
    lastArgs = args;
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(invoke, delay);
  };

  debounced.flush = () => {
    if (timeout === null) return;
    clearTimeout(timeout);
    invoke();
  };

  debounced.cancel = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    lastArgs = null;
  };

  return debounced;
}
