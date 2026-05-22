import {
  type Adapter,
  type BodyInput,
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
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
} from '@storagesdk/core/adapter';
import * as tigrisSdk from '@tigrisdata/storage';
import {
  createBucket,
  createBucketSnapshot,
  deleteBucketSnapshot,
  get,
  getPresignedUrl,
  listBucketSnapshots,
  listForks,
  put,
  remove,
  removeBucket,
  copy as tigrisCopy,
  head as tigrisHead,
  list as tigrisList,
  move as tigrisMove,
} from '@tigrisdata/storage';
import { asStorageError, unwrap } from './errors.js';

/**
 * Adapter config for Tigris. Flat shape — the same shape is what the adapter
 * passes to every `@tigrisdata/storage` call, so we don't need a separate
 * "resolved client config" type. All credentials are explicit; no fallback
 * to env vars or credential providers at this layer.
 */
export interface TigrisConfig {
  /** Bucket the adapter operates on. */
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Tigris S3-style data endpoint. Optional — when omitted, the underlying
   * `@tigrisdata/storage` client uses its built-in default (Tigris's
   * production endpoint).
   */
  endpoint?: string;
  /** Force path-style addressing on S3-backed object ops. */
  forcePathStyle?: boolean;
}

/**
 * `storage.raw` shape on the Tigris adapter. Every value-namespace export of
 * `@tigrisdata/storage` — functions, constants, the `UploadAction` enum — is
 * accessible on `storage.raw` with the adapter's auth / endpoint / bucket
 * already injected. Call them as if you imported them from `@tigrisdata/storage`
 * directly; per-call `config` overrides are merged on top of the adapter's
 * resolved config (user wins, adapter fills the gaps).
 *
 * ```ts
 * await storage.raw.setBucketLifecycle('my-bucket', {
 *   lifecycleRules: [{ expiration: { days: 30 } }],
 * });
 * ```
 */
export type TigrisRaw = typeof tigrisSdk;

/**
 * Adapter for Tigris storage. Snapshots and forks are first-class via
 * Tigris's native APIs (no manifest convention, no copy-based bookkeeping).
 * Object ops map 1:1 to `@tigrisdata/storage` functions.
 *
 * Bucket lifecycle is the caller's concern — the adapter operates on an
 * existing bucket and does not create or delete it. Tigris-only bucket
 * settings (lifecycle, CORS, TTL, etc.) are deliberately off the adapter
 * surface; reach them via the standalone `@tigrisdata/storage` functions,
 * passing `storage.raw` as their `config` argument.
 */
export function tigris(config: TigrisConfig): Adapter<TigrisRaw> {
  const resolved: TigrisConfig = {
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  };
  // exactOptionalPropertyTypes: only assign when set so we don't smuggle
  // `undefined` into the Tigris client's optional fields (which would
  // override the SDK's own defaults).
  if (config.endpoint !== undefined) resolved.endpoint = config.endpoint;
  if (config.forcePathStyle !== undefined) {
    resolved.forcePathStyle = config.forcePathStyle;
  }
  return defineAdapter<TigrisRaw>(impl(resolved));
}

