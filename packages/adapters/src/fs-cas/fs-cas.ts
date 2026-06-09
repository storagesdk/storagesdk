import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type Adapter,
  checkSignal,
  type DownloadOptions,
  defineAdapter,
  type ForkInfo,
  type ListOptions,
  type ListResult,
  type ReadOnlyAdapter,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  toWebStream,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
} from '@storagesdk/core/adapter';
import { uuidv7 } from 'uuidv7';
import { asStorageError } from './errors.js';
import {
  blobPath,
  bucketDir,
  bucketFilePath,
  type EntryRecord,
  mutate,
  readBucketFile,
  readSnapshotFile,
  type SnapshotFile,
  type StorePaths,
  snapshotFilePath,
  storePaths,
  sweep,
  writeBlob,
  writeBucketFile,
  writeSnapshotFile,
} from './store.js';

export interface FsCasConfig {
  /** The store root. `data/`, `buckets/`, and `tmp/` live under it. */
  root: string;
  /** The bucket this adapter operates on. */
  bucket: string;
}

/**
 * Content-addressed filesystem adapter. Primarily for local development and
 * tests. Blobs are stored once under `data/` keyed by their BLAKE2b-512
 * hash; each bucket is a JSON map from key to hash, so identical content is
 * deduplicated and snapshots, forks, `copy`, and `move` touch metadata only.
 *
 * Deleting a key (or snapshot/fork) sweeps the store: a blob is removed
 * from disk only when no bucket or snapshot references it anymore.
 *
 * `url()` returns a `file://` URL pointing at the immutable blob —
 * explicitly not signed, useful only for local development. `uploadUrl()`
 * throws `NotSupported`: the blob path IS the content hash, which is
 * unknowable before the bytes arrive.
 */
export function fsCas(config: FsCasConfig): Adapter {
  return defineAdapter(createImpl(config.root, config.bucket));
}

/** EntryRecord → StorageItemMeta. The etag is the content hash. */
function entryToMeta(key: string, record: EntryRecord): StorageItemMeta {
  return {
    path: key,
    size: record.size,
    contentType: record.contentType ?? 'application/octet-stream',
    etag: record.hash,
    lastModified: record.lastModified,
    ...(record.metadata !== undefined ? { metadata: record.metadata } : {}),
  };
}

function fileUrl(filePath: string, expiresIn?: number): string {
  // pathToFileURL handles platform differences correctly (drive letters on
  // Windows, URL-encoding of special characters). Same scheme as the fs
  // adapter: the `expires` parameter is informational, nothing enforces it.
  const u = pathToFileURL(filePath);
  if (expiresIn !== undefined) {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    u.searchParams.set('expires', String(expiresAt));
  }
  return u.toString();
}

/**
 * The four read methods over an entries map. The live adapter reads the
 * bucket's current entries; snapshot readers read a frozen snapshot file.
 * Both resolve bytes the same way — by hash, from `data/`.
 */
function entryReaders(
  paths: StorePaths,
  getEntries: () => Promise<Record<string, EntryRecord>>
): ReadOnlyAdapter {
  async function lookup(key: string): Promise<EntryRecord> {
    const entries = await getEntries();
    const record = entries[key];
    if (!record) {
      throw new StorageError({
        code: 'NotFound',
        message: `${key} not found`,
      });
    }
    return record;
  }

  return {
    async download(key, opts?: DownloadOptions): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const record = await lookup(key);
      let bytes: Uint8Array;
      try {
        bytes = await fsp.readFile(
          blobPath(paths, record.hash),
          opts?.signal ? { signal: opts.signal } : undefined
        );
      } catch (err) {
        throw asStorageError(err);
      }
      const meta = entryToMeta(key, record);
      // Range reads: slice the in-memory bytes. The contract says `length`
      // past EOF returns whatever bytes exist (no error), which `subarray`
      // happily clamps. `size` reflects the actual slice.
      if (opts?.range) {
        const { offset, length } = opts.range;
        const slice = bytes.subarray(offset, offset + length);
        const sliced = new Uint8Array(slice.byteLength);
        sliced.set(slice);
        return { ...meta, size: sliced.byteLength, body: sliced };
      }
      return { ...meta, body: new Uint8Array(bytes) };
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      return entryToMeta(key, await lookup(key));
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const prefix = opts?.prefix ?? '';
      const limit = opts?.limit ?? 100;
      const cursor = opts?.cursor ?? '';
      const entries = await getEntries();
      const matching = Object.keys(entries)
        .filter((key) => key.startsWith(prefix) && key > cursor)
        .sort();
      const page = matching.slice(0, limit);
      const items: StorageItemMeta[] = [];
      for (const key of page) {
        const record = entries[key];
        if (record) items.push(entryToMeta(key, record));
      }
      const hasMore = matching.length > limit;
      const last = page[page.length - 1];
      return hasMore && last !== undefined
        ? { items, cursor: last }
        : { items };
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      const record = await lookup(key);
      return fileUrl(blobPath(paths, record.hash), opts?.expiresIn);
    },
  };
}

