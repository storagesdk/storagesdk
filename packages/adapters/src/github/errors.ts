import {
  isAbortError,
  StorageError,
  type StorageErrorCode,
} from '@storagesdk/core';

interface OctokitErrorLike {
  name?: string;
  message?: string;
  status?: number;
}

/**
 * Map Octokit / `@octokit/request-error` errors to `StorageError`. The
 * REST client throws `RequestError` instances with an HTTP `status` —
 * that's the primary signal. 404 → `NotFound`, 401/403 → `Unauthorized`,
 * 409/422 (`sha` mismatch on overwrite, branch already exists) →
 * `Conflict`, other 4xx → `InvalidArgument`, anything else → `Provider`.
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
  const g = err as OctokitErrorLike | null | undefined;
  const status = g?.status;
  const message = g?.message ?? '';

  if (status === 404 || /not[ _-]?found/i.test(message)) {
    return new StorageError({ code: 'NotFound', cause });
  }
  if (status === 401 || status === 403) {
    return new StorageError({ code: 'Unauthorized', cause });
  }
  if (
    status === 409 ||
    status === 422 ||
    /already exists/i.test(message) ||
    /reference already exists/i.test(message)
  ) {
    return new StorageError({ code: 'Conflict', cause });
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new StorageError({ code: 'InvalidArgument', cause });
  }
  return new StorageError({ code: fallback, cause });
}
