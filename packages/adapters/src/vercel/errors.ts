import { StorageError } from '@storagesdk/core/adapter';
import {
  BlobAccessError,
  BlobContentTypeNotAllowedError,
  BlobFileTooLargeError,
  BlobNotFoundError,
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
} from '@vercel/blob';

/**
 * Map a `@vercel/blob` error into a `StorageError`. The Vercel SDK
 * exposes typed error classes; we recognize the ones that map to our
 * normalized codes and fall through to `Provider` otherwise.
 */
export function asStorageError(err: unknown): StorageError {
  if (err instanceof StorageError) return err;
  if (err instanceof BlobNotFoundError) {
    return new StorageError({
      code: 'NotFound',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof BlobRequestAbortedError) {
    return new StorageError({
      code: 'Aborted',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof BlobAccessError) {
    return new StorageError({
      code: 'Unauthorized',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof BlobFileTooLargeError) {
    return new StorageError({
      code: 'InvalidArgument',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof BlobContentTypeNotAllowedError) {
    return new StorageError({
      code: 'InvalidArgument',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof BlobPreconditionFailedError) {
    return new StorageError({
      code: 'Conflict',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof BlobStoreNotFoundError) {
    return new StorageError({
      code: 'NotFound',
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof BlobStoreSuspendedError) {
    return new StorageError({
      code: 'Unauthorized',
      message: err.message,
      cause: err,
    });
  }
  // AbortSignal-driven cancellations on stream reads surface as plain
  // DOMException / AbortError.
  if (
    err instanceof Error &&
    (err.name === 'AbortError' ||
      (err as { code?: string }).code === 'ABORT_ERR')
  ) {
    return new StorageError({
      code: 'Aborted',
      message: err.message,
      cause: err,
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new StorageError({ code: 'Provider', message, cause: err });
}
