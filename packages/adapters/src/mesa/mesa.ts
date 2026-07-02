import { Buffer } from 'node:buffer';
import { Mesa, MesaApiError, MesaError } from '@mesadev/sdk';
import {
  type Adapter,
  bodyToBytes,
  checkSignal,
  defineAdapter,
  type ForkInfo,
  isAbortError,
  type ListOptions,
  type ListResult,
  type ReadOnlyAdapter,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
} from '@storagesdk/core/adapter';

export type MesaCommitOp = 'upload' | 'delete' | 'copy' | 'move';

export interface MesaConfig {
  /** Mesa repository name. */
  repo: string;
  /** Mesa API key. Falls back to `MESA_API_KEY` in the Mesa SDK. */
  apiKey?: string;
  /** Organization slug. When omitted, the Mesa SDK resolves it from the API key. */
  org?: string;
  /** Working bookmark. Defaults to the repository default bookmark. */
  bookmark?: string;
  /** REST API base URL. */
  apiUrl?: string;
  /** VCS service URL used by MesaFS and token signing. */
  vcsUrl?: string;
  /** Custom User-Agent suffix. */
  userAgent?: string;
  /** Commit author used for writes. */
  author?: { name: string; email: string };
  /** Committer used for writes. Defaults to `author`. */
  committer?: { name: string; email: string };
  /** Compose change messages for SDK writes. */
  commitMessage?: (op: MesaCommitOp, paths: string[]) => string;
}

export type MesaRaw = Mesa;

const SNAPSHOT_BOOKMARK_NAMESPACE = 'storagesdk/snapshots';

const DEFAULT_AUTHOR = {
  name: 'storagesdk',
  email: 'storagesdk@example.invalid',
};

const DEFAULT_COMMIT_MESSAGE = (op: MesaCommitOp, paths: string[]): string => {
  if (op === 'move' || op === 'copy') {
    return `storagesdk: ${op} ${paths[0]} -> ${paths[1]}`;
  }
  return `storagesdk: ${op} ${paths[0]}`;
};

const snapshotBookmarkName = (bookmark: string, id: string): string =>
  `${SNAPSHOT_BOOKMARK_NAMESPACE}/${bookmark}/${id}`;

const snapshotBookmarkPrefix = (bookmark: string): string =>
  `${SNAPSHOT_BOOKMARK_NAMESPACE}/${bookmark}/`;

/** Adapter for Mesa repositories. Snapshots and forks are Mesa bookmarks. */
export function mesa(config: MesaConfig): Adapter<MesaRaw> {
  const raw = new Mesa({
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
    ...(config.org !== undefined ? { org: config.org } : {}),
    ...(config.apiUrl !== undefined ? { apiUrl: config.apiUrl } : {}),
    ...(config.vcsUrl !== undefined ? { vcsUrl: config.vcsUrl } : {}),
    ...(config.userAgent !== undefined ? { userAgent: config.userAgent } : {}),
  });

  return defineAdapter<MesaRaw>(impl(config, raw, config.bookmark));
}

