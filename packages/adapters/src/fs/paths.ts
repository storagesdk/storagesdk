import * as path from 'node:path';
import { StorageError } from '@storagesdk/core';

export const MANIFEST_FILENAME = '.storagesdk.metadata.json';
export const SIDECAR_SUFFIX = '.storagesdk.meta.json';

/**
 * Resolve a key against the folder, rejecting any path that escapes via `..`.
 * Returns the absolute path on disk.
 */
export function resolveSafe(folderPath: string, key: string): string {
  const full = path.resolve(folderPath, key);
  const root = path.resolve(folderPath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `path "${key}" escapes the adapter folder`,
    });
  }
  return full;
}

/** Returns the sidecar path for an object's full path on disk. */
export function sidecarPath(filePath: string): string {
  return filePath + SIDECAR_SUFFIX;
}

/**
 * Resolve a snapshot/fork sibling name against `root`, rejecting any name
 * that resolves outside `root` or to anything other than a direct child of
 * `root`. Catches path-traversal inputs (`../etc`), names with separators
 * (`foo/bar`), and meta-paths (`.`, `..`).
 */
export function resolveSiblingSafe(root: string, name: string): string {
  const resolved = path.resolve(root, name);
  const rootAbs = path.resolve(root);
  if (resolved === rootAbs || path.dirname(resolved) !== rootAbs) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `invalid sibling name: "${name}"`,
    });
  }
  return resolved;
}

/**
 * True for keys the SDK reserves (per-location manifest, per-object sidecars).
 * Used to reject uploads to reserved keys and to filter `list()` results.
 */
export function isReservedKey(key: string): boolean {
  return key === MANIFEST_FILENAME || key.endsWith(SIDECAR_SUFFIX);
}

/** Convert an OS-specific relative path to a forward-slash key. */
export function toKey(rel: string): string {
  return rel.split(path.sep).join('/');
}
