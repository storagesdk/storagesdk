import {
  isAbortError,
  StorageError,
  type StorageErrorCode,
} from '@storagesdk/core/adapter';

/**
 * Thrown by the adapter's transport helpers when a Bunny Edge Storage
 * response is not `ok`. Carries the HTTP `status` so `asStorageError` can
 * map it to a normalized `StorageError` code — the Bunny API returns no
 * machine-readable error body, just the status.
 */
export class BunnyHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'BunnyHttpError';
    this.status = status;
  }
}

/**
 * Map a Bunny transport error into a `StorageError`. Bunny Edge Storage
 * signals everything through the HTTP status: 404 → `NotFound`, 401/403 →
 * `Unauthorized`, 409 → `Conflict`, other 4xx → `InvalidArgument`,
 * anything else → `fallback` (`Provider` by default). Aborted fetches
 * surface as `Aborted`.
 */
export function asStorageError(
  err: unknown,
  fallback: StorageErrorCode = 'Provider'
): StorageError {
  if (err instanceof StorageError) return err;
  const cause = err instanceof Error ? err : undefined;
  if (isAbortError(err)) {
    return new StorageError({ code: 'Aborted', cause });
  }
  const status = err instanceof BunnyHttpError ? err.status : undefined;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 404) {
    return new StorageError({ code: 'NotFound', message, cause });
  }
  if (status === 401 || status === 403) {
    return new StorageError({ code: 'Unauthorized', message, cause });
  }
  if (status === 409) {
    return new StorageError({ code: 'Conflict', message, cause });
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new StorageError({ code: 'InvalidArgument', message, cause });
  }
  return new StorageError({ code: fallback, message, cause });
}
