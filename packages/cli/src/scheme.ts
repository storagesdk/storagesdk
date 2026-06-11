/**
 * `cp` / `mv` accept three kinds of path arguments:
 * - `storage://<key>` — an object on the selected adapter (--adapter or
 *   STORAGE_ADAPTER decides which backend).
 * - `-` — stdin (as source) or stdout (as destination).
 * - anything else — a local filesystem path.
 *
 * The scheme is generic (not adapter-named) because the adapter is
 * already selected via flag/env; embedding `s3://` or `tigris://` in
 * the URL would duplicate that information.
 */
export type Path =
  | { kind: 'remote'; path: string }
  | { kind: 'local'; path: string }
  | { kind: 'stdio' };

const STORAGE_SCHEME = 'storage://';

export function parsePath(input: string): Path {
  if (input === '-') return { kind: 'stdio' };
  if (input.startsWith(STORAGE_SCHEME)) {
    return { kind: 'remote', path: input.slice(STORAGE_SCHEME.length) };
  }
  return { kind: 'local', path: input };
}
