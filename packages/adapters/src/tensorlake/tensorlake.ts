import { createHash } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix as pathPosix } from 'node:path';
import {
  type Adapter,
  type BodyInput,
  bodyToBytes,
  checkSignal,
  defaultDiff,
  defaultMerge,
  defaultRebase,
  defineAdapter,
  emptyManifest,
  type ForkInfo,
  isInternalKey,
  type ListOptions,
  type ListResult,
  type ReadOnlyAdapter,
  readManifest,
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
import {
  type FileEntry,
  type Filesystem,
  FilesystemClient,
  type FilesystemFileRead,
  type FilesystemSnapshot,
  type FilesystemSnapshotInfo,
} from 'tensorlake';
import { asStorageError } from './errors.js';

export interface TensorlakeConfig {
  /** Name of the Tensorlake filesystem (volume) this adapter operates on. */
  filesystem: string;
  /** API key. Falls back to `TENSORLAKE_API_KEY` / `TENSORLAKE_PAT` in the SDK. */
  apiKey?: string;
  /** REST API base URL. */
  apiUrl?: string;
  /** Organization id used to scope requests. */
  organizationId?: string;
  /** Project id used to scope requests. */
  projectId?: string;
}

export type TensorlakeRaw = FilesystemClient;

const SNAPSHOT_MESSAGE_PREFIX = 'storagesdk:snapshot:v1:';

const forkFilesystemName = (parent: string, name: string): string =>
  `storagesdk-fork-${createHash('sha256')
    .update(JSON.stringify([parent, name]))
    .digest('hex')
    .slice(0, 32)}`;

/** Directory a key lives in, or `undefined` for a root-level key. */
function dirOf(key: string): string | undefined {
  const dir = pathPosix.dirname(key);
  return dir === '.' ? undefined : dir;
}

function metaFromEntry(entry: FileEntry, key: string): StorageItemMeta {
  return {
    path: key,
    size: entry.size ?? 0,
    contentType: 'application/octet-stream',
    // The native content id is stable across filesystems for identical bytes,
    // which is what the default merge/diff rely on.
    etag: entry.contentId,
    // Tensorlake listings don't carry a per-file mtime; epoch signals
    // "no meaningful timestamp" to the merge/diff polyfill so it falls
    // back to the content etag.
    lastModified: new Date(0),
  };
}

const snapshotMessage = (name: string | undefined): string =>
  `${SNAPSHOT_MESSAGE_PREFIX}${JSON.stringify({ name: name ?? null })}`;

function snapshotInfo(snapshot: FilesystemSnapshotInfo): SnapshotInfo {
  let name: string | undefined;
  if (!snapshot.message.startsWith(SNAPSHOT_MESSAGE_PREFIX)) {
    return {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
    };
  }
  try {
    const decoded = JSON.parse(
      snapshot.message.slice(SNAPSHOT_MESSAGE_PREFIX.length)
    ) as { name?: unknown };
    name = typeof decoded.name === 'string' ? decoded.name : undefined;
  } catch {
    // A malformed storagesdk-prefixed message still names a valid native
    // retention point. Surface it without a logical name instead of making
    // its immutable version unreachable through snapshots.head().
  }
  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    ...(name !== undefined ? { name } : {}),
  };
}

const isStoragesdkSnapshot = (snapshot: FilesystemSnapshotInfo): boolean =>
  snapshot.message.startsWith(SNAPSHOT_MESSAGE_PREFIX);

