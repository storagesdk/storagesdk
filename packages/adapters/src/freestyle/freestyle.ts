import { Buffer } from 'node:buffer';
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
import { Freestyle } from 'freestyle';

export type FreestyleCommitOp = 'upload' | 'delete' | 'copy' | 'move';

export interface FreestyleConfig {
  /** Freestyle Git repository id. */
  repoId: string;
  /** Freestyle API key. Falls back to the Freestyle SDK default env handling. */
  apiKey?: string;
  /** Scoped Freestyle access token. Mutually exclusive with `apiKey`. */
  accessToken?: string;
  /** Working branch. Defaults to the repository default branch. */
  branch?: string;
  /** Override Freestyle API base URL. */
  baseUrl?: string;
  /** Commit author used for writes. */
  author?: { name: string; email: string };
  /** Compose commit messages for SDK writes. */
  commitMessage?: (op: FreestyleCommitOp, paths: string[]) => string;
}

export type FreestyleRaw = Freestyle;

const SNAPSHOT_BRANCH_NAMESPACE = 'storagesdk/snapshots';

const DEFAULT_AUTHOR = {
  name: 'storagesdk',
  email: 'storagesdk@example.invalid',
};

const DEFAULT_COMMIT_MESSAGE = (
  op: FreestyleCommitOp,
  paths: string[]
): string => {
  if (op === 'move' || op === 'copy') {
    return `storagesdk: ${op} ${paths[0]} -> ${paths[1]}`;
  }
  return `storagesdk: ${op} ${paths[0]}`;
};

const snapshotBranchName = (branch: string, id: string): string =>
  `${SNAPSHOT_BRANCH_NAMESPACE}/${branch}/${id}`;

const snapshotBranchPrefix = (branch: string): string =>
  `${SNAPSHOT_BRANCH_NAMESPACE}/${branch}/`;

export function freestyleStorage(
  config: FreestyleConfig
): Adapter<FreestyleRaw> {
  const raw = new Freestyle(
    config.accessToken !== undefined
      ? {
          accessToken: config.accessToken,
          ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
        }
      : {
          ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
          ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
        }
  );

  return defineAdapter<FreestyleRaw>(impl(config, raw, config.branch));
}

