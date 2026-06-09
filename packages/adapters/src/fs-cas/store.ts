import { createWriteStream } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import {
  type ForkInfo,
  type Manifest,
  type SnapshotInfo,
  StorageError,
} from '@storagesdk/core/adapter';
import { uuidv7 } from 'uuidv7';
import { asStorageError } from './errors.js';
import { newContentHash } from './hash.js';

/** Resolved locations of the store's three top-level folders. */
export interface StorePaths {
  root: string;
  dataDir: string;
  bucketsDir: string;
  tmpDir: string;
}

export function storePaths(root: string): StorePaths {
  const abs = path.resolve(root);
  return {
    root: abs,
    dataDir: path.join(abs, 'data'),
    bucketsDir: path.join(abs, 'buckets'),
    tmpDir: path.join(abs, 'tmp'),
  };
}

/** A blob's home: `data/<hh>/<rest-of-hash>`. */
export function blobPath(paths: StorePaths, hash: string): string {
  return path.join(paths.dataDir, hash.slice(0, 2), hash.slice(2));
}

/**
 * A bucket's folder: `buckets/<name>`. Bucket and fork names are literal
 * directory segments, so any name that resolves outside `buckets/` or to
 * anything other than a direct child is rejected — traversal inputs
 * (`../etc`), names with separators (`foo/bar`), and meta-paths (`.`, `..`).
 * Same rule as the fs adapter's sibling names.
 */
export function bucketDir(paths: StorePaths, bucketName: string): string {
  const resolved = path.resolve(paths.bucketsDir, bucketName);
  if (
    resolved === paths.bucketsDir ||
    path.dirname(resolved) !== paths.bucketsDir
  ) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `invalid bucket name: "${bucketName}"`,
    });
  }
  return resolved;
}

export function bucketFilePath(paths: StorePaths, bucketName: string): string {
  return path.join(bucketDir(paths, bucketName), 'bucket.json');
}

export function snapshotFilePath(
  paths: StorePaths,
  bucketName: string,
  id: string
): string {
  return path.join(bucketDir(paths, bucketName), 'snapshots', `${id}.json`);
}

/**
 * One key's record in a bucket's `entries` map. Per-key facts live here —
 * the blob itself holds only bytes, so two keys sharing content can still
 * differ in contentType/metadata. `lastModified` is a `Date` in memory and
 * an ISO string on disk (`JSON.stringify` serializes, `reviveDates` restores).
 */
export interface EntryRecord {
  hash: string;
  size: number;
  contentType?: string;
  metadata?: Record<string, string>;
  lastModified: Date;
}

/**
 * The shape of `bucket.json`. Carries the SDK `Manifest` fields inline
 * (`parent`/`snapshots`/`forks`) — the manifest is NOT stored as an object
 * in the key namespace.
 */
export interface BucketFile {
  version: 1;
  bucket: string;
  parent: Manifest['parent'];
  snapshots: SnapshotInfo[];
  forks: ForkInfo[];
  entries: Record<string, EntryRecord>;
}

/** The shape of a frozen snapshot at `snapshots/<id>.json`. */
export interface SnapshotFile {
  version: 1;
  id: string;
  name?: string;
  createdAt: Date;
  entries: Record<string, EntryRecord>;
}

/** JSON reviver restoring the two date fields, like core's `parseManifest`. */
function reviveDates(key: string, value: unknown): unknown {
  return (key === 'createdAt' || key === 'lastModified') &&
    typeof value === 'string'
    ? new Date(value)
    : value;
}

function isEnoent(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}

export function emptyBucketFile(bucketName: string): BucketFile {
  return {
    version: 1,
    bucket: bucketName,
    parent: null,
    snapshots: [],
    forks: [],
    entries: {},
  };
}

/**
 * Read a bucket's `bucket.json`. Returns a fresh empty file when it doesn't
 * exist yet, so first-write bootstrap and "fork an empty parent" need no
 * special casing. Throws `NotSupported` on an unrecognized version so older
 * readers never mis-read a future schema.
 */
export async function readBucketFile(
  paths: StorePaths,
  bucketName: string
): Promise<BucketFile> {
  let text: string;
  try {
    text = await fsp.readFile(bucketFilePath(paths, bucketName), 'utf8');
  } catch (err) {
    if (isEnoent(err)) return emptyBucketFile(bucketName);
    throw asStorageError(err);
  }
  const parsed = JSON.parse(text, reviveDates) as Partial<BucketFile> | null;
  if (!parsed || parsed.version !== 1) {
    throw new StorageError({
      code: 'NotSupported',
      message: `bucket file version ${parsed?.version} not supported by this SDK (expected 1)`,
    });
  }
  return {
    version: 1,
    bucket: parsed.bucket ?? bucketName,
    parent: parsed.parent ?? null,
    snapshots: parsed.snapshots ?? [],
    forks: parsed.forks ?? [],
    entries: parsed.entries ?? {},
  };
}

export async function writeBucketFile(
  paths: StorePaths,
  file: BucketFile
): Promise<void> {
  await writeJsonAtomic(paths, bucketFilePath(paths, file.bucket), file);
}

