import {
  ApiError,
  type CommitSignature,
  GitStorage,
  RefUpdateError,
  type Repo,
} from '@pierre/storage';
import {
  type Adapter,
  bodyToBytes,
  checkSignal,
  defineAdapter,
  type ForkInfo,
  type ListOptions,
  type ListResult,
  type ReadOnlyAdapter,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
} from '@storagesdk/core/adapter';

export type CodeStorageCommitOp = 'upload' | 'delete' | 'copy' | 'move';

export interface CodeStorageConfig {
  /** Organization identifier used by Code Storage. */
  name: string;
  /** Repository id to operate on. */
  repo: string;
  /** Working branch. Defaults to the repository default branch. */
  branch?: string;
  /** ES256 private key in PKCS#8 PEM format. Required unless `token` is set. */
  key?: string;
  /** Pre-minted JWT. When set, per-call scopes and TTLs are governed by it. */
  token?: string;
  /** Override Code Storage API base URL. */
  apiBaseUrl?: string;
  /** Override Code Storage Git storage base URL. */
  storageBaseUrl?: string;
  /** Default per-call token TTL, seconds. */
  defaultTTL?: number;
  /** Commit author used for writes. */
  author?: CommitSignature;
  /** Committer used for writes. Defaults to `author`. */
  committer?: CommitSignature;
  /** Compose commit messages for SDK writes. */
  commitMessage?: (op: CodeStorageCommitOp, paths: string[]) => string;
}

export type CodeStorageRaw = GitStorage;

const DEFAULT_AUTHOR: CommitSignature = {
  name: 'storagesdk',
  email: 'storagesdk@example.invalid',
};

const DEFAULT_COMMIT_MESSAGE = (
  op: CodeStorageCommitOp,
  paths: string[]
): string => {
  if (op === 'move' || op === 'copy')
    return `storagesdk: ${op} ${paths[0]} -> ${paths[1]}`;
  return `storagesdk: ${op} ${paths[0]}`;
};

const SNAPSHOT_TAG_NAMESPACE = 'storagesdk';

const snapshotTagName = (branch: string, id: string): string =>
  `${SNAPSHOT_TAG_NAMESPACE}/${branch}/${id}`;

const snapshotTagListPrefix = (branch: string): string =>
  `${SNAPSHOT_TAG_NAMESPACE}/${branch}/`;

/** Adapter for Code Storage repositories. Snapshots are tags; forks are branches. */
export function codeStorage(
  config: CodeStorageConfig
): Adapter<CodeStorageRaw> {
  const raw = new GitStorage({
    name: config.name,
    ...(config.key !== undefined ? { key: config.key } : {}),
    ...(config.token !== undefined ? { token: config.token } : {}),
    ...(config.apiBaseUrl !== undefined
      ? { apiBaseUrl: config.apiBaseUrl }
      : {}),
    ...(config.storageBaseUrl !== undefined
      ? { storageBaseUrl: config.storageBaseUrl }
      : {}),
    ...(config.defaultTTL !== undefined
      ? { defaultTTL: config.defaultTTL }
      : {}),
  });

  return defineAdapter<CodeStorageRaw>(impl(config, raw, config.branch));
}

