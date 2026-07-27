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
  type ForkInfo,
  isInternalKey,
  type ListOptions,
  type ListResult,
  type ReadOnlyAdapter,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
} from '@storagesdk/core/adapter';
import {
  type FileEntry,
  type Filesystem,
  FilesystemAPIError,
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
const TENSORLAKE_INTERNAL_DIRECTORY = '.storagesdk';
const FORK_RECORD_DIRECTORY = `${TENSORLAKE_INTERNAL_DIRECTORY}/forks`;
const FORK_RECORD_VERSION = 1;
const TRANSIENT_FORK_CONFLICT = 'network reachability changed while forking';
const MAX_FORK_ATTEMPTS = 4;

interface ForkRecord {
  version: typeof FORK_RECORD_VERSION;
  name: string;
  createdAt: string;
  fromSnapshot?: string;
}

const forkFilesystemName = (parent: string, name: string): string =>
  `storagesdk-fork-${createHash('sha256')
    .update(JSON.stringify([parent, name]))
    .digest('hex')
    .slice(0, 32)}`;

const forkRecordPath = (name: string): string =>
  `${FORK_RECORD_DIRECTORY}/${createHash('sha256')
    .update(JSON.stringify(name))
    .digest('hex')}.json`;

const isTensorlakeInternalPath = (path: string): boolean =>
  isInternalKey(path) ||
  path === TENSORLAKE_INTERNAL_DIRECTORY ||
  path.startsWith(`${TENSORLAKE_INTERNAL_DIRECTORY}/`);

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

function serializeForkRecord(info: ForkInfo): string {
  const record: ForkRecord = {
    version: FORK_RECORD_VERSION,
    name: info.name,
    createdAt: info.createdAt.toISOString(),
    ...(info.fromSnapshot !== undefined
      ? { fromSnapshot: info.fromSnapshot }
      : {}),
  };
  return JSON.stringify(record);
}

function parseForkRecord(path: string, text: string): ForkInfo {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `invalid Tensorlake fork record at ${path}`,
      cause: cause instanceof Error ? cause : undefined,
    });
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== FORK_RECORD_VERSION
  ) {
    throw new StorageError({
      code: 'NotSupported',
      message: `unsupported Tensorlake fork record at ${path}`,
    });
  }

  const record = value as Partial<ForkRecord>;
  const createdAt =
    typeof record.createdAt === 'string'
      ? new Date(record.createdAt)
      : new Date(Number.NaN);
  if (
    typeof record.name !== 'string' ||
    record.name.length === 0 ||
    forkRecordPath(record.name) !== path ||
    Number.isNaN(createdAt.getTime()) ||
    (record.fromSnapshot !== undefined &&
      typeof record.fromSnapshot !== 'string')
  ) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `invalid Tensorlake fork record at ${path}`,
    });
  }
  return {
    name: record.name,
    createdAt,
    ...(record.fromSnapshot !== undefined
      ? { fromSnapshot: record.fromSnapshot }
      : {}),
  };
}