function impl(config: TigrisConfig): Adapter<TigrisRaw> {
  const bucket = config.bucket;

  return {
    name: 'tigris',
    raw: makeRaw(config),

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      // Tigris's `put` takes an `abortController` (not `abortSignal`); bridge
      // the caller's signal into a fresh controller so an abort propagates.
      const abortController = bridgeSignalToController(opts?.signal);
      const res = await put(key, toTigrisBody(body), {
        config,
        ...(opts?.contentType !== undefined
          ? { contentType: opts.contentType }
          : {}),
        ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
        ...(opts?.multipart !== undefined ? { multipart: opts.multipart } : {}),
        ...(opts?.partSize !== undefined ? { partSize: opts.partSize } : {}),
        ...(opts?.concurrency !== undefined
          ? { queueSize: opts.concurrency }
          : {}),
        ...(abortController ? { abortController } : {}),
        ...(opts?.onProgress !== undefined
          ? {
              onUploadProgress: (e) =>
                opts.onProgress?.({ loaded: e.loaded, total: e.total }),
            }
          : {}),
      });
      const data = unwrap(res);
      return {
        path: data.path,
        size: data.size,
        contentType:
          data.contentType ?? opts?.contentType ?? 'application/octet-stream',
        etag: data.etag,
        lastModified: data.modified,
        ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
      };
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      // Use `'file'` format so body + metadata come from a single request —
      // avoids the body/metadata mismatch that an interleaved write between
      // `get` and a separate `head` would cause.
      const res = await get(key, 'file', { config });
      const file = unwrap(res);
      return {
        path: key,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
        // Tigris's `get` returns a bare File / ReadableStream — no etag in
        // the SDK response. Put/Head/List expose it; download doesn't yet.
        etag: '',
        lastModified: new Date(file.lastModified),
        body: new Uint8Array(await file.arrayBuffer()),
      };
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const res = await tigrisHead(key, { config });
      // Tigris signals "missing key" by returning `{ data: undefined,
      // error: undefined }` (no SDK error, no data). Don't run that through
      // `unwrap` — it would map to 'Provider'.
      if (res?.error !== undefined) throw asStorageError(res.error);
      const data = res?.data;
      if (!data) {
        throw new StorageError({
          code: 'NotFound',
          message: `${key} not found in ${bucket}`,
        });
      }
      return {
        path: data.path,
        size: data.size,
        contentType: data.contentType,
        etag: data.etag,
        lastModified: data.modified,
        ...(data.metadata && Object.keys(data.metadata).length > 0
          ? { metadata: data.metadata }
          : {}),
      };
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const res = await tigrisList({
        config,
        ...(opts?.prefix !== undefined ? { prefix: opts.prefix } : {}),
        ...(opts?.delimiter !== undefined ? { delimiter: opts.delimiter } : {}),
        ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts?.cursor !== undefined ? { paginationToken: opts.cursor } : {}),
      });
      const data = unwrap(res);
      const items: StorageItemMeta[] = data.items.map((it) => ({
        path: it.name,
        size: it.size,
        // Tigris's list response carries name/size/lastModified/etag but
        // no content-type or user metadata. Call head() per key for full meta.
        contentType: 'application/octet-stream',
        etag: it.etag,
        lastModified: it.lastModified,
      }));
      return data.paginationToken !== undefined
        ? { items, cursor: data.paginationToken }
        : { items };
    },

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      const res = await remove(key, { config });
      if (res?.error !== undefined) throw asStorageError(res.error);
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      const res = await tigrisCopy(from, to, { config });
      if (res?.error !== undefined) throw asStorageError(res.error);
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      const res = await tigrisMove(from, to, { config });
      if (res?.error !== undefined) throw asStorageError(res.error);
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      const res = await getPresignedUrl(key, {
        operation: 'get',
        config,
        ...(opts?.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}),
      });
      return unwrap(res).url;
    },

    async uploadUrl(key, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      checkSignal(opts?.signal);
      const res = await getPresignedUrl(key, {
        operation: 'put',
        config,
        ...(opts?.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}),
      });
      const data = unwrap(res);
      return { method: 'PUT', url: data.url };
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        // `createBucketSnapshot` and `listBucketSnapshots` take the bucket
        // as a positional arg — their `config` option is explicitly typed
        // `Omit<TigrisStorageConfig, 'bucket'>`, so `config.bucket` is
        // ignored at runtime ("Source bucket name is required" otherwise).
        const res = await createBucketSnapshot(bucket, {
          config,
          ...(opts?.name !== undefined ? { name: opts.name } : {}),
        });
        const data = unwrap(res);
        return {
          id: data.snapshotVersion,
          createdAt: new Date(),
          ...(opts?.name !== undefined ? { name: opts.name } : {}),
        };
      },

      async list(): Promise<SnapshotInfo[]> {
        const res = await listBucketSnapshots(bucket, { config });
        const data = unwrap(res);
        return data.snapshots
          .filter((s) => s.version !== undefined)
          .map((s) => ({
            id: s.version as string,
            createdAt: s.creationDate ?? new Date(),
            ...(s.name !== undefined ? { name: s.name } : {}),
          }));
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const all = await this.list();
        const found = all.find((s) => s.id === id);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return found;
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        const res = await deleteBucketSnapshot(bucket, id, { config });
        if (res?.error !== undefined) throw asStorageError(res.error);
      },

      get(id): ReadOnlyAdapter {
        return snapshotReader(id, config);
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        // Tigris's createBucket returns a generic provider error for a
        // duplicate bucket name that doesn't match our Conflict patterns
        // in `asStorageError`. Pre-check via listForks so duplicate fork
        // names surface as `Conflict` to match the cross-adapter contract.
        // Race window is narrow and bounded — if a fork sneaks in between
        // the check and create, Tigris still errors and we fall through
        // to Provider, which is acceptable.
        const existing = unwrap(await listForks(bucket, { config }));
        if (existing.forks.some((f) => f.name === opts.name)) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }
        const res = await createBucket(opts.name, {
          sourceBucketName: bucket,
          config,
          ...(opts.fromSnapshot !== undefined
            ? { sourceBucketSnapshot: opts.fromSnapshot }
            : {}),
        });
        unwrap(res);
        return {
          name: opts.name,
          createdAt: new Date(),
          ...(opts.fromSnapshot !== undefined
            ? { fromSnapshot: opts.fromSnapshot }
            : {}),
        };
      },

      async list(): Promise<ForkInfo[]> {
        const res = await listForks(bucket, { config });
        const data = unwrap(res);
        return data.forks.map((f) => ({
          name: f.name,
          createdAt: f.forkCreatedAt ?? new Date(),
          // `snapshot` is the source snapshot version; forks created from
          // the parent's live state may return an empty string here, in
          // which case `fromSnapshot` stays undefined to match our
          // contract (see ForkInfo).
          ...(f.snapshot ? { fromSnapshot: f.snapshot } : {}),
        }));
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const all = await this.list();
        const found = all.find((f) => f.name === name);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return found;
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        const res = await removeBucket(name, { force: true, config });
        if (res?.error !== undefined) throw asStorageError(res.error);
      },

      get(name): Adapter<TigrisRaw> {
        // Re-construct the impl scoped to the fork bucket. The outer
        // `defineAdapter` (in `tigris()`) wraps this via its recursive
        // `forks.get`, so the result is a single-wrapped adapter.
        return impl({ ...config, bucket: name });
      },
    },
  };
}

