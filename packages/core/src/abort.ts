import { StorageError } from './errors.js';

/**
 * True when `err` represents an aborted operation — the standard Web /
 * Node `AbortError` (a DOMException with `name === 'AbortError'`) or
 * Node's older `code === 'ABORT_ERR'`. Adapters should detect this in
 * their error-mapping helper and surface `StorageError({ code: 'Aborted' })`
 * so consumers can distinguish user-cancelled work from a real failure.
 */
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  return (err as { code?: string }).code === 'ABORT_ERR';
}

/**
 * Pre-check: if the caller's `signal` is already aborted, throw a
 * `StorageError({ code: 'Aborted' })` synchronously instead of letting the
 * adapter begin work. Mid-flight aborts come through the SDK's own
 * cancellation path and get mapped via the adapter's `asStorageError`.
 */
export function checkSignal(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const cause = signal.reason instanceof Error ? signal.reason : undefined;
    throw new StorageError({ code: 'Aborted', cause });
  }
}

/**
 * Bridge an `AbortSignal` into a fresh `AbortController` for SDKs that take a
 * controller rather than a signal (e.g. `@aws-sdk/lib-storage`'s `Upload`,
 * `@tigrisdata/storage`'s `put`). Returns `{ controller?, dispose }`:
 *
 *  - `controller` — pass to the SDK; `undefined` when `signal` is `undefined`.
 *  - `dispose()` — MUST be called in a `finally` block. Removes the `abort`
 *    listener on the caller's signal so reusing the same signal across many
 *    SDK calls doesn't accumulate listeners.
 */
export function bridgeSignalToController(signal: AbortSignal | undefined): {
  controller?: AbortController;
  dispose: () => void;
} {
  if (!signal) return { dispose: noop };
  const ctrl = new AbortController();
  if (signal.aborted) {
    ctrl.abort(signal.reason);
    return { controller: ctrl, dispose: noop };
  }
  const onAbort = (): void => ctrl.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    controller: ctrl,
    dispose: () => signal.removeEventListener('abort', onAbort),
  };
}

const noop = (): void => {};
