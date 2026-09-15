const tails = new Map<string, Promise<void>>();

/** Serialize work for each SD service; failure never poisons the queue. */
export async function queuedImage<T>(endpoint: string, work: () => Promise<T>, signal?: AbortSignal) {
  const previous = tails.get(endpoint) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>(resolve => { release = resolve; });
  tails.set(endpoint, next);
  await previous;
  try {
    signal?.throwIfAborted();
    return await work();
  } finally {
    release();
    if (tails.get(endpoint) === next) tails.delete(endpoint);
  }
}

export function imageByteLimit(width: number, height: number) {
  return Math.max(16 * 1024 * 1024, Math.ceil(width * height * 4 * 1.2));
}
