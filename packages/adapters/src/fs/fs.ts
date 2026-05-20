import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type Adapter,
  type BodyInput,
  defineAdapter,
  emptyManifest,
  type ForkInfo,
  isInternalKey,
  type ListOptions,
  type ListResult,
  nextSnapshotId,
  type ReadOnlyAdapter,
  readManifest,
  readStreamToBytes,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
  writeManifest,
} from '@storagesdk/core/adapter';
import { asStorageError } from './errors.js';
import {
  isReservedKey,
  resolveSafe,
  resolveSiblingSafe,
  SIDECAR_SUFFIX,
  toKey,
} from './paths.js';
import {
  copySidecar,
  deleteSidecar,
  readSidecar,
  renameSidecar,
  writeSidecar,
} from './sidecar.js';

export interface FsConfig {
  /** Parent directory under which the folder and its siblings live. */
  root: string;
  /** The folder this adapter operates on. Lives at `<root>/<folder>`. */
  folder: string;
}

/**
 * Filesystem adapter. Primarily for local development and tests. Uses
 * `node:fs/promises` for I/O, follows the Phase 2 snapshot/fork convention
 * (each snapshot/fork is a sibling folder under `root`).
 *
 * `opts.metadata` and non-default `contentType` are preserved via a sidecar
 * file `<key>.storagesdk.meta.json`. `url()` and `uploadUrl()` return
 * `file://` URLs with an `expires` parameter — explicitly not signed,
 * useful only for local development.
 */
export function fs(config: FsConfig): Adapter {
  return defineAdapter(createImpl(config));
}

async function bodyToBytes(body: BodyInput): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ReadableStream) return readStreamToBytes(body);
  throw new StorageError({
    code: 'InvalidArgument',
    message: 'unsupported body type',
  });
}

/** stat → StorageItemMeta. For `head()` and `download()` (full info). */
async function statToMeta(
  filePath: string,
  key: string
): Promise<StorageItemMeta> {
  let stat: Awaited<ReturnType<typeof fsp.stat>>;
  try {
    stat = await fsp.stat(filePath);
  } catch (err) {
    throw asStorageError(err);
  }
  const sidecar = await readSidecar(filePath);
  const base: StorageItemMeta = {
    path: key,
    size: stat.size,
    contentType: sidecar?.contentType ?? 'application/octet-stream',
    etag: `${stat.size}-${stat.mtimeMs}`,
    lastModified: stat.mtime,
  };
  return sidecar?.metadata !== undefined
    ? { ...base, metadata: sidecar.metadata }
    : base;
}

/** stat → StorageItemMeta. For `list()` — skips the sidecar read for speed. */
async function statToListMeta(
  filePath: string,
  key: string
): Promise<StorageItemMeta> {
  let stat: Awaited<ReturnType<typeof fsp.stat>>;
  try {
    stat = await fsp.stat(filePath);
  } catch (err) {
    throw asStorageError(err);
  }
  return {
    path: key,
    size: stat.size,
    contentType: 'application/octet-stream',
    etag: `${stat.size}-${stat.mtimeMs}`,
    lastModified: stat.mtime,
  };
}

function fileUrl(filePath: string, expiresIn?: number): string {
  // pathToFileURL handles platform differences correctly. On Windows it
  // produces `file:///C:/...` (the drive letter would otherwise be parsed as
  // the URL's host); on POSIX it produces `file:///absolute/path`. It also
  // URL-encodes characters like `?` and `#` that would break a hand-built URL.
  const u = pathToFileURL(filePath);
  if (expiresIn !== undefined) {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    u.searchParams.set('expires', String(expiresAt));
  }
  return u.toString();
}

/**
 * Walk the folder recursively, yielding keys (forward-slash, relative to
 * `folderPath`). Skips reserved keys (the per-location manifest and any
 * sidecars).
 */
async function* walk(dir: string, folderPath: string): AsyncGenerator<string> {
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return;
    }
    throw asStorageError(err);
  }
  for (const name of names) {
    const full = path.join(dir, name);
    let info: Awaited<ReturnType<typeof fsp.stat>>;
    try {
      info = await fsp.stat(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      yield* walk(full, folderPath);
    } else if (info.isFile()) {
      const rel = path.relative(folderPath, full);
      const key = toKey(rel);
      // Skip both the SDK manifest (stored as an object at `MANIFEST_PATH`
      // for this adapter) and FS-specific sidecars. Filtering pre-pagination
      // here keeps `list({ limit: N })` returning exactly N user items.
      if (isInternalKey(key) || isReservedKey(key)) continue;
      yield key;
    }
  }
}