function impl(
  config: CodeStorageConfig,
  raw: GitStorage,
  initialBranch: string | undefined
): Adapter<CodeStorageRaw> {
  let repoPromise: Promise<Repo> | undefined;
  let cachedBranch = initialBranch;
  let cachedDefaultBranch: string | undefined;
  const commitMessage = config.commitMessage ?? DEFAULT_COMMIT_MESSAGE;
  const author = config.author ?? DEFAULT_AUTHOR;
  const committer = config.committer;

  const resolveRepo = async (): Promise<Repo> => {
    if (repoPromise === undefined) {
      repoPromise = (async () => {
        const repo = await raw.findOne({ id: config.repo });
        if (!repo) {
          throw new StorageError({
            code: 'NotFound',
            message: `Code Storage repository ${config.repo} not found`,
          });
        }
        cachedDefaultBranch = repo.defaultBranch;
        if (cachedBranch === undefined) cachedBranch = repo.defaultBranch;
        return repo;
      })().catch((err) => {
        repoPromise = undefined;
        throw asStorageError(err);
      });
    }
    return repoPromise;
  };

  const resolveBranch = async (): Promise<string> => {
    if (cachedBranch !== undefined) return cachedBranch;
    await resolveRepo();
    if (cachedBranch === undefined) {
      throw new StorageError({
        code: 'Provider',
        message: 'Unable to resolve branch',
      });
    }
    return cachedBranch;
  };

  const resolveDefaultBranch = async (): Promise<string> => {
    if (cachedDefaultBranch !== undefined) return cachedDefaultBranch;
    const repo = await resolveRepo();
    cachedDefaultBranch = repo.defaultBranch;
    return cachedDefaultBranch;
  };

  const commit = async (
    mutate: (repo: Repo, branch: string) => Promise<void>,
    signal: AbortSignal | undefined
  ): Promise<void> => {
    checkSignal(signal);
    const repo = await resolveRepo();
    const branch = await resolveBranch();
    await mutate(repo, branch).catch((err) => {
      throw asStorageError(err);
    });
  };

  return {
    name: 'code-storage',
    raw,

    async upload(path, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const bytes = await bodyToBytes(body);
      opts?.onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength });
      await commit(async (repo, branch) => {
        const builder = repo.createCommit({
          targetBranch: branch,
          commitMessage: commitMessage('upload', [path]),
          author,
          ...(committer !== undefined ? { committer } : {}),
          ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
        });
        await builder.addFile(path, bytes).send();
      }, opts?.signal);
      return this.head(path, opts);
    },

    async download(path, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const repo = await resolveRepo();
      const ref = await resolveBranch();
      try {
        const resp = await repo.getFileStream({
          path,
          ref,
          ...(opts?.range !== undefined
            ? {
                headers: {
                  range: `bytes=${opts.range.offset}-${opts.range.offset + opts.range.length - 1}`,
                },
              }
            : {}),
        });
        if (resp.status === 404) throw notFound(path);
        if (!resp.ok && resp.status !== 206) throw responseError(resp, path);
        const body = new Uint8Array(await resp.arrayBuffer());
        return {
          path,
          size: Number(resp.headers.get('content-length')) || body.byteLength,
          contentType:
            resp.headers.get('content-type') ?? 'application/octet-stream',
          etag: stripQuotes(resp.headers.get('etag') ?? ''),
          lastModified: parseDate(resp.headers.get('last-modified')),
          body,
        };
      } catch (err) {
        throw asStorageError(err, path);
      }
    },

    async head(path, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const repo = await resolveRepo();
      const ref = await resolveBranch();
      try {
        const meta = await repo.headFile({ path, ref });
        if (meta.status === 404) throw notFound(path);
        return metaFromFile(path, meta);
      } catch (err) {
        throw asStorageError(err, path);
      }
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const repo = await resolveRepo();
      const ref = await resolveBranch();
      try {
        const res = await repo.listFilesWithMetadata({
          ref,
          ...(opts?.prefix !== undefined && opts.prefix !== ''
            ? { path: opts.prefix }
            : {}),
          ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
          ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
        });
        return {
          items: res.files
            .filter((file) => file.type === undefined || file.type === 'blob')
            .map((file) => {
              const commit = res.commits[file.lastCommitSha];
              return {
                path: file.path,
                size: file.size,
                contentType: 'application/octet-stream',
                etag: file.lastCommitSha,
                lastModified: commit?.date ?? new Date(0),
              };
            }),
          ...(res.nextCursor !== undefined ? { cursor: res.nextCursor } : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    url(_path, opts): Promise<string> {
      checkSignal(opts?.signal);
      throw new StorageError({
        code: 'NotSupported',
        message: 'Code Storage does not expose object-style signed file URLs',
      });
    },

    async delete(path, opts): Promise<void> {
      await commit(async (repo, branch) => {
        await repo
          .createCommit({
            targetBranch: branch,
            commitMessage: commitMessage('delete', [path]),
            author,
            ...(committer !== undefined ? { committer } : {}),
            ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
          })
          .deletePath(path)
          .send();
      }, opts?.signal);
    },

    async copy(from, to, opts): Promise<void> {
      const item = await this.download(from, opts);
      await commit(async (repo, branch) => {
        await repo
          .createCommit({
            targetBranch: branch,
            commitMessage: commitMessage('copy', [from, to]),
            author,
            ...(committer !== undefined ? { committer } : {}),
            ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
          })
          .addFile(to, item.body)
          .send();
      }, opts?.signal);
    },

    async move(from, to, opts): Promise<void> {
      const item = await this.download(from, opts);
      await commit(async (repo, branch) => {
        await repo
          .createCommit({
            targetBranch: branch,
            commitMessage: commitMessage('move', [from, to]),
            author,
            ...(committer !== undefined ? { committer } : {}),
            ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
          })
          .addFile(to, item.body)
          .deletePath(from)
          .send();
      }, opts?.signal);
    },

    uploadUrl(_path, opts): Promise<never> {
      checkSignal(opts?.signal);
      throw new StorageError({
        code: 'NotSupported',
        message:
          'Code Storage does not expose object-style presigned upload URLs',
      });
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const repo = await resolveRepo();
        const branch = await resolveBranch();
        try {
          const { commit } = await repo.getCommit({ sha: branch });
          const id = `${branch}-${Date.now().toString(36)}`;
          await repo.createTag({
            name: snapshotTagName(branch, id),
            target: commit.sha,
          });
          return {
            id,
            createdAt: commit.date,
            ...(opts?.name ? { name: opts.name } : {}),
          };
        } catch (err) {
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        const repo = await resolveRepo();
        const branch = await resolveBranch();
        const prefix = snapshotTagListPrefix(branch);
        const snapshots: SnapshotInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = await repo.listTags({
            ...(cursor !== undefined ? { cursor } : {}),
          });
          for (const tag of page.tags) {
            if (tag.name.startsWith(prefix)) {
              snapshots.push({
                id: tag.name.slice(prefix.length),
                createdAt: new Date(0),
              });
            }
          }
          cursor = page.nextCursor;
        } while (cursor !== undefined);
        return snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const snapshots = await this.list();
        const found = snapshots.find((snapshot) => snapshot.id === id);
        if (!found) throw notFound(id);
        return found;
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        const repo = await resolveRepo();
        const branch = await resolveBranch();
        try {
          await repo.deleteTag({ name: snapshotTagName(branch, id) });
        } catch (err) {
          throw asStorageError(err, id);
        }
      },

      get(id): ReadOnlyAdapter {
        return snapshotReader(id, resolveBranch, config, raw);
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        const repo = await resolveRepo();
        const branch = await resolveBranch();
        const baseRef = opts.fromSnapshot
          ? snapshotTagName(branch, opts.fromSnapshot)
          : branch;
        try {
          await repo.createBranch({
            baseRef,
            targetBranch: opts.name,
          });
          return {
            name: opts.name,
            ...(opts.fromSnapshot !== undefined
              ? { fromSnapshot: opts.fromSnapshot }
              : {}),
            createdAt: new Date(),
          } satisfies ForkInfo;
        } catch (err) {
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        const repo = await resolveRepo();
        const defaultBranch = await resolveDefaultBranch();
        const forks: ForkInfo[] = [];
        let cursor: string | undefined;
        do {
          const page = await repo.listBranches({
            ...(cursor !== undefined ? { cursor } : {}),
          });
          for (const branch of page.branches) {
            if (branch.name !== defaultBranch) {
              forks.push({
                name: branch.name,
                createdAt: new Date(branch.createdAt),
              });
            }
          }
          cursor = page.nextCursor;
        } while (cursor !== undefined);
        return forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const forks = await this.list();
        const found = forks.find((fork) => fork.name === name);
        if (!found) throw notFound(name);
        return found;
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        const repo = await resolveRepo();
        const defaultBranch = await resolveDefaultBranch();
        if (name === defaultBranch) {
          throw new StorageError({
            code: 'InvalidArgument',
            message: `Refusing to delete default branch ${name}`,
          });
        }
        try {
          await repo.deleteBranch({ name });
        } catch (err) {
          throw asStorageError(err, name);
        }
      },

      get(name): Adapter<CodeStorageRaw> {
        return impl(config, raw, name);
      },
    },
  };
}

function snapshotReader(
  id: string,
  resolveBranch: () => Promise<string>,
  config: CodeStorageConfig,
  raw: GitStorage
): ReadOnlyAdapter {
  const adapterForSnapshot = async (): Promise<Adapter<CodeStorageRaw>> => {
    const branch = await resolveBranch();
    return impl(config, raw, snapshotTagName(branch, id));
  };

  return {
    download: async (path, opts) =>
      (await adapterForSnapshot()).download(path, opts),
    head: async (path, opts) => (await adapterForSnapshot()).head(path, opts),
    list: async (opts) => (await adapterForSnapshot()).list(opts),
    url: async (path, opts) => (await adapterForSnapshot()).url(path, opts),
  };
}

function metaFromFile(
  path: string,
  meta: {
    size?: number;
    contentType?: string;
    etag?: string;
    lastModified?: Date;
    blobSha?: string;
  }
): StorageItemMeta {
  return {
    path,
    size: meta.size ?? 0,
    contentType: meta.contentType ?? 'application/octet-stream',
    etag: stripQuotes(meta.etag ?? meta.blobSha ?? ''),
    lastModified: meta.lastModified ?? new Date(0),
  };
}

function responseError(resp: Response, path: string): StorageError {
  return new StorageError({
    code: resp.status === 404 ? 'NotFound' : 'Provider',
    message: `Code Storage ${resp.status} while reading ${path}`,
  });
}

function asStorageError(err: unknown, path?: string): StorageError {
  if (err instanceof StorageError) return err;
  if (err instanceof ApiError) {
    return new StorageError({
      code: codeForStatus(err.status),
      message:
        err.message || (path ? `${path} failed` : 'Code Storage API error'),
      cause: err,
    });
  }
  if (err instanceof RefUpdateError) {
    return new StorageError({
      code:
        err.reason === 'conflict' || err.reason === 'precondition_failed'
          ? 'Conflict'
          : 'Provider',
      message: err.message,
      cause: err,
    });
  }
  return new StorageError({
    code: 'Provider',
    message: err instanceof Error ? err.message : 'Code Storage error',
    cause: err,
  });
}

function codeForStatus(status: number): StorageError['code'] {
  if (status === 401 || status === 403) return 'Unauthorized';
  if (status === 404) return 'NotFound';
  if (status === 409) return 'Conflict';
  if (status === 400 || status === 422) return 'InvalidArgument';
  return 'Provider';
}

function notFound(path: string): StorageError {
  return new StorageError({ code: 'NotFound', message: `${path} not found` });
}

function stripQuotes(value: string): string {
  return value.replace(/^W\//u, '').replace(/^"|"$/gu, '');
}

function parseDate(value: string | null): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}
