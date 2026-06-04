import { StorageError } from '@storagesdk/core';

/**
 * Canonicalize a user-supplied scope so prefix checks have a stable
 * boundary. Strips leading slashes, ensures a trailing slash. Empty
 * input (or whitespace) becomes `''` (scope disabled).
 *
 * Required because `'agents'` without a trailing slash would let
 * `'agents-private/file.txt'` slip past the prefix check.
 */
export function normalizeScope(scope: string | undefined): string {
  if (!scope) return '';
  const stripped = scope.replace(/^\/+/, '');
  if (!stripped) return '';
  return stripped.endsWith('/') ? stripped : `${stripped}/`;
}

/**
 * Throws if `path` is not within `scope`. No-op when `scope` is empty.
 * Leading slashes on `path` are stripped first (same convention as
 * `defineAdapter`).
 */
export function checkScope(scope: string, path: string): void {
  if (!scope) return;
  const clean = path.replace(/^\/+/, '');
  if (!clean.startsWith(scope)) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `Path "${path}" is outside the allowed scope "${scope}".`,
    });
  }
}
