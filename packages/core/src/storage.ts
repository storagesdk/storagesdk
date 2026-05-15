import type { Adapter, ReadOnlyAdapter } from './adapter.js';
import { toWebStream } from './streams.js';
import type {
  BodyInput,
  CreateSnapshotOptions,
  ForkInfo,
  ForkOptions,
  ListOptions,
  ListResult,
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

  download(path: string): Promise<StorageItem>;
  download(
    path: string,
    opts: { as: 'stream'; signal?: AbortSignal }
  ): Promise<ReadableStream<Uint8Array>>;
  download(
    path: string,
    opts: { as: 'text'; signal?: AbortSignal }
  ): Promise<string>;
  download(
    path: string,
    opts: { as: 'bytes'; signal?: AbortSignal }
  ): Promise<Uint8Array>;
  download(
    path: string,
    opts: { as: 'blob'; signal?: AbortSignal }
  ): Promise<Blob>;
  download(
    path: string,
    opts: { as: 'json'; signal?: AbortSignal }
  ): Promise<unknown>;
  async download(
    path: string,
    opts?: {
      as?: 'stream' | 'text' | 'bytes' | 'blob' | 'json';
      signal?: AbortSignal;
    }
  ): Promise<unknown> {
    const passthrough = opts?.signal ? { signal: opts.signal } : undefined;
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
    };
  }

  upload(
    path: string,
    body: BodyInput,
    opts?: UploadOptions
  ): Promise<StorageItemMeta> {
    return this.#adapter.upload(path, body, opts);
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
