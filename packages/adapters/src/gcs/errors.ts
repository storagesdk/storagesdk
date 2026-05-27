import {
  isAbortError,
  StorageError,
  type StorageErrorCode,
} from '@storagesdk/core';

interface GcsError {
  code?: number | string;
  errors?: Array<{ reason?: string }>;
  status?: number;
  statusCode?: number;
  name?: string;
  message?: string;
}

/**
 * Map a `@google-cloud/storage` error to a `StorageError`. The SDK surfaces
 * failures as `ApiError` with `code` (HTTP status) and optionally
 * `errors[].reason`. Falls back to `Provider` for unmapped errors.
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
  const e = err as GcsError | null | undefined;
  const status =
    typeof e?.code === 'number' ? e.code : (e?.status ?? e?.statusCode);
  const reason = e?.errors?.[0]?.reason;
  const message = e?.message ?? '';

  if (status === 404 || reason === 'notFound' || /not found/i.test(message)) {
    return new StorageError({ code: 'NotFound', cause });
  }
  if (
    status === 409 ||
    reason === 'conflict' ||
    reason === 'duplicate' ||
    /already exists|conflict/i.test(message)
  ) {
    return new StorageError({ code: 'Conflict', cause });
  }
  if (
    status === 401 ||
    status === 403 ||
    reason === 'forbidden' ||
    reason === 'unauthorized'
  ) {
    return new StorageError({ code: 'Unauthorized', cause });
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new StorageError({ code: 'InvalidArgument', cause });
  }
  return new StorageError({ code: fallback, cause });
}