function impl(
  config: MesaConfig,
  raw: Mesa,
  initialBookmark: string | undefined,
  fixedChangeId?: string,
  validateBookmark?: (bookmark: string) => Promise<void>
): Adapter<MesaRaw> {
  let cachedRepo: MesaRepo | undefined;
  let cachedBookmark = initialBookmark;
  const commitMessage = config.commitMessage ?? DEFAULT_COMMIT_MESSAGE;
  const author = config.author ?? DEFAULT_AUTHOR;
  const committer = config.committer;

  const repoInput = {
    repo: config.repo,
    ...(config.org ? { org: config.org } : {}),
  };

  const resolveRepo = async (): Promise<MesaRepo> => {
    if (cachedRepo !== undefined) return cachedRepo;
    try {
      cachedRepo = await raw.repos.get(repoInput);
      if (cachedBookmark === undefined)
        cachedBookmark = cachedRepo.default_bookmark;
      return cachedRepo;
    } catch (err) {
      throw asStorageError(err);
    }
  };

  const resolveBookmark = async (): Promise<string> => {
    if (cachedBookmark === undefined) {
      const repo = await resolveRepo();
      cachedBookmark = repo.default_bookmark;
    }
    await validateBookmark?.(cachedBookmark);
    return cachedBookmark;
  };

  const resolveChangeId = async (): Promise<string> => {
    if (fixedChangeId !== undefined) return fixedChangeId;
    const bookmark = await resolveBookmark();
    try {
      const ref = await raw.bookmarks.get({ ...repoInput, bookmark });
      return ref.change_id;
    } catch (err) {
      throw asStorageError(err);
    }
  };

  const commit = async (
    op: MesaCommitOp,
    paths: string[],
    files: MesaFileOperation[],
    signal: AbortSignal | undefined
  ): Promise<void> => {
    checkSignal(signal);
    if (fixedChangeId !== undefined) {
      throw new StorageError({
        code: 'InvalidArgument',
        message: 'Cannot write through a snapshot reader',
      });
    }

    const bookmark = await resolveBookmark();
    const baseChangeId = await resolveChangeId();
    try {
      const change = await raw.changes.create({
        ...repoInput,
        base_change_id: baseChangeId,
        message: commitMessage(op, paths),
        author,
        ...(committer !== undefined ? { committer } : {}),
        files,
      });
      await raw.bookmarks.move({
        ...repoInput,
        bookmark,
        change_id: change.id,
      });
    } catch (err) {
      throw asStorageError(err);
    }
  };

  const readContent = async (path: string): Promise<MesaContent> => {
    try {
      return await raw.content.get({
        ...repoInput,
        path,
        change_id: await resolveChangeId(),
      });
    } catch (err) {
      throw asStorageError(err, path);
    }
  };

  return {
    name: 'mesa',
    raw,

    async upload(path, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const bytes = await bodyToBytes(body);
      opts?.onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength });
      await commit(
        'upload',
        [path],
        [{ path, content: Buffer.from(bytes).toString('base64') }],
        opts?.signal
      );
      return this.head(path, opts);
    },

    async download(path, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const content = await readContent(path);
      if (content.type !== 'file' && content.type !== 'symlink')
        throw notFound(path);
      let body = Buffer.from(content.content, 'base64');
      if (opts?.range !== undefined) {
        body = body.subarray(
          opts.range.offset,
          opts.range.offset + opts.range.length
        );
      }
      return {
        ...metaFromContent(content),
        size: body.byteLength,
        body: new Uint8Array(body),
      };
    },

    async head(path, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const content = await readContent(path);
      if (content.type !== 'file' && content.type !== 'symlink')
        throw notFound(path);
      return metaFromContent(content);
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const prefix = opts?.prefix ?? '';
      const offset = opts?.cursor ? Number(opts.cursor) : 0;
      const limit = opts?.limit ?? 1000;
      try {
        const content = await raw.content.get({
          ...repoInput,
          path: prefix,
          depth: 10,
          change_id: await resolveChangeId(),
        });
        const metas = entriesFromContent(content)
          .filter((entry) => entry.type === 'file' || entry.type === 'symlink')
          .map(metaFromEntry);
        const items = metas.slice(offset, offset + limit);
        const next =
          offset + limit < metas.length ? String(offset + limit) : undefined;
        return { items, ...(next !== undefined ? { cursor: next } : {}) };
      } catch (err) {
        throw asStorageError(err, prefix);
      }
    },

    async url(path, opts): Promise<string> {
      checkSignal(opts?.signal);
      const params = new URLSearchParams({ path });
      if (config.org !== undefined) params.set('org', config.org);
      if (fixedChangeId !== undefined) {
        params.set('change_id', fixedChangeId);
      } else {
        params.set('bookmark', await resolveBookmark());
      }
      return `mesa://${encodeURIComponent(config.repo)}?${params}`;
    },

    async delete(path, opts): Promise<void> {
      await commit(
        'delete',
        [path],
        [{ path, action: 'delete' }],
        opts?.signal
      );
    },

    async copy(from, to, opts): Promise<void> {
      const item = await this.download(from, opts);
      await commit(
        'copy',
        [from, to],
        [{ path: to, content: Buffer.from(item.body).toString('base64') }],
        opts?.signal
      );
    },

    async move(from, to, opts): Promise<void> {
      const item = await this.download(from, opts);
      await commit(
        'move',
        [from, to],
        [
          { path: to, content: Buffer.from(item.body).toString('base64') },
          { path: from, action: 'delete' },
        ],
        opts?.signal
      );
    },

    uploadUrl(_path, opts): Promise<never> {
      checkSignal(opts?.signal);
      throw new StorageError({
        code: 'NotSupported',
        message: 'Mesa does not expose object-style presigned upload URLs',
      });
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const bookmark = await resolveBookmark();
        const changeId = await resolveChangeId();
        const id = opts?.name ?? `${bookmark}-${Date.now().toString(36)}`;
        try {
          await raw.bookmarks.create({
            ...repoInput,
            name: snapshotBookmarkName(bookmark, id),
            change_id: changeId,
          });
          return {
            id,
            createdAt: new Date(),
            ...(opts?.name !== undefined ? { name: opts.name } : {}),
          } satisfies SnapshotInfo;
        } catch (err) {
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        const bookmark = await resolveBookmark();
        const prefix = snapshotBookmarkPrefix(bookmark);
        const snapshots: SnapshotInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = await raw.bookmarks.list({
            ...repoInput,
            ...(cursor !== undefined ? { cursor } : {}),
            limit: 100,
          });
          for (const item of page.bookmarks) {
            if (item.name.startsWith(prefix)) {
              snapshots.push({
                id: item.name.slice(prefix.length),
                createdAt: new Date(0),
              });
            }
          }
          cursor = page.next_cursor ?? undefined;
        } while (cursor !== undefined);
        return snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const bookmark = await resolveBookmark();
        try {
          await raw.bookmarks.get({
            ...repoInput,
            bookmark: snapshotBookmarkName(bookmark, id),
          });
          return { id, createdAt: new Date(0) };
        } catch (err) {
          throw asStorageError(err, id);
        }
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        const bookmark = await resolveBookmark();
        try {
          await raw.bookmarks.delete({
            ...repoInput,
            bookmark: snapshotBookmarkName(bookmark, id),
          });
        } catch (err) {
          throw asStorageError(err, id);
        }
      },

      get(id): ReadOnlyAdapter {
        return snapshotReader(id, resolveBookmark, repoInput, config, raw);
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        if (opts.name.startsWith(`${SNAPSHOT_BOOKMARK_NAMESPACE}/`)) {
          throw new StorageError({
            code: 'InvalidArgument',
            message: `Refusing to create fork in snapshot namespace ${opts.name}`,
          });
        }
        try {
          const bookmark = await resolveBookmark();
          const changeId = opts.fromSnapshot
            ? await snapshotChangeId(
                raw,
                repoInput,
                bookmark,
                opts.fromSnapshot
              )
            : await resolveChangeId();
          await raw.bookmarks.create({
            ...repoInput,
            name: opts.name,
            change_id: changeId,
          });
          return {
            name: opts.name,
            ...(opts.fromSnapshot !== undefined
              ? { fromSnapshot: opts.fromSnapshot }
              : {}),
            createdAt: new Date(),
          };
        } catch (err) {
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        const repo = await resolveRepo();
        const activeBookmark = await resolveBookmark();
        const snapshots = await snapshotChangeMap(
          raw,
          repoInput,
          activeBookmark
        );
        const forks: ForkInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = await raw.bookmarks.list({
            ...repoInput,
            ...(cursor !== undefined ? { cursor } : {}),
            limit: 100,
          });
          for (const item of page.bookmarks) {
            if (
              isForkBookmark(item.name, repo.default_bookmark, activeBookmark)
            ) {
              const fromSnapshot = snapshots.get(item.change_id);
              forks.push({
                name: item.name,
                ...(fromSnapshot !== undefined ? { fromSnapshot } : {}),
                createdAt: new Date(0),
              });
            }
          }
          cursor = page.next_cursor ?? undefined;
        } while (cursor !== undefined);
        return forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        try {
          const repo = await resolveRepo();
          const activeBookmark = await resolveBookmark();
          if (!isForkBookmark(name, repo.default_bookmark, activeBookmark)) {
            throw notFound(name);
          }
          const fork = await raw.bookmarks.get({
            ...repoInput,
            bookmark: name,
          });
          const snapshots = await snapshotChangeMap(
            raw,
            repoInput,
            activeBookmark
          );
          const fromSnapshot = snapshots.get(fork.change_id);
          return {
            name,
            ...(fromSnapshot !== undefined ? { fromSnapshot } : {}),
            createdAt: new Date(0),
          };
        } catch (err) {
          throw asStorageError(err, name);
        }
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        const repo = await resolveRepo();
        const activeBookmark = await resolveBookmark();
        if (!isForkBookmark(name, repo.default_bookmark, activeBookmark)) {
          throw new StorageError({
            code: 'InvalidArgument',
            message: `Refusing to delete non-fork bookmark ${name}`,
          });
        }
        try {
          await raw.bookmarks.delete({ ...repoInput, bookmark: name });
        } catch (err) {
          throw asStorageError(err, name);
        }
      },

      get(name): Adapter<MesaRaw> {
        return impl(config, raw, name, undefined, async (bookmark) => {
          const repo = await resolveRepo();
          const activeBookmark = await resolveBookmark();
          if (
            !isForkBookmark(bookmark, repo.default_bookmark, activeBookmark)
          ) {
            throw notFound(bookmark);
          }
          await raw.bookmarks.get({ ...repoInput, bookmark }).catch((err) => {
            throw asStorageError(err, bookmark);
          });
        });
      },
    },
  };
}

