import type { Adapter, ReadOnlyAdapter } from './adapter.js';
import { toWebStream } from './streams.js';
import type {
  BodyInput,
  CreateSnapshotOptions,
  DiffOptions,
  DownloadOptions,
  ForkDiff,
  ForkInfo,
  ForkOptions,
  ListOptions,
  ListResult,
  MergeOptions,
  RebaseOptions,
  SnapshotInfo,
  StorageItem,
  StorageItemMeta,
  UploadOptions,
  UploadUrlOptions,
  UploadUrlResult,
  UrlOptions,
} from './types.js';

export interface StorageOptions<Raw = unknown> {
  adapter: Adapter<Raw>;
}

const MULTIPART_THRESHOLD_DEFAULT = 5 * 1024 * 1024;

export interface ReadOnlyStorageOptions {
  adapter: ReadOnlyAdapter;
}

/**
 * Consumer-facing read-only wrapper. Used as the return type of
 * `storage.snapshots.get(id)` — gives users the ergonomic `download` overloads
 * (`as: 'stream' | 'text' | 'bytes' | 'blob' | 'json'`) on top of the four
 * read methods. `Storage` extends this class so writes inherit the same
 * overloads.
 */
export class ReadOnlyStorage {
  readonly #adapter: ReadOnlyAdapter;

  constructor(opts: ReadOnlyStorageOptions) {
    this.#adapter = opts.adapter;
  }

  download(path: string, opts?: DownloadOptions): Promise<StorageItem>;
  download(
    path: string,
    opts: DownloadOptions & { as: 'stream' }
  ): Promise<ReadableStream<Uint8Array>>;
  download(
    path: string,
    opts: DownloadOptions & { as: 'text' }
  ): Promise<string>;
  download(
    path: string,
    opts: DownloadOptions & { as: 'bytes' }
  ): Promise<Uint8Array>;
  download(path: string, opts: DownloadOptions & { as: 'blob' }): Promise<Blob>;
  download(
    path: string,
    opts: DownloadOptions & { as: 'json' }
  ): Promise<unknown>;
  async download(
    path: string,
    opts?: DownloadOptions & {
      as?: 'stream' | 'text' | 'bytes' | 'blob' | 'json';
    }
  ): Promise<unknown> {
    const passthrough: DownloadOptions = {};
    if (opts?.signal) passthrough.signal = opts.signal;
    if (opts?.range) passthrough.range = opts.range;
    const item = await this.#adapter.download(path, passthrough);
    switch (opts?.as) {
      case 'stream':
        return toWebStream(item.body);
      case 'text':
        return new TextDecoder().decode(item.body);
      case 'bytes':
        return item.body;
      case 'blob':
        return new Blob([item.body], { type: item.contentType });
      case 'json':
        return JSON.parse(new TextDecoder().decode(item.body));
      default:
        return item;
    }
  }

  head(
    path: string,
    opts?: { signal?: AbortSignal }
  ): Promise<StorageItemMeta> {
    return this.#adapter.head(path, opts);
  }

  list(opts?: ListOptions): Promise<ListResult> {
    return this.#adapter.list(opts);
  }

  url(path: string, opts?: UrlOptions): Promise<string> {
    return this.#adapter.url(path, opts);
  }
}

/**
 * Consumer-facing class. Wraps an `Adapter` and exposes overloaded `download`,
 * write operations, plus the `snapshots` and `forks` namespaces.
 *
 * The adapter is already path-normalized via `defineAdapter`, so methods here
 * are straight passthroughs (except for wrapping `snapshots.get` and
 * `forks.get` returns in `ReadOnlyStorage` / `Storage` so consumers get the
 * same ergonomics on derived readers and forks).
 *
 * `Raw` flows through from the adapter to `storage.raw` and to every
 * `forks.get(name)` return. Adapters that don't narrow it default to
 * `unknown`. Adapters that do (e.g. `Adapter<S3Client>`) give consumers a
 * typed escape hatch without casts.
 */