/** Read a snapshot file. Throws `NotFound` when the id doesn't exist. */
export async function readSnapshotFile(
  paths: StorePaths,
  bucketName: string,
  id: string
): Promise<SnapshotFile> {
  let text: string;
  try {
    text = await fsp.readFile(snapshotFilePath(paths, bucketName, id), 'utf8');
  } catch (err) {
    if (isEnoent(err)) {
      throw new StorageError({
        code: 'NotFound',
        message: `snapshot ${id} not found`,
      });
    }
    throw asStorageError(err);
  }
  const parsed = JSON.parse(text, reviveDates) as Partial<SnapshotFile> | null;
  if (!parsed || parsed.version !== 1) {
    throw new StorageError({
      code: 'NotSupported',
      message: `snapshot file version ${parsed?.version} not supported by this SDK (expected 1)`,
    });
  }
  return {
    version: 1,
    id: parsed.id ?? id,
    ...(parsed.name !== undefined ? { name: parsed.name } : {}),
    createdAt: parsed.createdAt ?? new Date(0),
    entries: parsed.entries ?? {},
  };
}

export async function writeSnapshotFile(
  paths: StorePaths,
  bucketName: string,
  file: SnapshotFile
): Promise<void> {
  await writeJsonAtomic(
    paths,
    snapshotFilePath(paths, bucketName, file.id),
    file
  );
}

/**
 * Write JSON atomically: stage in `tmp/` (same filesystem as the
 * destination, so `rename` is atomic), then rename into place. A crash
 * mid-write leaves a stray temp file, never a torn JSON document.
 */
async function writeJsonAtomic(
  paths: StorePaths,
  dest: string,
  value: unknown
): Promise<void> {
  const tmpFile = path.join(paths.tmpDir, `${uuidv7()}.json`);
  try {
    await fsp.mkdir(paths.tmpDir, { recursive: true });
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(tmpFile, JSON.stringify(value));
    await fsp.rename(tmpFile, dest);
  } catch (err) {
    await fsp.rm(tmpFile, { force: true }).catch(() => {});
    throw asStorageError(err);
  }
}

/**
 * Stream a body into the store: pipe to a temp file while hashing
 * incrementally (constant memory), then rename to `data/<hh>/<rest>`.
 * If the blob already exists the staged copy is discarded — dedup.
 */
export async function writeBlob(
  paths: StorePaths,
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<{ hash: string; size: number }> {
  const tmpFile = path.join(paths.tmpDir, `${uuidv7()}.part`);
  const hasher = newContentHash();
  let size = 0;
  const tap = new Transform({
    transform(chunk: Uint8Array, _enc, cb) {
      hasher.update(chunk);
      size += chunk.byteLength;
      cb(null, chunk);
    },
  });
  try {
    await fsp.mkdir(paths.tmpDir, { recursive: true });
    await pipeline(
      Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>),
      tap,
      createWriteStream(tmpFile),
      signal ? { signal } : {}
    );
    const hash = hasher.digest('hex');
    const dest = blobPath(paths, hash);
    try {
      await fsp.access(dest);
      // Blob already exists — discard the staged copy, reuse the original.
      await fsp.rm(tmpFile, { force: true });
    } catch {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.rename(tmpFile, dest);
    }
    return { hash, size };
  } catch (err) {
    await fsp.rm(tmpFile, { force: true }).catch(() => {});
    throw asStorageError(err);
  }
}

/**
 * Reclaim orphaned blobs. For each candidate hash, scan every bucket's
 * entries and every snapshot in the store; delete the blob only when
 * nothing references it. Reads are best-effort conservative: if any
 * bucket/snapshot file can't be read, the sweep is skipped entirely
 * rather than risking deletion of a still-referenced blob.
 */
export async function sweep(
  paths: StorePaths,
  candidates: Set<string>
): Promise<void> {
  if (candidates.size === 0) return;
  const referenced = new Set<string>();
  try {
    let bucketDirs: string[];
    try {
      bucketDirs = await fsp.readdir(paths.bucketsDir);
    } catch (err) {
      if (!isEnoent(err)) throw err;
      bucketDirs = [];
    }
    for (const dir of bucketDirs) {
      const bucketJson = path.join(paths.bucketsDir, dir, 'bucket.json');
      try {
        const file = JSON.parse(
          await fsp.readFile(bucketJson, 'utf8')
        ) as BucketFile;
        for (const record of Object.values(file.entries)) {
          referenced.add(record.hash);
        }
      } catch (err) {
        // A bucket dir without bucket.json holds no references.
        if (!isEnoent(err)) throw err;
      }
      const snapsDir = path.join(paths.bucketsDir, dir, 'snapshots');
      let snaps: string[];
      try {
        snaps = await fsp.readdir(snapsDir);
      } catch (err) {
        if (!isEnoent(err)) throw err;
        snaps = [];
      }
      for (const name of snaps) {
        try {
          const snap = JSON.parse(
            await fsp.readFile(path.join(snapsDir, name), 'utf8')
          ) as SnapshotFile;
          for (const record of Object.values(snap.entries)) {
            referenced.add(record.hash);
          }
        } catch (err) {
          if (!isEnoent(err)) throw err;
        }
      }
    }
  } catch {
    // Couldn't build a trustworthy reference set — leave blobs in place.
    return;
  }
  for (const hash of candidates) {
    if (referenced.has(hash)) continue;
    await fsp.rm(blobPath(paths, hash), { force: true }).catch(() => {});
  }
}

/**
 * Serialize mutations per store root. Every read-modify-write of
 * `bucket.json` (and the sweep that follows) runs on this in-process
 * promise chain, so concurrent uploads in one process can't lose entries.
 * Cross-process writers are NOT coordinated — like the fs adapter, this
 * adapter is for single-process local development and tests.
 */
const queues = new Map<string, Promise<unknown>>();

export function mutate<T>(paths: StorePaths, fn: () => Promise<T>): Promise<T> {
  const tail = queues.get(paths.root) ?? Promise.resolve();
  const next = tail.then(fn, fn);
  queues.set(
    paths.root,
    next.catch(() => {})
  );
  return next;
}