function impl(
  config: FreestyleConfig,
  raw: Freestyle,
  initialBranch: string | undefined,
  validateBranch?: (branch: string) => Promise<void>
): Adapter<FreestyleRaw> {
  const repo = raw.git.repos.ref({ repoId: config.repoId });
  let cachedBranch = initialBranch;
  let cachedDefaultBranch: string | undefined;
  const commitMessage = config.commitMessage ?? DEFAULT_COMMIT_MESSAGE;
  const author = config.author ?? DEFAULT_AUTHOR;

  const resolveDefaultBranch = async (): Promise<string> => {
    if (cachedDefaultBranch !== undefined) return cachedDefaultBranch;
    try {
      const result = await repo.branches.getDefaultBranch();
      cachedDefaultBranch = result.defaultBranch;
      if (cachedBranch === undefined) cachedBranch = cachedDefaultBranch;
      return cachedDefaultBranch;
    } catch (err) {
      throw asStorageError(err);
    }
  };

  const resolveBranch = async (): Promise<string> => {
    if (cachedBranch === undefined) await resolveDefaultBranch();
    if (cachedBranch === undefined) {
      throw new StorageError({
        code: 'Provider',
        message: 'Unable to resolve Freestyle branch',
      });
    }
    await validateBranch?.(cachedBranch);
    return cachedBranch;
  };

  const readContent = async (path: string): Promise<FreestyleContent> => {
    try {
      return asContent(
        await repo.contents.get({ path, rev: await resolveBranch() })
      );
    } catch (err) {
      throw asStorageError(err, path);
    }
  };

  const downloadObject = async (
    path: string,
    opts?: Parameters<Adapter['download']>[1]
  ): Promise<StorageItem> => {
    checkSignal(opts?.signal);
    const content = await readContent(path);
    if (content.type !== 'file') throw notFound(path);
    let body = Buffer.from(content.content, 'base64');
    if (opts?.range !== undefined) {
      body = body.subarray(
        opts.range.offset,
        opts.range.offset + opts.range.length
      );
    }
    return {
      ...metaFromFile(content),
      size: body.byteLength,
      body: new Uint8Array(body),
    };
  };

  const headObject = async (
    path: string,
    opts?: Parameters<Adapter['head']>[1]
  ): Promise<StorageItemMeta> => {
    checkSignal(opts?.signal);
    const content = await readContent(path);
    if (content.type !== 'file') throw notFound(path);
    return metaFromFile(content);
  };

  const commit = async (
    op: FreestyleCommitOp,
    paths: string[],
    files: FreestyleCommitFile[],
    signal: AbortSignal | undefined
  ): Promise<void> => {
    checkSignal(signal);
    const branch = await resolveBranch();
    try {
      await repo.commits.create({
        branch,
        message: commitMessage(op, paths),
        files,
        author,
      });
    } catch (err) {
      throw asStorageError(err);
    }
  };

  const listSnapshots = async (): Promise<SnapshotInfo[]> => {
    const branch = await resolveBranch();
    const prefix = snapshotBranchPrefix(branch);
    const page = asBranchList(await repo.branches.list());
    return page.branches
      .filter((item) => item.name.startsWith(prefix))
      .map((item) => ({
        id: item.name.slice(prefix.length),
        createdAt: new Date(0),
      }));
  };

  return {
    name: 'freestyle',
    raw,

    async upload(path, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const bytes = await bodyToBytes(body);
      opts?.onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength });
      await commit(
        'upload',
        [path],
        [
          {
            path,
            content: Buffer.from(bytes).toString('base64'),
            encoding: 'base64',
          },
        ],
        opts?.signal
      );
      return headObject(path, opts);
    },

    download(path, opts): Promise<StorageItem> {
      return downloadObject(path, opts);
    },

    head(path, opts): Promise<StorageItemMeta> {
      return headObject(path, opts);
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const prefix = opts?.prefix ?? '';
      try {
        const content = asContent(
          await repo.contents.get({ path: prefix, rev: await resolveBranch() })
        );
        const metas = entriesFromContent(content)
          .filter((entry) => entry.type === 'file')
          .map(metaFromFileEntry);
        const offset = opts?.cursor ? Number(opts.cursor) : 0;
        const limit = opts?.limit ?? 1000;
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
      const ref = await resolveBranch();
      const params = new URLSearchParams({ ref, path });
      return `freestyle-git://${encodeURIComponent(config.repoId)}?${params}`;
    },

    async delete(path, opts): Promise<void> {
      await commit('delete', [path], [{ path, deleted: true }], opts?.signal);
    },

    async copy(from, to, opts): Promise<void> {
      const item = await downloadObject(from, opts);
      await commit(
        'copy',
        [from, to],
        [
          {
            path: to,
            content: Buffer.from(item.body).toString('base64'),
            encoding: 'base64',
          },
        ],
        opts?.signal
      );
    },

    async move(from, to, opts): Promise<void> {
      const item = await downloadObject(from, opts);
      await commit(
        'move',
        [from, to],
        [
          {
            path: to,
            content: Buffer.from(item.body).toString('base64'),
            encoding: 'base64',
          },
          { path: from, deleted: true },
        ],
        opts?.signal
      );
    },

    uploadUrl(_path, opts): Promise<never> {
      checkSignal(opts?.signal);
      throw new StorageError({
        code: 'NotSupported',
        message:
          'Freestyle Git does not expose object-style presigned upload URLs',
      });
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const branch = await resolveBranch();
        const id = opts?.name ?? `${branch}-${Date.now().toString(36)}`;
        const head = asBranch(await repo.branches.get({ branchName: branch }));
        try {
          await repo.branches.create({
            name: snapshotBranchName(branch, id),
            sha: head.sha,
          });
          return {
            id,
            ...(opts?.name !== undefined ? { name: opts.name } : {}),
            createdAt: new Date(),
          };
        } catch (err) {
          throw asStorageError(err);
        }
      },

      list(): Promise<SnapshotInfo[]> {
        return listSnapshots();
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const found = (await listSnapshots()).find(
          (snapshot) => snapshot.id === id
        );
        if (found === undefined) throw notFound(id);
        return found;
      },

      delete(_id, opts): Promise<void> {
        checkSignal(opts?.signal);
        throw unsupportedRefDelete();
      },

      get(id): ReadOnlyAdapter {
        return snapshotReader(id, resolveBranch, config, raw);
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        const branch = await resolveBranch();
        const sha = opts.fromSnapshot
          ? asBranch(
              await repo.branches.get({
                branchName: snapshotBranchName(branch, opts.fromSnapshot),
              })
            ).sha
          : asBranch(await repo.branches.get({ branchName: branch })).sha;
        try {
          await repo.branches.create({ name: opts.name, sha });
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
        const defaultBranch = await resolveDefaultBranch();
        const activeBranch = await resolveBranch();
        const page = asBranchList(await repo.branches.list());
        return page.branches
          .filter(
            (item) =>
              item.name !== defaultBranch &&
              item.name !== activeBranch &&
              !item.name.startsWith(`${SNAPSHOT_BRANCH_NAMESPACE}/`)
          )
          .map((item) => ({ name: item.name, createdAt: new Date(0) }));
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const defaultBranch = await resolveDefaultBranch();
        const activeBranch = await resolveBranch();
        if (name === defaultBranch || name === activeBranch)
          throw notFound(name);
        await repo.branches.get({ branchName: name }).catch((err) => {
          throw asStorageError(err, name);
        });
        return { name, createdAt: new Date(0) };
      },

      delete(_name, opts): Promise<void> {
        checkSignal(opts?.signal);
        throw unsupportedRefDelete();
      },

      get(name): Adapter<FreestyleRaw> {
        if (name === cachedBranch || name === cachedDefaultBranch) {
          throw notFound(name);
        }
        return impl(config, raw, name, async (branch) => {
          const defaultBranch = await resolveDefaultBranch();
          const activeBranch = await resolveBranch();
          if (branch === defaultBranch || branch === activeBranch) {
            throw notFound(branch);
          }
        });
      },
    },
  };
}

