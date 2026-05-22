export type StorageErrorCode =
  | 'NotFound'
  | 'NotSupported'
  | 'Conflict'
  | 'Unauthorized'
  | 'InvalidArgument'
  | 'Aborted'
  | 'Provider';

export interface StorageErrorInit {
  code: StorageErrorCode;
  message?: string;
  cause?: unknown;
}

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(init: StorageErrorInit) {
    super(init.message ?? init.code, { cause: init.cause });
    this.name = 'StorageError';
    this.code = init.code;
  }
}

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
