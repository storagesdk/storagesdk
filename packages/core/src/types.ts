export type BodyInput =
  | ReadableStream<Uint8Array>
  | Blob
  | ArrayBuffer
  | Uint8Array
  | string;

/**
 * Lightweight metadata for an object. Returned by `list` (one per item) and
 * `head`. No body — call `download` if you need the bytes.
 */
export interface StorageItemMeta {
  readonly path: string;
  readonly size: number;
  readonly contentType: string;
  readonly etag: string;
  readonly lastModified: Date;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * A full object: metadata plus the raw body bytes. Returned by `download`.
 */
export interface StorageItem extends StorageItemMeta {
  readonly body: Uint8Array<ArrayBuffer>;
}

export interface ListResult {
  items: StorageItemMeta[];
  cursor?: string;
}

/**
 * A half-open byte range, in offset/length form. We use offset+length
 * rather than start/end because every interop point that hits a `range`
 * is a different convention on the end bound — HTTP's `Range: bytes=N-M`
 * is inclusive, JS `Array.slice(start, end)` is exclusive,
 * `fs.createReadStream({ start, end })` is inclusive. Offset+length has
 * no ambiguity.
 *
 * - `offset >= 0` — first byte to read, 0-based.
 * - `length >  0` — number of bytes to read.
 *
 * If `offset + length` extends past the end of the object, the adapter
 * returns whatever bytes exist (no error) — matches HTTP Range semantics.
 * `offset` beyond end-of-object surfaces as the backend's range error
 * (typically `Provider` or `InvalidArgument`).
 */
export interface ByteRange {
  offset: number;
  length: number;
}

/**
 * Options for `download`. `range` requests a slice of the object;
 * `signal` short-circuits an in-flight read.
 */
export interface DownloadOptions {
  signal?: AbortSignal;
  range?: ByteRange;
}

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  /**
   * Force a multipart vs single-PUT upload.
   * - `true`: force multipart.
   * - `false`: force single PUT. For streams, the adapter (or its backend
   *    SDK) may buffer the entire body in memory to obtain a Content-Length
   *    — fine for small streams, OOMs for large ones.
   * - `undefined` (default): the SDK auto-decides via the body size and
   *    `multipartThreshold`. Streams are auto-multipart because their
   *    size isn't known upfront.
   */
  multipart?: boolean;
  /**
   * Body-size threshold (in bytes) above which `upload()` auto-selects
   * multipart. Default 5 MB. Only consulted when `multipart` is not
   * explicitly set.
   */
  multipartThreshold?: number;
  partSize?: number;
  concurrency?: number;
  onProgress?: (event: UploadProgress) => void;
  signal?: AbortSignal;
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  delimiter?: string;
  signal?: AbortSignal;
}

export interface UrlOptions {
  expiresIn?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
  signal?: AbortSignal;
}

export interface UploadUrlOptions {
  expiresIn?: number;
  contentType?: string;
  maxSize?: number;
  minSize?: number;
  signal?: AbortSignal;
}

export type UploadUrlResult =
  | {
      method: 'PUT';
      url: string;
      headers?: Record<string, string>;
    }
  | {
      method: 'POST';
      url: string;
      fields: Record<string, string>;
    };

export interface SnapshotInfo {
  readonly id: string;
  readonly name?: string;
  readonly createdAt: Date;
}

export interface ForkInfo {
  readonly name: string;
  /**
   * The snapshot the fork was seeded from. Always set on forks created
   * through `forks.create()` (the SDK auto-snapshots if the caller
   * didn't supply one) — `merge` and `rebase` use this as the base for
   * their three-way diff. The `?` is kept for backwards compatibility
   * with manifests written before this field was guaranteed.
   */
  readonly fromSnapshot?: string;
  readonly createdAt: Date;
}

export interface CreateSnapshotOptions {
  name?: string;
  onProgress?: (event: SnapshotProgress) => void;
  signal?: AbortSignal;
}

export interface SnapshotProgress {
  scanned: number;
  total?: number;
}

export interface ForkOptions {
  name: string;
  /**
   * Seed the fork from a specific snapshot id. Omit to fork from the
   * parent's current live state — copy-based adapters (FS, S3) simply copy
   * the live source; native adapters (Tigris) pass the omission through
   * to their fork API. Either way, the returned `ForkInfo.fromSnapshot`
   * is populated (auto-snapshotting if the caller didn't supply one) so
   * `merge` / `rebase` have a base to diff against.
   */
  fromSnapshot?: string;
  onProgress?: (event: ForkProgress) => void;
  signal?: AbortSignal;
}

export interface MergeOptions {
  /**
   * Use this snapshot on the source side as the input to the operation
   * instead of the source's current state. For `merge` the source is
   * the fork — pass an id from the fork's own snapshot namespace
   * (`storage.forks.get(name).snapshots.list()`). For `rebase` the
   * source is the parent — pass an id from the parent's snapshot
   * namespace.
   */
  snapshot?: string;
  signal?: AbortSignal;
}

/**
 * Options for `forks.diff`.
 *
 * - `direction`: which side of the three-way diff to return.
 *   - `'ahead'` (default) — what `merge` would apply to the parent.
 *   - `'behind'` — what `rebase` would apply to the fork.
 * - `snapshot`: source-side snapshot id to use instead of the source's
 *   current state. Symmetric with `MergeOptions.snapshot` — for
 *   `direction: 'ahead'` it's a fork-snapshot; for `direction: 'behind'`
 *   it's a parent-snapshot.
 */
export interface DiffOptions {
  direction?: 'ahead' | 'behind';
  snapshot?: string;
  signal?: AbortSignal;
}

/**
 * Result of a one-direction `forks.diff` — the changes a hypothetical
 * merge or rebase in the chosen direction would apply.
 *
 * - `added`: paths in the source side but not in the destination.
 * - `modified`: paths in both, where the source's `lastModified` is
 *   strictly newer than the destination's.
 * - `deleted`: paths in the fork's base snapshot that the source has
 *   since removed — would propagate as deletes on apply.
 */
export interface ForkDiff {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
}

export interface ForkProgress {
  copied: number;
  total: number;
  bytes?: number;
}
