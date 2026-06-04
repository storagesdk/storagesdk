import { StorageError } from './errors.js';
import { normalizePath, normalizePrefix } from './paths.js';
import type {
  BodyInput,
  CreateSnapshotOptions,
  DownloadOptions,
  ForkInfo,
  ForkOptions,
  ListOptions,
  ListResult,
  MergeOptions,
  MergeResult,
  SnapshotInfo,
  StorageItem,
  StorageItemMeta,
  UploadOptions,
  UploadUrlOptions,
  UploadUrlResult,
  UrlOptions,
} from './types.js';

/**
 * The four read methods shared between full adapters, snapshot readers,
 * and fork readers (where a fork happens to be addressed read-only).
 */
export interface ReadOnlyAdapter {
  download(path: string, opts?: DownloadOptions): Promise<StorageItem>;
  head(path: string, opts?: { signal?: AbortSignal }): Promise<StorageItemMeta>;
  list(opts?: ListOptions): Promise<ListResult>;
  url(path: string, opts?: UrlOptions): Promise<string>;
}

/**
 * The snapshot-management namespace on an `Adapter`. Adapter builders can
 * implement this in isolation and pass it as `snapshots` in `defineAdapter`.
 */
export interface AdapterSnapshots {
  create(opts?: CreateSnapshotOptions): Promise<SnapshotInfo>;
  list(): Promise<SnapshotInfo[]>;
  head(id: string, opts?: { signal?: AbortSignal }): Promise<SnapshotInfo>;
  delete(id: string, opts?: { signal?: AbortSignal }): Promise<void>;
  get(id: string): ReadOnlyAdapter;
}

/**
 * The fork-management namespace on an `Adapter`. Same five operations as
 * `AdapterSnapshots`, but `get(name)` returns a full `Adapter` because a
 * fork is writable storage in its own right. Carries the parent's `Raw`
 * type so `forks.get(name).raw` stays narrowly typed.
 */
export interface AdapterForks<Raw = unknown> {
  create(opts: ForkOptions): Promise<ForkInfo>;
  list(): Promise<ForkInfo[]>;
  head(name: string, opts?: { signal?: AbortSignal }): Promise<ForkInfo>;
  delete(name: string, opts?: { signal?: AbortSignal }): Promise<void>;
  get(name: string): Adapter<Raw>;
  merge?(name: string, opts?: MergeOptions): Promise<MergeResult>;
}

/**
 * The full adapter contract — read methods plus writes, snapshot management,
 * and fork management. This is what adapter authors implement and what
 * `defineAdapter` accepts and wraps.
 *
 * `Raw` is the type of the escape-hatch `raw` field. Adapter authors set it
 * to whatever native client or state they expose (e.g. `Adapter<S3Client>`);
 * `Raw` defaults to `unknown` for adapters that don't bother to narrow it.
 * `Storage<Raw>` and `forks.get(name)` carry the same type through.
 */
export interface Adapter<Raw = unknown> extends ReadOnlyAdapter {
  readonly name: string;
  readonly raw: Raw;

  upload(
    path: string,
    body: BodyInput,
    opts?: UploadOptions
  ): Promise<StorageItemMeta>;
  delete(path: string, opts?: { signal?: AbortSignal }): Promise<void>;
  copy(
    from: string,
    to: string,
    opts?: { signal?: AbortSignal }
  ): Promise<void>;
  move(
    from: string,
    to: string,
    opts?: { signal?: AbortSignal }
  ): Promise<void>;
  uploadUrl(path: string, opts?: UploadUrlOptions): Promise<UploadUrlResult>;

  snapshots: AdapterSnapshots;
  forks: AdapterForks<Raw>;
}

function normalizeListOptions(opts?: ListOptions): ListOptions | undefined {
  if (opts?.prefix === undefined) return opts;
  return { ...opts, prefix: normalizePrefix(opts.prefix) };
}

/**
 * Validates `download({ range })`. `offset >= 0` and `length > 0` are the
 * only inputs we accept; everything else (offset past EOF, length running
 * past EOF) is the adapter's concern — the contract says "return what
 * exists, no error" for the latter, and adapters surface backend errors
 * for the former.
 */
function validateRange(opts?: DownloadOptions): void {
  const r = opts?.range;
  if (r === undefined) return;
  if (!Number.isInteger(r.offset) || r.offset < 0) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `range.offset must be a non-negative integer (got ${r.offset})`,
    });
  }
  if (!Number.isInteger(r.length) || r.length <= 0) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: `range.length must be a positive integer (got ${r.length})`,
    });
  }
}

function normalizeReadOnly(adapter: ReadOnlyAdapter): ReadOnlyAdapter {
  return {
    download: async (path, opts) => {
      validateRange(opts);
      return adapter.download(normalizePath(path), opts);
    },
    head: async (path, opts) => adapter.head(normalizePath(path), opts),
    list: async (opts) => adapter.list(normalizeListOptions(opts)),
    url: async (path, opts) => adapter.url(normalizePath(path), opts),
  };
}

/**
 * Wraps an adapter implementation with path normalization on every path-taking
 * method. Readers returned by `snapshots.get` are normalized; adapters returned
 * by `forks.get` are recursively wrapped so any nested operations keep the
 * contract. The `Raw` type parameter is inferred from the impl's `raw` field
 * — adapter authors don't usually need to specify it explicitly.
 */
export function defineAdapter<Raw = unknown>(impl: Adapter<Raw>): Adapter<Raw> {
  const forks: AdapterForks<Raw> = {
    create: (opts) => impl.forks.create(opts),
    list: () => impl.forks.list(),
    head: (name, opts) => impl.forks.head(name, opts),
    delete: (name, opts) => impl.forks.delete(name, opts),
    get: (name) => defineAdapter<Raw>(impl.forks.get(name)),
  };
  const merge = impl.forks.merge;
  if (merge) {
    forks.merge = (name, opts) => merge(name, opts);
  }

  return {
    name: impl.name,
    raw: impl.raw,

    download: async (path, opts) => {
      validateRange(opts);
      return impl.download(normalizePath(path), opts);
    },
    head: async (path, opts) => impl.head(normalizePath(path), opts),
    list: async (opts) => impl.list(normalizeListOptions(opts)),
    url: async (path, opts) => impl.url(normalizePath(path), opts),
    upload: async (path, body, opts) =>
      impl.upload(normalizePath(path), body, opts),
    delete: async (path, opts) => impl.delete(normalizePath(path), opts),
    copy: async (from, to, opts) =>
      impl.copy(normalizePath(from), normalizePath(to), opts),
    move: async (from, to, opts) =>
      impl.move(normalizePath(from), normalizePath(to), opts),
    uploadUrl: async (path, opts) => impl.uploadUrl(normalizePath(path), opts),

    snapshots: {
      create: (opts) => impl.snapshots.create(opts),
      list: () => impl.snapshots.list(),
      head: (id, opts) => impl.snapshots.head(id, opts),
      delete: (id, opts) => impl.snapshots.delete(id, opts),
      get: (id) => normalizeReadOnly(impl.snapshots.get(id)),
    },

    forks,
  };
}
