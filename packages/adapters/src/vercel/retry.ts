import { checkSignal } from '@storagesdk/core/adapter';
import { BlobServiceRateLimited } from '@vercel/blob';

const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 2000;

/** Injectable sleep — tests pass a fake so they don't really wait. */
export type RateLimitSleep = (
  ms: number,
  signal?: AbortSignal
) => Promise<void>;

const sleep: RateLimitSleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    const onAbort = (): void => done();
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * `fn` retry helper for `@vercel/blob` calls: the SDK's internal retry
 * skips `rate_limited` responses entirely, so bulk operations (snapshot
 * and fork copies, cleanup deletes) die on the first 429. Retries only
 * `BlobServiceRateLimited` — honoring `retryAfter` when Vercel sends
 * one, exponential backoff (2 s, 4 s, 8 s, …) when it doesn't — and
 * gives up after {@link MAX_ATTEMPTS} tries. Anything else rethrows
 * immediately; an aborted signal stops the wait early via
 * `checkSignal`.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  wait: RateLimitSleep = sleep
): Promise<T> {
  let backoffMs = BASE_BACKOFF_MS;
  for (let attempt = 1; ; attempt++) {
    checkSignal(signal);
    try {
      return await fn();
    } catch (err) {
      if (
        !(err instanceof BlobServiceRateLimited) ||
        attempt === MAX_ATTEMPTS
      ) {
        throw err;
      }
      const ms = err.retryAfter > 0 ? err.retryAfter * 1000 : backoffMs;
      backoffMs *= 2;
      await wait(ms, signal);
    }
  }
}
