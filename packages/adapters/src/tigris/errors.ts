import {
  isAbortError,
  StorageError,
  type StorageErrorCode,
} from '@storagesdk/core';

interface TigrisError {
  name?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
  status?: number;
}

/**
 * Map Tigris SDK errors to `StorageError`. The Tigris client returns plain
 * `Error` objects (whose `message` mirrors the server's `Message` field) for
 * its native fetch path, and bubbles `@aws-sdk/client-s3` errors with `name`
 * + `$metadata.httpStatusCode` for the S3-backed path. We handle both —
 * service-error name first, then HTTP status, then a message heuristic for
 * the cases where only a string is available.
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
  const t = err as TigrisError | null | undefined;
  const name = t?.name;
  const status = t?.$metadata?.httpStatusCode ?? t?.status;
  const message = t?.message ?? '';

  if (
    name === 'NoSuchKey' ||
    name === 'NoSuchBucket' ||
    name === 'NotFound' ||
    /not[ _-]?found/i.test(message) ||
    status === 404
  ) {
    return new StorageError({ code: 'NotFound', cause });
  }
  if (
    name === 'BucketAlreadyExists' ||
    name === 'BucketAlreadyOwnedByYou' ||
    /already exists/i.test(message) ||
    status === 409
  ) {
    return new StorageError({ code: 'Conflict', cause });
  }
  if (
    name === 'AccessDenied' ||
    /unauthori[sz]ed|forbidden/i.test(message) ||
    status === 401 ||
    status === 403
  ) {
    return new StorageError({ code: 'Unauthorized', cause });
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new StorageError({ code: 'InvalidArgument', cause });
  }
  return new StorageError({ code: fallback, cause });
}

/**
 * Tigris returns `{ data?, error? }` discriminated responses. Unwrap to the
 * data on success; convert the error to a `StorageError` and throw on
 * failure. Centralizes the pattern so adapter call sites stay tidy.
 */
export function unwrap<T>(res: { data?: T; error?: unknown } | undefined): T {
  if (res?.error !== undefined) throw asStorageError(res.error);
  if (res?.data === undefined) {
    throw new StorageError({
      code: 'Provider',
      message: 'Tigris call returned neither data nor error',
    });
  }
  return res.data;
}