const isTransientForkConflict = (err: unknown): boolean =>
  err instanceof FilesystemAPIError &&
  err.statusCode === 409 &&
  err.message.includes(TRANSIENT_FORK_CONFLICT);

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

  const createPhysicalFork = async (
    forkFs: string,
    fromSnapshot: string | undefined,
    signal: AbortSignal | undefined
  ): Promise<void> => {
    for (let attempt = 1; attempt <= MAX_FORK_ATTEMPTS; attempt++) {
      checkSignal(signal);
      try {
        await client.fork(forkFs, fsName, fromSnapshot);
        return;
      } catch (err) {
        if (!isTransientForkConflict(err) || attempt === MAX_FORK_ATTEMPTS) {
          throw err;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 50 * 2 ** (attempt - 1))
        );
      }
    }
  };

  const headEntry = async (
    key: string,
    readVersion: string | undefined = version
  ): Promise<FileEntry> => {
    const fs = await resolveFs();
    let entries: FileEntry[];
    try {
      entries = await fs.listFiles(dirOf(key), readVersion);
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
      let publishedVersion: string;
      try {
        if (body instanceof ReadableStream) {
          const source = await materializeStream(body, opts?.signal);
          try {
            checkSignal(opts?.signal);
            const publication = await fs.writeFileFromPath(key, source.path);
            publishedVersion = publication.versionId;
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
          const publication = await fs.writeFile(key, bytes);
          publishedVersion = publication.versionId;
          loaded = bytes.byteLength;
        }
      } catch (err) {
        throw asStorageError(err, key);
      }
      opts?.onProgress?.({ loaded, total: loaded });
      return metaFromEntry(await headEntry(key, publishedVersion), key);
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
      const prefixSlash = prefix.lastIndexOf('/');
      const startDirectory =
        prefixSlash >= 0 ? prefix.slice(0, prefixSlash) : undefined;

      const readDirectory = async (
        directory: string | undefined
      ): Promise<FileEntry[]> => {
        checkSignal(opts?.signal);
        try {
          return await fs.listFiles(directory, version);
        } catch (err) {
          if (await isUnbornFilesystemError(fs, err)) return [];
          const mapped = asStorageError(err);
          if (mapped.code === 'NotFound') return [];
          throw mapped;
        }
      };

      /**
       * Native listings are directory-scoped. Walk them in global path order
       * and stop once this page has one lookahead item. Prune subtrees that
       * cannot contain the requested prefix and, on later pages, complete
       * subtrees that sort before the path cursor.
       */
      async function* walk(
        directory: string | undefined
      ): AsyncGenerator<StorageItemMeta> {
        const entries = await readDirectory(directory);
        entries.sort((left, right) => {
          const leftKey = left.isDir ? `${left.path}/` : left.path;
          const rightKey = right.isDir ? `${right.path}/` : right.path;
          return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
        for (const entry of entries) {
          checkSignal(opts?.signal);
          if (isTensorlakeInternalPath(entry.path)) continue;
          if (entry.isDir) {
            const subtreePrefix = `${entry.path}/`;
            if (
              prefix !== '' &&
              !prefix.startsWith(subtreePrefix) &&
              !subtreePrefix.startsWith(prefix)
            ) {
              continue;
            }
            if (
              cursor !== '' &&
              subtreePrefix <= cursor &&
              !cursor.startsWith(subtreePrefix)
            ) {
              continue;
            }
            yield* walk(entry.path);
          } else if (entry.path.startsWith(prefix) && entry.path > cursor) {
            yield metaFromEntry(entry, entry.path);
          }
        }
      }

      const page: StorageItemMeta[] = [];
      for await (const item of walk(startDirectory)) {
        page.push(item);
        if (page.length > limit) break;
      }
      const hasMore = page.length > limit;
      if (hasMore) page.pop();
      const last = page[page.length - 1];
      return hasMore && last !== undefined
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
            (snapshot) => snapshot.id === id
          );
        } catch (err) {
          throw asStorageError(err);
        }
        const isRecordedForkBase =
          found !== undefined &&
          !isStoragesdkSnapshot(found) &&
          (await isForkBaseSnapshot(id));
        if (
          found === undefined ||
          (!isStoragesdkSnapshot(found) && !isRecordedForkBase)
        ) {
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

      async cleanupAutoSnapshotAfterForkFailure(): Promise<void> {
        // Native snapshot ids are content-addressed. The unnamed base may have
        // been retained previously by another fork or by a user-created
        // snapshot, so failed physical fork creation cannot safely release it.
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        ensureWritable();
        const forkFs = forkFilesystemName(fsName, opts.name);

        try {
          await createPhysicalFork(forkFs, opts.fromSnapshot, opts.signal);
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
          await writeForkRecord(info);
          return info;
        } catch (err) {
          await client.delete(forkFs).catch(() => {});
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        return readForkRegistry();
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const found = await readForkRecord(name);
        if (found === undefined || !(await physicalForkExists(name))) {
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
        // Remove discoverability first. A concurrent recreation cannot succeed
        // until the old physical child is gone, and its later record write then
        // wins without being erased by this delete.
        await deleteForkRecord(name);
        try {
          await client.delete(forkFilesystemName(fsName, name));
        } catch (err) {
          const mapped = asStorageError(err);
          if (mapped.code !== 'NotFound') throw mapped;
        }
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
   * Each fork owns a separate hidden record path, allowing the server's
   * non-overlapping-path publication to compose concurrent creates and deletes.
   * Native forks inherit their parent's records, so accept a row only when its
   * exact physical child exists under this filesystem's namespace.
   */
  async function readForkRegistry(): Promise<ForkInfo[]> {
    const records = await listForkRecords();
    const forks: ForkInfo[] = [];
    for (let start = 0; start < records.length; start += 16) {
      const batch = records.slice(start, start + 16);
      const present = await Promise.all(
        batch.map((fork) => physicalForkExists(fork.name))
      );
      for (let i = 0; i < batch.length; i++) {
        const fork = batch[i];
        if (present[i] === true && fork !== undefined) forks.push(fork);
      }
    }
    return forks.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
  }

  async function physicalForkExists(name: string): Promise<boolean> {
    try {
      await client.get(forkFilesystemName(fsName, name));
      return true;
    } catch (err) {
      const mapped = asStorageError(err);
      if (mapped.code === 'NotFound') return false;
      throw mapped;
    }
  }

  async function readForkRecord(name: string): Promise<ForkInfo | undefined> {
    const path = forkRecordPath(name);
    const fs = await resolveFs();
    return readForkRecordAtPath(fs, path);
  }

  async function readForkRecordAtPath(
    fs: Filesystem,
    path: string
  ): Promise<ForkInfo | undefined> {
    let text: string;
    try {
      text = await fs.readText(path, version);
    } catch (err) {
      const mapped = asStorageError(err, path);
      if (mapped.code === 'NotFound') return undefined;
      if (await isUnbornFilesystemError(fs, err)) return undefined;
      throw mapped;
    }
    return parseForkRecord(path, text);
  }

  async function listForkRecords(): Promise<ForkInfo[]> {
    const fs = await resolveFs();
    let entries: FileEntry[];
    try {
      entries = await fs.listFiles(FORK_RECORD_DIRECTORY, version);
    } catch (err) {
      const mapped = asStorageError(err);
      if (mapped.code === 'NotFound') return [];
      if (await isUnbornFilesystemError(fs, err)) return [];
      throw mapped;
    }

    const paths = entries
      .filter((entry) => !entry.isDir && entry.path.endsWith('.json'))
      .map((entry) => entry.path)
      .sort();
    const records: ForkInfo[] = [];
    for (let start = 0; start < paths.length; start += 16) {
      const batch = paths.slice(start, start + 16);
      const decoded = await Promise.all(
        batch.map((path) => readForkRecordAtPath(fs, path))
      );
      records.push(
        ...decoded.filter((record): record is ForkInfo => record !== undefined)
      );
    }
    return records;
  }

  async function writeForkRecord(info: ForkInfo): Promise<void> {
    const fs = await resolveFs();
    try {
      await fs.writeFile(forkRecordPath(info.name), serializeForkRecord(info));
    } catch (err) {
      throw asStorageError(err);
    }
  }

  async function deleteForkRecord(name: string): Promise<void> {
    const fs = await resolveFs();
    const path = forkRecordPath(name);
    try {
      await fs.deleteFile(path);
    } catch (err) {
      const mapped = asStorageError(err, path);
      if (mapped.code !== 'NotFound') throw mapped;
    }
  }

  async function isForkBaseSnapshot(id: string): Promise<boolean> {
    return (await readForkRegistry()).some((fork) => fork.fromSnapshot === id);
  }

  return adapter;
}