function createImpl(config: FsConfig): Adapter {
  const folderPath = path.join(config.root, config.folder);

  return {
    name: 'fs',
    raw: { root: config.root, folder: config.folder, folderPath },

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      // The manifest path flows through `upload` from the SDK's own
      // `writeManifest` helper, so we can't reject it. The sidecar suffix
      // IS rejected — only the adapter's own logic writes sidecars.
      if (key.endsWith(SIDECAR_SUFFIX)) {
        throw new StorageError({
          code: 'InvalidArgument',
          message: `key "${key}" uses the reserved sidecar suffix`,
        });
      }
      const fullPath = resolveSafe(folderPath, key);
      const bytes = await bodyToBytes(body);
      try {
        await fsp.mkdir(path.dirname(fullPath), { recursive: true });
        await fsp.writeFile(fullPath, bytes);
      } catch (err) {
        throw asStorageError(err);
      }
      await writeSidecar(fullPath, {
        contentType: opts?.contentType,
        metadata: opts?.metadata,
      });
      return statToMeta(fullPath, key);
    },

    async download(key): Promise<StorageItem> {
      const fullPath = resolveSafe(folderPath, key);
      let bytes: Uint8Array;
      try {
        bytes = await fsp.readFile(fullPath);
      } catch (err) {
        throw asStorageError(err);
      }
      const meta = await statToMeta(fullPath, key);
      return { ...meta, body: new Uint8Array(bytes) };
    },

    async head(key): Promise<StorageItemMeta> {
      const fullPath = resolveSafe(folderPath, key);
      return statToMeta(fullPath, key);
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      const prefix = opts?.prefix ?? '';
      const limit = opts?.limit ?? 100;
      const cursor = opts?.cursor ?? '';

      const matching: string[] = [];
      for await (const key of walk(folderPath, folderPath)) {
        if (!key.startsWith(prefix)) continue;
        if (key <= cursor) continue;
        matching.push(key);
      }
      matching.sort();
      const page = matching.slice(0, limit);
      const items = await Promise.all(
        page.map((k) => statToListMeta(resolveSafe(folderPath, k), k))
      );
      const hasMore = matching.length > limit;
      const last = page[page.length - 1];
      return hasMore && last !== undefined
        ? { items, cursor: last }
        : { items };
    },

    async delete(key): Promise<void> {
      const fullPath = resolveSafe(folderPath, key);
      try {
        await fsp.rm(fullPath, { force: true });
      } catch (err) {
        throw asStorageError(err);
      }
      await deleteSidecar(fullPath);
    },

    async copy(from, to): Promise<void> {
      const fromPath = resolveSafe(folderPath, from);
      const toPath = resolveSafe(folderPath, to);
      try {
        await fsp.mkdir(path.dirname(toPath), { recursive: true });
        await fsp.copyFile(fromPath, toPath);
      } catch (err) {
        throw asStorageError(err);
      }
      await copySidecar(fromPath, toPath);
    },

    async move(from, to): Promise<void> {
      const fromPath = resolveSafe(folderPath, from);
      const toPath = resolveSafe(folderPath, to);
      try {
        await fsp.mkdir(path.dirname(toPath), { recursive: true });
        await fsp.rename(fromPath, toPath);
      } catch (err) {
        throw asStorageError(err);
      }
      await renameSidecar(fromPath, toPath);
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      const fullPath = resolveSafe(folderPath, key);
      if (!existsSync(fullPath)) {
        throw new StorageError({
          code: 'NotFound',
          message: `${key} not found`,
        });
      }
      return fileUrl(fullPath, opts?.expiresIn);
    },

    async uploadUrl(key, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      const fullPath = resolveSafe(folderPath, key);
      return { method: 'PUT', url: fileUrl(fullPath, opts?.expiresIn) };
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        try {
          await fsp.mkdir(folderPath, { recursive: true });
        } catch (err) {
          throw asStorageError(err);
        }
        const id = nextSnapshotId(config.folder);
        const snapPath = resolveSiblingSafe(config.root, id);

        try {
          await fsp.cp(folderPath, snapPath, { recursive: true });
        } catch (err) {
          throw asStorageError(err);
        }

        // Overwrite the copied parent's manifest with the snapshot's own.
        const snapImpl = createImpl({ root: config.root, folder: id });
        await writeManifest(
          snapImpl,
          emptyManifest({ location: config.folder, snapshotId: null })
        );

        const thisImpl = createImpl(config);
        const meta = await readManifest(thisImpl);
        const info: SnapshotInfo = {
          id,
          createdAt: new Date(),
          ...(opts?.name !== undefined ? { name: opts.name } : {}),
        };
        meta.snapshots.push(info);
        await writeManifest(thisImpl, meta);
        return info;
      },

      async list(): Promise<SnapshotInfo[]> {
        const thisImpl = createImpl(config);
        return (await readManifest(thisImpl)).snapshots;
      },

      async head(id): Promise<SnapshotInfo> {
        const thisImpl = createImpl(config);
        const meta = await readManifest(thisImpl);
        const found = meta.snapshots.find((s) => s.id === id);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return found;
      },

      async delete(id): Promise<void> {
        const snapPath = resolveSiblingSafe(config.root, id);
        const thisImpl = createImpl(config);
        const meta = await readManifest(thisImpl);
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        try {
          await fsp.rm(snapPath, { recursive: true, force: true });
        } catch (err) {
          throw asStorageError(err);
        }
        await writeManifest(thisImpl, meta);
      },

      get(id): ReadOnlyAdapter {
        // Returns a `ReadOnlyAdapter` rooted at the snapshot's folder. The
        // contract guarantees only read methods are visible to callers; the
        // filesystem itself isn't chmodded read-only. `resolveSiblingSafe`
        // is called eagerly so a traversal-style id throws synchronously
        // rather than waiting for first read.
        resolveSiblingSafe(config.root, id);
        const snapImpl = createImpl({ root: config.root, folder: id });
        return {
          download: (p, opts) => snapImpl.download(p, opts),
          head: (p, opts) => snapImpl.head(p, opts),
          list: (opts) => snapImpl.list(opts),
          url: (p, opts) => snapImpl.url(p, opts),
        };
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        const forkPath = resolveSiblingSafe(config.root, opts.name);
        if (existsSync(forkPath)) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }

        // Seed the fork from either a named snapshot or the parent's live
        // state. Both are just recursive copies of a sibling folder.
        let sourcePath: string;
        if (opts.fromSnapshot !== undefined) {
          sourcePath = resolveSiblingSafe(config.root, opts.fromSnapshot);
          if (!existsSync(sourcePath)) {
            throw new StorageError({
              code: 'NotFound',
              message: `snapshot ${opts.fromSnapshot} not found`,
            });
          }
        } else {
          sourcePath = folderPath;
        }

        try {
          await fsp.cp(sourcePath, forkPath, { recursive: true });
        } catch (err) {
          throw asStorageError(err);
        }

        const forkImpl = createImpl({ root: config.root, folder: opts.name });
        await writeManifest(
          forkImpl,
          emptyManifest({
            location: config.folder,
            snapshotId: opts.fromSnapshot ?? null,
          })
        );

        const thisImpl = createImpl(config);
        const meta = await readManifest(thisImpl);
        const info: ForkInfo = {
          name: opts.name,
          createdAt: new Date(),
          ...(opts.fromSnapshot !== undefined
            ? { fromSnapshot: opts.fromSnapshot }
            : {}),
        };
        meta.forks.push(info);
        await writeManifest(thisImpl, meta);
        return info;
      },

      async list(): Promise<ForkInfo[]> {
        const thisImpl = createImpl(config);
        return (await readManifest(thisImpl)).forks;
      },

      async head(name): Promise<ForkInfo> {
        const thisImpl = createImpl(config);
        const meta = await readManifest(thisImpl);
        const found = meta.forks.find((f) => f.name === name);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return found;
      },

      async delete(name): Promise<void> {
        const forkPath = resolveSiblingSafe(config.root, name);
        const thisImpl = createImpl(config);
        const meta = await readManifest(thisImpl);
        meta.forks = meta.forks.filter((f) => f.name !== name);
        try {
          await fsp.rm(forkPath, { recursive: true, force: true });
        } catch (err) {
          throw asStorageError(err);
        }
        await writeManifest(thisImpl, meta);
      },

      get(name): Adapter {
        // Throw synchronously: a writable fork has no useful "empty" mode.
        // Outer `defineAdapter` (in `fs()`) wraps the raw impl exactly once
        // via its recursive `forks.get`, so this stays single-wrapped.
        const forkPath = resolveSiblingSafe(config.root, name);
        if (!existsSync(forkPath)) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return createImpl({ root: config.root, folder: name });
      },
    },
  };
}