async function materializeStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined
): Promise<{ directory: string; path: string; size: number }> {
  const directory = await mkdtemp(
    join(tmpdir(), 'storagesdk-tensorlake-upload-')
  );
  const path = join(directory, 'payload');
  try {
    const reader = body.getReader();
    const onAbort = (): void => {
      void reader.cancel(signal?.reason).catch(() => {});
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const handle = await open(path, 'wx');
      let failure: unknown;
      let size = 0;
      try {
        while (true) {
          checkSignal(signal);
          const { done, value } = await reader.read();
          if (done) break;
          let offset = 0;
          while (offset < value.byteLength) {
            const { bytesWritten } = await handle.write(
              value,
              offset,
              value.byteLength - offset,
              size
            );
            if (bytesWritten === 0) {
              throw new StorageError({
                code: 'Provider',
                message: 'temporary upload file made no write progress',
              });
            }
            offset += bytesWritten;
            size += bytesWritten;
          }
        }
        checkSignal(signal);
      } catch (err) {
        failure = err;
        throw err;
      } finally {
        await handle.close().catch((err) => {
          if (failure === undefined) throw err;
        });
      }
      return { directory, path, size };
    } finally {
      signal?.removeEventListener('abort', onAbort);
      reader.releaseLock();
    }
  } catch (err) {
    // Cleanup is best-effort and must never mask the stream/read failure.
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function isUnbornFilesystemError(
  fs: Filesystem,
  err: unknown
): Promise<boolean> {
  if (asStorageError(err).code !== 'InvalidArgument') return false;
  try {
    return (await fs.status()).versionId === null;
  } catch {
    // Preserve the original operation failure when the status probe itself
    // fails; it carries the more relevant path and operation context.
    return false;
  }
}

/**
 * Tensorlake Cloud Volumes adapter. One Tensorlake filesystem maps to one
 * storagesdk location. Uploads go directly to blob storage; copy, move,
 * snapshots, and forks publish metadata only. Snapshot readers use native
 * version ids, while forks are deterministic, opaque sibling filesystems.
 * `contentType`/`metadata` aren't persisted, `url()` returns a non-fetchable
 * `tensorlake://` scheme URL, and `uploadUrl()` is unsupported.
 */
export function tensorlake(config: TensorlakeConfig): Adapter<TensorlakeRaw> {
  const client = new FilesystemClient({
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
    ...(config.apiUrl !== undefined ? { apiUrl: config.apiUrl } : {}),
    ...(config.organizationId !== undefined
      ? { organizationId: config.organizationId }
      : {}),
    ...(config.projectId !== undefined ? { projectId: config.projectId } : {}),
  });
  return defineAdapter<TensorlakeRaw>(impl(client, config.filesystem));
}

/**
 * Build a raw adapter over one filesystem. `version` pins reads to a commit
 * and disables writes — used by `snapshots.get()` to expose a read-only
 * time-travel view.
 */
function impl(
  client: FilesystemClient,
  fsName: string,
  version?: string
): Adapter<TensorlakeRaw> {
  const readonly = version !== undefined;
  let cached: Promise<Filesystem> | undefined;

  const resolveFs = (): Promise<Filesystem> => {
    if (cached === undefined) {
      cached = client.get(fsName).catch((err) => {
        cached = undefined;
        throw asStorageError(err);
      });
    }
    return cached;
  };

  const ensureWritable = (): void => {
    if (readonly) {
      throw new StorageError({
        code: 'InvalidArgument',
        message: 'Cannot write through a snapshot reader',
      });
    }
  };

  const headEntry = async (key: string): Promise<FileEntry> => {
    const fs = await resolveFs();
    let entries: FileEntry[];
    try {
      entries = await fs.listFiles(dirOf(key), version);
    } catch (err) {
      if (await isUnbornFilesystemError(fs, err)) {
        throw new StorageError({
          code: 'NotFound',
          message: `${key} not found`,
        });
      }
      throw asStorageError(err, key);
    }
    const base = pathPosix.basename(key);
    const entry = entries.find((e) => !e.isDir && e.name === base);
    if (entry === undefined) {
      throw new StorageError({ code: 'NotFound', message: `${key} not found` });
    }
    return entry;
  };

  const adapter: Adapter<TensorlakeRaw> = {
    name: 'tensorlake',
    raw: client,

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      ensureWritable();
      const fs = await resolveFs();
      let loaded: number;
      try {
        if (body instanceof ReadableStream) {
          const source = await materializeStream(body, opts?.signal);
          try {
            checkSignal(opts?.signal);
            await fs.writeFileFromPath(key, source.path);
            loaded = source.size;
          } finally {
            // Publication may already be durable. A local cleanup failure must
            // not turn that success into an unknown outcome for the caller.
            await rm(source.directory, { recursive: true, force: true }).catch(
              () => {}
            );
          }
        } else {
          const bytes = await bodyToBytes(body as BodyInput);
          await fs.writeFile(key, bytes);
          loaded = bytes.byteLength;
        }
      } catch (err) {
        throw asStorageError(err, key);
      }
      opts?.onProgress?.({ loaded, total: loaded });
      return metaFromEntry(await headEntry(key), key);
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const fs = await resolveFs();
      let read: FilesystemFileRead;
      try {
        read = await fs.readFileWithMetadata(key, {
          ...(version !== undefined ? { version } : {}),
          ...(opts?.range !== undefined ? { range: opts.range } : {}),
        });
      } catch (err) {
        if (await isUnbornFilesystemError(fs, err)) {
          throw new StorageError({
            code: 'NotFound',
            message: `${key} not found`,
          });
        }
        throw asStorageError(err, key);
      }
      const bytes = new Uint8Array(read.data);
      return {
        path: key,
        size: bytes.byteLength,
        contentType: 'application/octet-stream',
        etag: read.contentId,
        lastModified: new Date(0),
        body: bytes,
      };
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      return metaFromEntry(await headEntry(key), key);
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const prefix = opts?.prefix ?? '';
      const limit = opts?.limit ?? 100;
      const cursor = opts?.cursor ?? '';
      const fs = await resolveFs();

      const items: StorageItemMeta[] = [];
      const prefixSlash = prefix.lastIndexOf('/');
      let directories: Array<string | undefined> = [
        prefixSlash >= 0 ? prefix.slice(0, prefixSlash) : undefined,
      ];
      while (directories.length > 0) {
        const next: string[] = [];
        for (let start = 0; start < directories.length; start += 16) {
          checkSignal(opts?.signal);
          const batch = directories.slice(start, start + 16);
          const pages = await Promise.all(
            batch.map(async (dir) => {
              try {
                return await fs.listFiles(dir, version);
              } catch (err) {
                if (await isUnbornFilesystemError(fs, err)) return [];
                const mapped = asStorageError(err);
                if (mapped.code === 'NotFound') return [];
                throw mapped;
              }
            })
          );
          for (const entries of pages) {
            for (const entry of entries) {
              if (entry.isDir) {
                next.push(entry.path);
              } else if (!isInternalKey(entry.path)) {
                items.push(metaFromEntry(entry, entry.path));
              }
            }
          }
        }
        directories = next;
      }

      const matching = items
        .filter((m) => m.path.startsWith(prefix) && m.path > cursor)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      const page = matching.slice(0, limit);
      const last = page[page.length - 1];
      return matching.length > limit && last !== undefined
        ? { items: page, cursor: last.path }
        : { items: page };
    },

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      ensureWritable();
      const fs = await resolveFs();
      try {
        await fs.deleteFile(key);
      } catch (err) {
        const mapped = asStorageError(err, key);
        if (mapped.code === 'NotFound') return;
        throw mapped;
      }
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      ensureWritable();
      const fs = await resolveFs();
      try {
        await fs.copyFile(from, to);
      } catch (err) {
        throw asStorageError(err, from);
      }
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      ensureWritable();
      const fs = await resolveFs();
      try {
        await fs.moveFile(from, to);
      } catch (err) {
        throw asStorageError(err, from);
      }
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      const encodedPath = key
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      const query =
        version !== undefined ? `?v=${encodeURIComponent(version)}` : '';
      return `tensorlake://${encodeURIComponent(fsName)}/${encodedPath}${query}`;
    },

    uploadUrl(_key, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      checkSignal(opts?.signal);
      throw new StorageError({
        code: 'NotSupported',
        message: 'Tensorlake does not support presigned upload URLs',
      });
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        ensureWritable();
        const fs = await resolveFs();
        let snap: FilesystemSnapshot;
        try {
          snap = await fs.snapshot(snapshotMessage(opts?.name));
        } catch (err) {
          const mapped = asStorageError(err);
          if (mapped.code !== 'Conflict' || opts?.name !== undefined) {
            throw mapped;
          }
          // Native version ids are content-addressed. The generic live-fork
          // path asks for an unnamed base, which may already be retained under
          // a user-supplied name. Reuse that exact current head instead of
          // mutating or deleting its retention lifetime.
          try {
            const [status, snapshots] = await Promise.all([
              fs.status(),
              fs.listSnapshots(),
            ]);
            const retained =
              status.versionId === null
                ? undefined
                : snapshots.find(
                    (snapshot) => snapshot.id === status.versionId
                  );
            if (retained !== undefined) return snapshotInfo(retained);
          } catch (lookupErr) {
            throw asStorageError(lookupErr);
          }
          throw mapped;
        }
        return {
          id: snap.id,
          createdAt: new Date(),
          ...(opts?.name !== undefined ? { name: opts.name } : {}),
        };
      },

      async list(): Promise<SnapshotInfo[]> {
        const fs = await resolveFs();
        try {
          return (await fs.listSnapshots())
            .filter(isStoragesdkSnapshot)
            .map(snapshotInfo);
        } catch (err) {
          throw asStorageError(err);
        }
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const fs = await resolveFs();
        let found: FilesystemSnapshotInfo | undefined;
        try {
          found = (await fs.listSnapshots()).find(
            (snapshot) => snapshot.id === id && isStoragesdkSnapshot(snapshot)
          );
        } catch (err) {
          throw asStorageError(err);
        }
        if (found === undefined) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return snapshotInfo(found);
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        ensureWritable();
        const fs = await resolveFs();
        let found: FilesystemSnapshotInfo | undefined;
        try {
          found = (await fs.listSnapshots()).find(
            (snapshot) => snapshot.id === id && isStoragesdkSnapshot(snapshot)
          );
        } catch (err) {
          throw asStorageError(err);
        }
        if (found === undefined) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        try {
          await fs.deleteSnapshot(id);
        } catch (err) {
          throw asStorageError(err, id);
        }
      },

      get(id): ReadOnlyAdapter {
        const reader = impl(client, fsName, id);
        return {
          download: (p, o) => reader.download(p, o),
          head: (p, o) => reader.head(p, o),
          list: (o) => reader.list(o),
          url: (p, o) => reader.url(p, o),
        };
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        ensureWritable();
        const forkFs = forkFilesystemName(fsName, opts.name);

        const { manifest, forks } = await readForkRegistry();
        if (forks.some((f) => f.name === opts.name)) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }

        try {
          await client.fork(forkFs, fsName, opts.fromSnapshot);
        } catch (err) {
          throw asStorageError(err);
        }
        try {
          const info: ForkInfo = {
            name: opts.name,
            createdAt: new Date(),
            ...(opts.fromSnapshot !== undefined
              ? { fromSnapshot: opts.fromSnapshot }
              : {}),
          };
          // A native fork shares the parent's hidden manifest too. Replace
          // any inherited sibling entries with the registry proven to belong
          // to this filesystem before adding its new child.
          manifest.forks = forks;
          manifest.forks.push(info);
          await writeManifest(adapter, manifest);
          return info;
        } catch (err) {
          await client.delete(forkFs).catch(() => {});
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        return (await readForkRegistry()).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const found = (await readForkRegistry()).forks.find(
          (f) => f.name === name
        );
        if (found === undefined) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return found;
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        ensureWritable();
        const { manifest, forks } = await readForkRegistry();
        manifest.forks = forks.filter((f) => f.name !== name);
        try {
          await client.delete(forkFilesystemName(fsName, name));
        } catch (err) {
          const mapped = asStorageError(err);
          if (mapped.code !== 'NotFound') throw mapped;
        }
        await writeManifest(adapter, manifest);
      },

      get(name): Adapter<TensorlakeRaw> {
        // Outer `defineAdapter` re-wraps this raw impl exactly once.
        return impl(client, forkFilesystemName(fsName, name));
      },

      merge: (name, opts) => defaultMerge(adapter, name, opts),
      rebase: (name, opts) => defaultRebase(adapter, name, opts),
      diff: (name, opts) => defaultDiff(adapter, name, opts),
    },
  };

  /**
   * Native forks share the source tree, including its hidden storagesdk
   * manifest. Accept a registry row only when its exact physical child exists
   * under this filesystem's namespace; that prevents a child from treating
   * the parent's sibling rows as its own children. Resolve exact names instead
   * of using the project listing: that endpoint is paginated and may be served
   * from a stale cross-pod cache.
   */
  async function readForkRegistry(): Promise<{
    manifest: Awaited<ReturnType<typeof readManifest>>;
    forks: ForkInfo[];
  }> {
    const manifest = await readTensorlakeManifest();
    const forks: ForkInfo[] = [];
    for (let start = 0; start < manifest.forks.length; start += 16) {
      const batch = manifest.forks.slice(start, start + 16);
      const present = await Promise.all(
        batch.map(async (fork) => {
          try {
            await client.get(forkFilesystemName(fsName, fork.name));
            return true;
          } catch (err) {
            const mapped = asStorageError(err);
            if (mapped.code === 'NotFound') return false;
            throw mapped;
          }
        })
      );
      for (let i = 0; i < batch.length; i++) {
        const fork = batch[i];
        if (present[i] === true && fork !== undefined) forks.push(fork);
      }
    }
    return { manifest, forks };
  }

  async function readTensorlakeManifest(): Promise<
    Awaited<ReturnType<typeof readManifest>>
  > {
    try {
      return await readManifest(adapter);
    } catch (err) {
      if (err instanceof StorageError && err.code === 'InvalidArgument') {
        const fs = await resolveFs();
        let status: Awaited<ReturnType<Filesystem['status']>>;
        try {
          status = await fs.status();
        } catch (statusErr) {
          throw asStorageError(statusErr);
        }
        if (status.versionId === null) return emptyManifest();
      }
      throw err;
    }
  }

  return adapter;
}