function snapshotReader(
  id: string,
  resolveBranch: () => Promise<string>,
  config: FreestyleConfig,
  raw: Freestyle
): ReadOnlyAdapter {
  const adapterForSnapshot = async (): Promise<Adapter<FreestyleRaw>> => {
    const branch = await resolveBranch();
    return impl(config, raw, snapshotBranchName(branch, id));
  };
  return {
    download: async (path, opts) =>
      (await adapterForSnapshot()).download(path, opts),
    head: async (path, opts) => (await adapterForSnapshot()).head(path, opts),
    list: async (opts) => (await adapterForSnapshot()).list(opts),
    url: async (path, opts) => (await adapterForSnapshot()).url(path, opts),
  };
}

function entriesFromContent(content: FreestyleContent): FreestyleFileEntry[] {
  if (content.type === 'file') return [content];
  return flattenEntries(content.entries ?? []);
}

function flattenEntries(entries: FreestyleEntry[]): FreestyleFileEntry[] {
  return entries.flatMap((entry) => {
    if (entry.type === 'file') return [entry];
    return flattenEntries(entry.entries ?? []);
  });
}

function metaFromFile(content: FreestyleFile): StorageItemMeta {
  return {
    path: content.path,
    size: content.size,
    contentType: 'application/octet-stream',
    etag: content.sha,
    lastModified: new Date(0),
  };
}

function metaFromFileEntry(entry: FreestyleFileEntry): StorageItemMeta {
  return {
    path: entry.path,
    size: entry.size,
    contentType: 'application/octet-stream',
    etag: entry.sha,
    lastModified: new Date(0),
  };
}

function asContent(value: unknown): FreestyleContent {
  if (isRecord(value) && (value.type === 'file' || value.type === 'dir')) {
    return value as unknown as FreestyleContent;
  }
  throw new StorageError({
    code: 'Provider',
    message: 'Unexpected Freestyle contents response',
  });
}

function asBranch(value: unknown): FreestyleBranch {
  if (isRecord(value) && typeof value.sha === 'string') {
    return value as unknown as FreestyleBranch;
  }
  throw new StorageError({
    code: 'Provider',
    message: 'Unexpected Freestyle branch response',
  });
}

function asBranchList(value: unknown): FreestyleBranchList {
  if (isRecord(value) && Array.isArray(value.branches)) {
    return value as unknown as FreestyleBranchList;
  }
  throw new StorageError({
    code: 'Provider',
    message: 'Unexpected Freestyle branch list response',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unsupportedRefDelete(): StorageError {
  return new StorageError({
    code: 'NotSupported',
    message: 'Freestyle Git does not expose branch or tag deletion yet',
  });
}

function asStorageError(err: unknown, path?: string): StorageError {
  if (err instanceof StorageError) return err;
  if (isAbortError(err))
    return new StorageError({ code: 'Aborted', cause: err });
  const message = err instanceof Error ? err.message : String(err);
  return new StorageError({
    code: codeForMessage(message),
    message: path ? `${path}: ${message}` : message,
    cause: err,
  });
}

function codeForMessage(message: string): StorageError['code'] {
  if (/not[ _-]?found|404/i.test(message)) return 'NotFound';
  if (/unauthori[sz]ed|forbidden|401|403/i.test(message)) return 'Unauthorized';
  if (/already exists|conflict|409/i.test(message)) return 'Conflict';
  if (/invalid|bad request|400|422/i.test(message)) return 'InvalidArgument';
  return 'Provider';
}

function notFound(path: string): StorageError {
  return new StorageError({ code: 'NotFound', message: `${path} not found` });
}

type FreestyleCommitFile =
  | { path: string; content: string; encoding: 'base64' }
  | { path: string; deleted: true };

interface FreestyleFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
  type: 'file';
}

interface FreestyleFileEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file';
}

interface FreestyleDir {
  name: string;
  path: string;
  sha: string;
  entries?: FreestyleEntry[];
  type: 'dir';
}

type FreestyleEntry = FreestyleFileEntry | FreestyleDir;
type FreestyleContent = FreestyleFile | FreestyleDir;

interface FreestyleBranch {
  name: string;
  sha: string;
}

interface FreestyleBranchList {
  branches: { name: string; commit?: string | null }[];
}