function createImpl(root: string, bucket: string): Adapter {
  const paths = storePaths(root);
  const readBucket = () => readBucketFile(paths, bucket);
  const readers = entryReaders(paths, async () => (await readBucket()).entries);

  return {
    name: 'fs-cas',
    raw: { root: paths.root, bucket },

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      return mutate(paths, async () => {
        const { hash, size } = await writeBlob(
          paths,
          toWebStream(body),
          opts?.signal
        );
        const file = await readBucket();
        const previous = file.entries[key];
        const record: EntryRecord = {
          hash,
          size,
          lastModified: new Date(),
          ...(opts?.contentType !== undefined
            ? { contentType: opts.contentType }
            : {}),
          ...(opts?.metadata !== undefined &&
          Object.keys(opts.metadata).length > 0
            ? { metadata: opts.metadata }
            : {}),
        };
        file.entries[key] = record;
        await writeBucketFile(paths, file);
        if (previous && previous.hash !== hash) {
          await sweep(paths, new Set([previous.hash]));
        }
        return entryToMeta(key, record);
      });
    },

    download: readers.download,
    head: readers.head,
    list: readers.list,
    url: readers.url,

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      await mutate(paths, async () => {
        const file = await readBucket();
        const previous = file.entries[key];
        if (!previous) return; // no-op, like fs's `rm -f`
        delete file.entries[key];
        await writeBucketFile(paths, file);
        await sweep(paths, new Set([previous.hash]));
      });
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      await mutate(paths, async () => {
        const file = await readBucket();
        const source = file.entries[from];
        if (!source) {
          throw new StorageError({
            code: 'NotFound',
            message: `${from} not found`,
          });
        }
        const displaced = file.entries[to];
        file.entries[to] = { ...source, lastModified: new Date() };
        await writeBucketFile(paths, file);
        if (displaced && displaced.hash !== source.hash) {
          await sweep(paths, new Set([displaced.hash]));
        }
      });
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      await mutate(paths, async () => {
        const file = await readBucket();
        const source = file.entries[from];
        if (!source) {
          throw new StorageError({
            code: 'NotFound',
            message: `${from} not found`,
          });
        }
        const displaced = file.entries[to];
        file.entries[to] = { ...source, lastModified: new Date() };
        delete file.entries[from];
        await writeBucketFile(paths, file);
        // `from`'s hash lives on at `to`; only the displaced destination
        // content can be orphaned.
        if (displaced && displaced.hash !== source.hash) {
          await sweep(paths, new Set([displaced.hash]));
        }
      });
    },

    async uploadUrl(
      _key: string,
      opts?: UploadUrlOptions
    ): Promise<UploadUrlResult> {
      checkSignal(opts?.signal);
      throw new StorageError({
        code: 'NotSupported',
        message:
          'fs-cas cannot presign uploads: the blob path is the content hash, unknown before the bytes arrive',
      });
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        return mutate(paths, async () => {
          const file = await readBucket();
          const id = uuidv7();
          const createdAt = new Date();
          const snapshot: SnapshotFile = {
            version: 1,
            id,
            createdAt,
            ...(opts?.name !== undefined ? { name: opts.name } : {}),
            entries: { ...file.entries },
          };
          try {
            await writeSnapshotFile(paths, bucket, snapshot);
            const info: SnapshotInfo = {
              id,
              createdAt,
              ...(opts?.name !== undefined ? { name: opts.name } : {}),
            };
            file.snapshots.push(info);
            await writeBucketFile(paths, file);
            return info;
          } catch (err) {
            // Best-effort rollback — don't leave an orphan snapshot file.
            await fsp
              .rm(snapshotFilePath(paths, bucket, id), { force: true })
              .catch(() => {});
            throw asStorageError(err);
          }
        });
      },

      async list(): Promise<SnapshotInfo[]> {
        return (await readBucket()).snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const file = await readBucket();
        const found = file.snapshots.find((s) => s.id === id);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return found;
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        await mutate(paths, async () => {
          const file = await readBucket();
          // Learn which blobs the snapshot pinned before removing it. A
          // missing file just means there's nothing to sweep.
          let pinned = new Set<string>();
          try {
            const snapshot = await readSnapshotFile(paths, bucket, id);
            pinned = new Set(
              Object.values(snapshot.entries).map((r) => r.hash)
            );
          } catch (err) {
            if (!(err instanceof StorageError && err.code === 'NotFound')) {
              throw err;
            }
          }
          try {
            await fsp.rm(snapshotFilePath(paths, bucket, id), { force: true });
          } catch (err) {
            throw asStorageError(err);
          }
          file.snapshots = file.snapshots.filter((s) => s.id !== id);
          await writeBucketFile(paths, file);
          await sweep(paths, pinned);
        });
      },

      get(id): ReadOnlyAdapter {
        // Each read resolves through the frozen snapshot file — reads stay
        // frozen by construction, and blobs it references are never swept
        // while the file exists.
        return entryReaders(
          paths,
          async () => (await readSnapshotFile(paths, bucket, id)).entries
        );
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        return mutate(paths, async () => {
          if (existsSync(bucketFilePath(paths, opts.name))) {
            throw new StorageError({
              code: 'Conflict',
              message: `fork ${opts.name} already exists`,
            });
          }
          // Seed from a named snapshot or live state. Either way it's a
          // metadata copy — the fork shares the parent's blobs.
          let entries: Record<string, EntryRecord>;
          if (opts.fromSnapshot !== undefined) {
            const snapshot = await readSnapshotFile(
              paths,
              bucket,
              opts.fromSnapshot
            );
            entries = { ...snapshot.entries };
          } else {
            entries = { ...(await readBucket()).entries };
          }
          try {
            await writeBucketFile(paths, {
              version: 1,
              bucket: opts.name,
              parent: {
                location: bucket,
                snapshotId: opts.fromSnapshot ?? null,
              },
              snapshots: [],
              forks: [],
              entries,
            });
            const file = await readBucket();
            const info: ForkInfo = {
              name: opts.name,
              createdAt: new Date(),
              ...(opts.fromSnapshot !== undefined
                ? { fromSnapshot: opts.fromSnapshot }
                : {}),
            };
            file.forks.push(info);
            await writeBucketFile(paths, file);
            return info;
          } catch (err) {
            // Best-effort rollback — remove the partial fork bucket.
            await fsp
              .rm(bucketDir(paths, opts.name), {
                recursive: true,
                force: true,
              })
              .catch(() => {});
            throw asStorageError(err);
          }
        });
      },

      async list(): Promise<ForkInfo[]> {
        return (await readBucket()).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const file = await readBucket();
        const found = file.forks.find((f) => f.name === name);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return found;
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        await mutate(paths, async () => {
          // Gather every hash the fork (and its snapshots) referenced so
          // they can be swept once the fork's bucket folder is gone.
          const pinned = new Set<string>();
          const forkFile = await readBucketFile(paths, name);
          for (const record of Object.values(forkFile.entries)) {
            pinned.add(record.hash);
          }
          const snapsDir = path.join(bucketDir(paths, name), 'snapshots');
          let snaps: string[] = [];
          try {
            snaps = await fsp.readdir(snapsDir);
          } catch {
            // No snapshots folder — nothing extra pinned.
          }
          for (const filename of snaps) {
            const id = filename.replace(/\.json$/, '');
            try {
              const snapshot = await readSnapshotFile(paths, name, id);
              for (const record of Object.values(snapshot.entries)) {
                pinned.add(record.hash);
              }
            } catch {
              // Unreadable snapshot — its references die with the folder.
            }
          }
          try {
            await fsp.rm(bucketDir(paths, name), {
              recursive: true,
              force: true,
            });
          } catch (err) {
            throw asStorageError(err);
          }
          const file = await readBucket();
          file.forks = file.forks.filter((f) => f.name !== name);
          await writeBucketFile(paths, file);
          await sweep(paths, pinned);
        });
      },

      get(name): Adapter {
        // Throw synchronously: a writable fork has no useful "empty" mode.
        // Outer `defineAdapter` (in `fsCas()`) wraps the raw impl exactly
        // once via its recursive `forks.get`, so this stays single-wrapped.
        if (!existsSync(bucketFilePath(paths, name))) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return createImpl(root, name);
      },
    },
  };
}
