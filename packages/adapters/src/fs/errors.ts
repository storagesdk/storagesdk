import { StorageError, type StorageErrorCode } from '@storagesdk/core';

/**
 * Map `fs`/`fs/promises` errors to `StorageError`. ENOENT → NotFound,
 * EEXIST → Conflict, anything else → Provider with the original error as cause.
 */
export function asStorageError(
  err: unknown,
  fallback: StorageErrorCode = 'Provider'
): StorageError {
  if (err instanceof StorageError) return err;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;
  const cause = err instanceof Error ? err : undefined;
  if (code === 'ENOENT') {
    return new StorageError({ code: 'NotFound', cause });
  }
  if (code === 'EEXIST') {
    return new StorageError({ code: 'Conflict', cause });
  }
  return new StorageError({ code: fallback, cause });
}
