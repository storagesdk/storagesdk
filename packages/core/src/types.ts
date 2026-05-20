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
   * The snapshot the fork was seeded from. `undefined` when the fork was
   * created directly from the parent's live state rather than from a
   * captured snapshot (see `ForkOptions.fromSnapshot`).
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
   * to their fork API.
   */
  fromSnapshot?: string;
  onProgress?: (event: ForkProgress) => void;
  signal?: AbortSignal;
}

export interface ForkProgress {
  copied: number;
  total: number;
  bytes?: number;
}