export class Storage<Raw = unknown> extends ReadOnlyStorage {
  readonly #adapter: Adapter<Raw>;
  readonly raw: Raw;
  readonly snapshots: {
    create(opts?: CreateSnapshotOptions): Promise<SnapshotInfo>;
    list(): Promise<SnapshotInfo[]>;
    head(id: string, opts?: { signal?: AbortSignal }): Promise<SnapshotInfo>;
    delete(id: string, opts?: { signal?: AbortSignal }): Promise<void>;
    get(id: string): ReadOnlyStorage;
  };
  readonly forks: {
    create(opts: ForkOptions): Promise<ForkInfo>;
    list(): Promise<ForkInfo[]>;
    head(name: string, opts?: { signal?: AbortSignal }): Promise<ForkInfo>;
    delete(name: string, opts?: { signal?: AbortSignal }): Promise<void>;
    get(name: string): Storage<Raw>;
    merge(name: string, opts?: MergeOptions): Promise<SnapshotInfo>;
    rebase(name: string, opts?: RebaseOptions): Promise<SnapshotInfo>;
    diff(name: string, opts?: DiffOptions): Promise<ForkDiff>;
  };

  constructor(opts: StorageOptions<Raw>) {
    super(opts);
    const { adapter } = opts;
    this.#adapter = adapter;
    this.raw = adapter.raw;

    this.snapshots = {
      create: (createOpts) => adapter.snapshots.create(createOpts),
      list: () => adapter.snapshots.list(),
      head: (id, headOpts) => adapter.snapshots.head(id, headOpts),
      delete: (id, deleteOpts) => adapter.snapshots.delete(id, deleteOpts),
      get: (id) => new ReadOnlyStorage({ adapter: adapter.snapshots.get(id) }),
    };

    this.forks = {
      create: (forkOpts) => adapter.forks.create(forkOpts),
      list: () => adapter.forks.list(),
      head: (name, headOpts) => adapter.forks.head(name, headOpts),
      delete: (name, deleteOpts) => adapter.forks.delete(name, deleteOpts),
      get: (name) => new Storage<Raw>({ adapter: adapter.forks.get(name) }),
      merge: (name, mergeOpts) => adapter.forks.merge(name, mergeOpts),
      rebase: (name, mergeOpts) => adapter.forks.rebase(name, mergeOpts),
      diff: (name, diffOpts) => adapter.forks.diff(name, diffOpts),
    };
  }

  upload(
    path: string,
    body: BodyInput,
    opts?: UploadOptions
  ): Promise<StorageItemMeta> {
    const multipart = decideMultipart(body, opts);
    return this.#adapter.upload(path, body, { ...opts, multipart });
  }

  delete(path: string, opts?: { signal?: AbortSignal }): Promise<void> {
    return this.#adapter.delete(path, opts);
  }

  copy(
    from: string,
    to: string,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    return this.#adapter.copy(from, to, opts);
  }

  move(
    from: string,
    to: string,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    return this.#adapter.move(from, to, opts);
  }

  uploadUrl(path: string, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
    return this.#adapter.uploadUrl(path, opts);
  }
}

/**
 * Decide whether an upload should go multipart. Explicit `multipart: true |
 * false` always wins. Otherwise: streams (size unknown upfront) go
 * multipart; size-known bodies multipart only if larger than the threshold
 * (default 5 MB; overrideable via `opts.multipartThreshold`).
 */
function decideMultipart(
  body: BodyInput,
  opts: UploadOptions | undefined
): boolean {
  if (opts?.multipart !== undefined) return opts.multipart;
  const threshold = opts?.multipartThreshold ?? MULTIPART_THRESHOLD_DEFAULT;
  const size = bodySize(body);
  return size === undefined || size > threshold;
}

function bodySize(body: BodyInput): number | undefined {
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (typeof body === 'string') {
    return new TextEncoder().encode(body).byteLength;
  }
  if (body instanceof Blob) return body.size;
  return undefined; // ReadableStream — size unknown
}
