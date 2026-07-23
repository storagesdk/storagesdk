import {
  isAbortError,
  StorageError,
  type StorageErrorCode,
} from '@storagesdk/core';
import {
  FileNotFoundInFilesystemError,
  FilesystemAPIError,
  FilesystemNotFoundError,
} from 'tensorlake';

function codeForStatus(status: number): StorageErrorCode {
  if (status === 401 || status === 403) return 'Unauthorized';
  if (status === 404) return 'NotFound';
  if (status === 409) return 'Conflict';
  if (status === 400 || status === 422) return 'InvalidArgument';
  return 'Provider';
}

/**
 * Map a `tensorlake` SDK error to a `StorageError`. The filesystem client
 * surfaces missing files/filesystems as dedicated error classes and other
 * failures as `FilesystemAPIError` carrying the HTTP `statusCode`. Falls back
 * to `Provider` for anything unrecognized.
 */
export function asStorageError(err: unknown, path?: string): StorageError {
  if (err instanceof StorageError) return err;

  const cause = err instanceof Error ? err : undefined;
  if (isAbortError(err)) {
    return new StorageError({ code: 'Aborted', cause });
  }
  if (err instanceof FileNotFoundInFilesystemError) {
    return new StorageError({
      code: 'NotFound',
      message: `${err.path} not found`,
      cause,
    });
  }
  if (err instanceof FilesystemNotFoundError) {
    return new StorageError({
      code: 'NotFound',
      message: `filesystem ${err.filesystemName} not found`,
      cause,
    });
  }
  if (err instanceof FilesystemAPIError) {
    return new StorageError({
      code: codeForStatus(err.statusCode),
      message: err.message,
      cause,
    });
  }
  return new StorageError({
    code: 'Provider',
    message:
      err instanceof Error
        ? err.message
        : path
          ? `${path} failed`
          : 'Tensorlake error',
    cause,
  });
}
