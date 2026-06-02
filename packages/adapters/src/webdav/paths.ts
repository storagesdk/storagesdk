import { posix } from 'node:path';
import { StorageError } from '@storagesdk/core';

/**
 * Resolve a key against the remote folder, rejecting any path that
 * escapes via `..`. Returns an absolute POSIX path on the WebDAV
 * server. WebDAV paths are always forward-slash regardless of host OS.
 */
export function resolveSafe(folderPath: string, key: string): string {
  const full = posix.resolve(folderPath, key);
  const root = posix.resolve(folderPath);
  if (full !== root && !full.startsWith(`${root}/`)) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `path "${key}" escapes the adapter folder`,
    });
  }
  return full;
}

/**
 * Resolve a snapshot/fork sibling name against `root`, rejecting any
 * name that resolves outside `root` or to anything other than a direct
 * child of `root`. Catches path-traversal (`../etc`), names with
 * separators (`foo/bar`), and meta-paths (`.`, `..`).
 */
export function resolveSiblingSafe(root: string, name: string): string {
  const resolved = posix.resolve(root, name);
  const rootAbs = posix.resolve(root);
  if (resolved === rootAbs || posix.dirname(resolved) !== rootAbs) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `invalid sibling name: "${name}"`,
    });
  }
  return resolved;
}
