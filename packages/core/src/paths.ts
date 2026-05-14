import { StorageError } from './errors.js';

export function normalizePath(path: string): string {
  if (typeof path !== 'string') {
    throw new StorageError({
      code: 'InvalidArgument',
      message: 'path must be a string',
    });
  }
  const trimmed = path.replace(/^\/+/, '');
  if (trimmed.length === 0) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: 'path must not be empty',
    });
  }
  return trimmed;
}

/**
 * Strips leading slashes from a list prefix. Unlike `normalizePath`, an empty
 * result is valid: an empty or all-slash prefix means "list everything", which
 * is also how callers express that intent when they omit `prefix` entirely.
 */
export function normalizePrefix(prefix: string): string {
  if (typeof prefix !== 'string') {
    throw new StorageError({
      code: 'InvalidArgument',
      message: 'prefix must be a string',
    });
  }
  return prefix.replace(/^\/+/, '');
}
