import { StorageError, type StorageErrorCode } from '@storagesdk/core';

interface AwsError {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}

/**
 * Map AWS SDK errors to `StorageError`. Recognizes both the service error
 * name (e.g. `NoSuchKey`, `BucketAlreadyExists`) and the HTTP status code
 * via `$metadata.httpStatusCode`.
 */
export function asStorageError(
  err: unknown,
  fallback: StorageErrorCode = 'Provider'
): StorageError {
  if (err instanceof StorageError) return err;

  const cause = err instanceof Error ? err : undefined;
  const aws = err as AwsError | null | undefined;
  const name = aws?.name;
  const status = aws?.$metadata?.httpStatusCode;

  if (
    name === 'NoSuchKey' ||
    name === 'NoSuchBucket' ||
    name === 'NotFound' ||
    status === 404
  ) {
    return new StorageError({ code: 'NotFound', cause });
  }
  if (name === 'BucketAlreadyExists' || name === 'BucketAlreadyOwnedByYou') {
    return new StorageError({ code: 'Conflict', cause });
  }
  if (name === 'AccessDenied' || status === 403) {
    return new StorageError({ code: 'Unauthorized', cause });
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new StorageError({ code: 'InvalidArgument', cause });
  }
  return new StorageError({ code: fallback, cause });
}