function snapshotReader(
  snapshotVersion: string,
  config: TigrisConfig
): ReadOnlyAdapter {
  return {
    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const res = await get(key, 'file', { config, snapshotVersion });
      const file = unwrap(res);
      return {
        path: key,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
        // See parent download — Tigris `get` doesn't surface etag yet.
        etag: '',
        lastModified: new Date(file.lastModified),
        body: new Uint8Array(await file.arrayBuffer()),
      };
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const res = await tigrisHead(key, { config, snapshotVersion });
      if (res?.error !== undefined) throw asStorageError(res.error);
      const data = res?.data;
      if (!data) {
        throw new StorageError({
          code: 'NotFound',
          message: `${key} not found in snapshot ${snapshotVersion}`,
        });
      }
      return {
        path: data.path,
        size: data.size,
        contentType: data.contentType,
        etag: data.etag,
        lastModified: data.modified,
        ...(data.metadata && Object.keys(data.metadata).length > 0
          ? { metadata: data.metadata }
          : {}),
      };
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const res = await tigrisList({
        config,
        snapshotVersion,
        ...(opts?.prefix !== undefined ? { prefix: opts.prefix } : {}),
        ...(opts?.delimiter !== undefined ? { delimiter: opts.delimiter } : {}),
        ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts?.cursor !== undefined ? { paginationToken: opts.cursor } : {}),
      });
      const data = unwrap(res);
      const items: StorageItemMeta[] = data.items.map((it) => ({
        path: it.name,
        size: it.size,
        contentType: 'application/octet-stream',
        etag: it.etag,
        lastModified: it.lastModified,
      }));
      return data.paginationToken !== undefined
        ? { items, cursor: data.paginationToken }
        : { items };
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      const res = await getPresignedUrl(key, {
        operation: 'get',
        snapshotVersion,
        config,
        ...(opts?.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}),
      });
      return unwrap(res).url;
    },
  };
}

function toTigrisBody(
  body: BodyInput
): string | ReadableStream | Blob | Buffer {
  if (typeof body === 'string') return body;
  if (body instanceof ReadableStream) return body;
  if (body instanceof Blob) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new StorageError({
    code: 'InvalidArgument',
    message: 'unsupported body type for Tigris adapter',
  });
}

/**
 * Build the `storage.raw` shape: a Proxy over `@tigrisdata/storage` that
 * injects the adapter's resolved config into every call. The type is
 * `typeof tigrisSdk` so IDE autocomplete and signatures behave exactly like
 * importing the SDK directly — new functions added to the SDK show up
 * automatically without changes here.
 *
 * Merge rule: per-call `config` overrides win, the adapter's resolved config
 * fills any unspecified field. `handleClientUpload` is the odd one out — its
 * config is a positional second arg, not inside options.
 */
function makeRaw(config: TigrisConfig): TigrisRaw {
  return new Proxy(tigrisSdk, {
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      if (prop === 'handleClientUpload') {
        return (request: unknown, userConfig?: TigrisConfig) =>
          (value as (r: unknown, c: TigrisConfig) => unknown)(request, {
            ...config,
            ...(userConfig ?? {}),
          });
      }
      return (...args: unknown[]) => {
        const last = args.length > 0 ? args[args.length - 1] : undefined;
        const isOptions =
          last !== null &&
          typeof last === 'object' &&
          !Array.isArray(last) &&
          !(last instanceof ArrayBuffer) &&
          !(last instanceof Uint8Array) &&
          !(last instanceof Blob) &&
          !(last instanceof ReadableStream);
        if (isOptions) {
          const opts = last as { config?: TigrisConfig };
          const merged = {
            ...opts,
            config: { ...config, ...(opts.config ?? {}) },
          };
          return (value as (...a: unknown[]) => unknown)(
            ...args.slice(0, -1),
            merged
          );
        }
        return (value as (...a: unknown[]) => unknown)(...args, { config });
      };
    },
  }) as TigrisRaw;
}

/**
 * Tigris's `put` accepts an `AbortController` (not an `AbortSignal`). Bridge
 * the caller's signal into a fresh controller so an abort propagates. Returns
 * undefined when no signal — `put` runs uncancelable in that case.
 */
function bridgeSignalToController(
  signal: AbortSignal | undefined
): AbortController | undefined {
  if (!signal) return undefined;
  const ctrl = new AbortController();
  if (signal.aborted) {
    ctrl.abort(signal.reason);
  } else {
    signal.addEventListener('abort', () => ctrl.abort(signal.reason), {
      once: true,
    });
  }
  return ctrl;
}