function snapshotReader(
  id: string,
  resolveBookmark: () => Promise<string>,
  repoInput: MesaRepoInput,
  config: MesaConfig,
  raw: Mesa
): ReadOnlyAdapter {
  const adapterForSnapshot = async (): Promise<Adapter<MesaRaw>> => {
    const bookmark = await resolveBookmark();
    const changeId = await snapshotChangeId(raw, repoInput, bookmark, id);
    return impl(config, raw, undefined, changeId);
  };

  return {
    download: async (path, opts) =>
      (await adapterForSnapshot()).download(path, opts),
    head: async (path, opts) => (await adapterForSnapshot()).head(path, opts),
    list: async (opts) => (await adapterForSnapshot()).list(opts),
    url: async (path, opts) => (await adapterForSnapshot()).url(path, opts),
  };
}

async function snapshotChangeId(
  raw: Mesa,
  repoInput: MesaRepoInput,
  bookmark: string,
  snapshotId: string
): Promise<string> {
  const ref = await raw.bookmarks.get({
    ...repoInput,
    bookmark: snapshotBookmarkName(bookmark, snapshotId),
  });
  return ref.change_id;
}

async function snapshotChangeMap(
  raw: Mesa,
  repoInput: MesaRepoInput,
  bookmark: string
): Promise<Map<string, string>> {
  const prefix = snapshotBookmarkPrefix(bookmark);
  const snapshots = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page = await raw.bookmarks.list({
      ...repoInput,
      ...(cursor !== undefined ? { cursor } : {}),
      limit: 100,
    });
    for (const item of page.bookmarks) {
      if (item.name.startsWith(prefix)) {
        snapshots.set(item.change_id, item.name.slice(prefix.length));
      }
    }
    cursor = page.next_cursor ?? undefined;
  } while (cursor !== undefined);
  return snapshots;
}

