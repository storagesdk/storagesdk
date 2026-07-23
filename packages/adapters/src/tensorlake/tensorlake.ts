import { posix as pathPosix } from 'node:path';
import {
  type Adapter,
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
import type { FileEntry, Filesystem, Snapshot } from 'tensorlake';
import { FilesystemClient } from 'tensorlake';
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

const FORK_INFIX = '-fork-';

const forkFilesystemName = (parent: string, name: string): string =>
  `${parent}${FORK_INFIX}${name}`;

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
    // The git blob oid is a content hash — stable across filesystems for
    // identical bytes, which is what the default merge/diff rely on.
    etag: entry.oid,
    // Tensorlake listings don't carry a per-file mtime; epoch signals
    // "no meaningful timestamp" to the merge/diff polyfill so it falls
    // back to the content etag.
    lastModified: new Date(0),
  };
}

/**
 * Tensorlake Cloud Volumes adapter. One Tensorlake filesystem maps to one
 * storagesdk location. Snapshots are native commits (time-travel reads via
 * `version`); forks are sibling filesystems (`<fs>-fork-<name>`) seeded by
 * copying files from the source snapshot. `contentType`/`metadata` aren't
 * persisted, `url()` returns a non-fetchable `tensorlake://` scheme URL, and
 * `uploadUrl()` is unsupported.
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
      throw asStorageError(err, key);
    }
    const base = pathPosix.basename(key);
    const entry = entries.find((e) => !e.isDir && e.name === base);
    if (entry === undefined) {
      throw new StorageError({ code: 'NotFound', message: `${key} not found` });
    }
    return entry;
  };

  /**
   * Read every file under the filesystem at `ver` into memory. Errors
   * propagate so an invalid `fromSnapshot` fails loudly; when reading the
   * live head (`ver === undefined`) a missing tree is treated as empty.
   */
  const collectTree = async (
    fs: Filesystem,
    ver: string | undefined
  ): Promise<Map<string, Uint8Array>> => {
    const out = new Map<string, Uint8Array>();
    const walk = async (dir: string | undefined): Promise<void> => {
      let entries: FileEntry[];
      try {
        entries = await fs.listFiles(dir, ver);
      } catch (err) {
        const mapped = asStorageError(err);
        if (ver === undefined && mapped.code === 'NotFound') return;
        throw mapped;
      }
      for (const entry of entries) {
        if (entry.isDir) {
          await walk(entry.path);
        } else if (!isInternalKey(entry.path)) {
          out.set(entry.path, await fs.readFile(entry.path, ver));
        }
      }
    };
    await walk(undefined);
    return out;
  };

  const adapter: Adapter<TensorlakeRaw> = {
    name: 'tensorlake',
    raw: client,

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      ensureWritable();
      const bytes = await bodyToBytes(body);
      const fs = await resolveFs();
      try {
        await fs.writeFile(key, bytes);
      } catch (err) {
        throw asStorageError(err, key);
      }
      opts?.onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength });
      return metaFromEntry(await headEntry(key), key);
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const fs = await resolveFs();
      const [bytes, entry] = await Promise.all([
        fs.readFile(key, version).catch((err) => {
          throw asStorageError(err, key);
        }),
        headEntry(key),
      ]);
      const meta = metaFromEntry(entry, key);
      if (opts?.range) {
        const { offset, length } = opts.range;
        const view = bytes.subarray(offset, offset + length);
        const sliced = new Uint8Array(view.byteLength);
        sliced.set(view);
        return { ...meta, size: sliced.byteLength, body: sliced };
      }
      return { ...meta, size: bytes.byteLength, body: new Uint8Array(bytes) };
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
      const walk = async (dir: string | undefined): Promise<void> => {
        let entries: FileEntry[];
        try {
          entries = await fs.listFiles(dir, version);
        } catch (err) {
          const mapped = asStorageError(err);
          if (mapped.code === 'NotFound') return;
          throw mapped;
        }
        for (const entry of entries) {
          if (entry.isDir) {
            await walk(entry.path);
          } else if (!isInternalKey(entry.path)) {
            items.push(metaFromEntry(entry, entry.path));
          }
        }
      };
      await walk(undefined);

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
      let bytes: Uint8Array;
      try {
        bytes = await fs.readFile(from);
      } catch (err) {
        throw asStorageError(err, from);
      }
      try {
        await fs.writeFile(to, bytes);
      } catch (err) {
        throw asStorageError(err, to);
      }
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      ensureWritable();
      const fs = await resolveFs();
      let bytes: Uint8Array;
      try {
        bytes = await fs.readFile(from);
      } catch (err) {
        throw asStorageError(err, from);
      }
      try {
        await fs.writeFiles({ [to]: bytes }, undefined, [from]);
      } catch (err) {
        throw asStorageError(err, to);
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
        let snap: Snapshot;
        try {
          snap = await fs.snapshot(
            opts?.name !== undefined
              ? `storagesdk snapshot ${opts.name}`
              : 'storagesdk snapshot'
          );
        } catch (err) {
          throw asStorageError(err);
        }
        const info: SnapshotInfo = {
          id: snap.commit,
          createdAt: new Date(),
          ...(opts?.name !== undefined ? { name: opts.name } : {}),
        };
        // Recording the snapshot writes the manifest, which advances the
        // head commit — so the next `create()` pins a distinct commit even
        // with no user writes in between.
        const manifest = await readManifest(adapter);
        manifest.snapshots.push(info);
        await writeManifest(adapter, manifest);
        return info;
      },

      async list(): Promise<SnapshotInfo[]> {
        return (await readManifest(adapter)).snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const found = (await readManifest(adapter)).snapshots.find(
          (s) => s.id === id
        );
        if (found === undefined) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return found;
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        ensureWritable();
        // The SDK can't delete an individual permanent commit, so this only
        // drops the manifest reference; the underlying commit persists until
        // the whole filesystem is deleted.
        const manifest = await readManifest(adapter);
        manifest.snapshots = manifest.snapshots.filter((s) => s.id !== id);
        await writeManifest(adapter, manifest);
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

        const manifest = await readManifest(adapter);
        if (manifest.forks.some((f) => f.name === opts.name)) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }

        // Read the seed BEFORE creating the fork filesystem so an unknown
        // `fromSnapshot` fails without leaving an empty fork behind.
        const fs = await resolveFs();
        let seed: Map<string, Uint8Array>;
        try {
          seed = await collectTree(fs, opts.fromSnapshot);
        } catch (err) {
          throw asStorageError(err, opts.fromSnapshot);
        }

        let forkHandle: Filesystem;
        try {
          forkHandle = await client.create(forkFs);
        } catch (err) {
          throw asStorageError(err);
        }
        try {
          if (seed.size > 0) {
            await forkHandle.writeFiles(seed);
          }
          const forkImpl = impl(client, forkFs);
          await writeManifest(
            forkImpl,
            emptyManifest({
              location: fsName,
              snapshotId: opts.fromSnapshot ?? null,
            })
          );
          const info: ForkInfo = {
            name: opts.name,
            createdAt: new Date(),
            ...(opts.fromSnapshot !== undefined
              ? { fromSnapshot: opts.fromSnapshot }
              : {}),
          };
          manifest.forks.push(info);
          await writeManifest(adapter, manifest);
          return info;
        } catch (err) {
          await client.delete(forkFs).catch(() => {});
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        return (await readManifest(adapter)).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const found = (await readManifest(adapter)).forks.find(
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
        const manifest = await readManifest(adapter);
        manifest.forks = manifest.forks.filter((f) => f.name !== name);
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

  return adapter;
}
