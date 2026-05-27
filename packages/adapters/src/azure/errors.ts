import {
  isAbortError,
  StorageError,
  type StorageErrorCode,
} from '@storagesdk/core';

interface AzureError {
  code?: string;
  statusCode?: number;
  details?: { errorCode?: string };
  message?: string;
  name?: string;
}

/**
 * Map an Azure SDK error to a `StorageError`. Azure surfaces failures as
 * `RestError` with a `code` (e.g. `BlobNotFound`, `ContainerAlreadyExists`)
 * and an HTTP `statusCode`. Falls back to `Provider` for anything that
 * doesn't match a known pattern.
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
  const e = err as AzureError | null | undefined;
  const code = e?.code ?? e?.details?.errorCode;
  const status = e?.statusCode;

  if (
    code === 'BlobNotFound' ||
    code === 'ContainerNotFound' ||
    code === 'ResourceNotFound' ||
    status === 404
  ) {
    return new StorageError({ code: 'NotFound', cause });
  }
  if (
    code === 'ContainerAlreadyExists' ||
    code === 'BlobAlreadyExists' ||
    code === 'ResourceAlreadyExists' ||
    status === 409
  ) {
    return new StorageError({ code: 'Conflict', cause });
  }
  if (
    code === 'AuthenticationFailed' ||
    code === 'AuthorizationFailure' ||
    code === 'InvalidAuthenticationInfo' ||
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