function isForkBookmark(
  name: string,
  defaultBookmark: string,
  activeBookmark: string
): boolean {
  return (
    name !== defaultBookmark &&
    name !== activeBookmark &&
    !name.startsWith(`${SNAPSHOT_BOOKMARK_NAMESPACE}/`)
  );
}

function metaFromContent(content: MesaFileContent): StorageItemMeta {
  return {
    path: content.path,
    size: content.size,
    contentType: 'application/octet-stream',
    etag: content.sha,
    lastModified: new Date(0),
  };
}

function metaFromEntry(entry: MesaContentEntry): StorageItemMeta {
  return {
    path: entry.path,
    size: entry.size ?? 0,
    contentType: 'application/octet-stream',
    etag: entry.sha,
    lastModified: new Date(0),
  };
}

function entriesFromContent(content: MesaContent): MesaContentEntry[] {
  if (content.type === 'dir') return flattenEntries(content.entries ?? []);
  return [content];
}

function flattenEntries(entries: MesaContentEntry[]): MesaContentEntry[] {
  return entries.flatMap((entry) => {
    if ('entries' in entry && Array.isArray(entry.entries)) {
      return [entry, ...flattenEntries(entry.entries as MesaContentEntry[])];
    }
    return [entry];
  });
}

function asStorageError(err: unknown, path?: string): StorageError {
  if (err instanceof StorageError) return err;
  if (isAbortError(err)) {
    return new StorageError({
      code: 'Aborted',
      message: 'Operation aborted',
      cause: err,
    });
  }
  if (err instanceof MesaApiError) {
    return new StorageError({
      code: codeForStatus(err.status),
      message: err.message || (path ? `${path} failed` : 'Mesa API error'),
      cause: err,
    });
  }
  if (err instanceof MesaError) {
    return new StorageError({
      code: err.code === 'MISSING_CREDENTIAL' ? 'Unauthorized' : 'Provider',
      message: err.message,
      cause: err,
    });
  }
  return new StorageError({
    code: 'Provider',
    message: err instanceof Error ? err.message : 'Mesa error',
    cause: err,
  });
}

function codeForStatus(status: number | undefined): StorageError['code'] {
  if (status === 401 || status === 403) return 'Unauthorized';
  if (status === 404) return 'NotFound';
  if (status === 409) return 'Conflict';
  if (status === 400 || status === 422) return 'InvalidArgument';
  return 'Provider';
}

function notFound(path: string): StorageError {
  return new StorageError({ code: 'NotFound', message: `${path} not found` });
}

type MesaRepoInput = { repo: string; org?: string };

interface MesaRepo {
  default_bookmark: string;
  head_change_id: string;
}

type MesaFileOperation =
  | {
      path: string;
      content: string;
      action?: 'upsert';
      mode?: '100644' | '100755';
    }
  | { path: string; action: 'delete' };

type MesaContent = MesaFileContent | MesaDirectoryContent;

interface MesaFileContent {
  type: 'file' | 'symlink';
  path: string;
  sha: string;
  size: number;
  content: string;
}

interface MesaDirectoryContent {
  type: 'dir';
  path: string;
  sha: string;
  entries?: MesaContentEntry[];
}

type MesaContentEntry =
  | {
      type: 'file' | 'symlink';
      path: string;
      sha: string;
      size?: number;
      name?: string;
      mode?: string;
    }
  | {
      type: 'dir';
      path: string;
      sha: string;
      entries?: MesaContentEntry[];
      name?: string;
      size?: number;
      mode?: string;
    };
