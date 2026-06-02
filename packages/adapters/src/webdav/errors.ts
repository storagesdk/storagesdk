import {
  isAbortError,
  StorageError,
  type StorageErrorCode,
} from '@storagesdk/core';

/**
 * Map `webdav` client errors to `StorageError`. The lib throws
 * `WebDAVClientError` (an `Error` subclass) with `.status` set to the
 * HTTP status code. 404 → NotFound, 401/403 → Unauthorized,
 * 405/409/412 → Conflict, 416 → InvalidArgument, other 4xx →
 * InvalidArgument, anything else → Provider.
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
  const obj = err as { status?: unknown; message?: unknown } | null | undefined;
  const status = typeof obj?.status === 'number' ? obj.status : undefined;
  const message = typeof obj?.message === 'string' ? obj.message : '';

  if (status === 404 || /not[ _-]?found/i.test(message)) {
    return new StorageError({ code: 'NotFound', cause });
  }
  if (status === 401 || status === 403) {
    return new StorageError({ code: 'Unauthorized', cause });
  }
  // 405 Method Not Allowed (MKCOL on existing), 409 Conflict (parent
  // missing for PUT/MKCOL), 412 Precondition Failed (overwrite false).
  if (status === 405 || status === 409 || status === 412) {
    return new StorageError({ code: 'Conflict', cause });
  }
  if (status === 416) {
    return new StorageError({ code: 'InvalidArgument', cause });
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new StorageError({ code: 'InvalidArgument', cause });
  }
  return new StorageError({ code: fallback, cause });
}

/** True when an error from the WebDAV lib signals "resource not found". */
export function isMissing(err: unknown): boolean {
  const obj = err as { status?: unknown; message?: unknown } | null | undefined;
  if (obj?.status === 404) return true;
  return (
    typeof obj?.message === 'string' && /not[ _-]?found/i.test(obj.message)
  );
}

/** True for 403 Forbidden. Some WebDAV servers (Apache mod_dav) use
 *  403 instead of 404 when refusing to enumerate a path that doesn't
 *  exist. Only meaningful in places where we can't distinguish "no
 *  permission" from "no resource" — caller decides what to do. */
export function isForbidden(err: unknown): boolean {
  const obj = err as { status?: unknown } | null | undefined;
  return obj?.status === 403;
}
