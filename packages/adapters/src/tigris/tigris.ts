import {
  type Adapter,
  type BodyInput,
  bridgeSignalToController,
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
  type BucketLocations,
  createBucket,
  createBucketSnapshot,
  deleteBucketSnapshot,
  get,
  getBucketInfo,
  getPresignedUrl,
  getSignedUploadUrl,
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

  // Lazy, once-per-adapter cache of the source bucket's locations.
  // Used by `forks.create` so the new fork lands in the same locations
  // as the parent. Built here (one user-facing adapter = one call) and
  // passed to every `impl()`; sub-impls receive the same shared promise.
  let locationsPromise: Promise<BucketLocations | undefined> | undefined;
  const getSourceLocations = (): Promise<BucketLocations | undefined> => {
    if (locationsPromise === undefined) {
      locationsPromise = (async () => {
        try {
          const res = await getBucketInfo(resolved.bucket, {
            config: resolved,
          });
          return unwrap(res).locations;
        } catch {
          // If we can't read source bucket info, fall back to Tigris
          // defaults — better to attempt fork creation than fail upfront.
          return undefined;
        }
      })();
    }
    return locationsPromise;
  };

  return defineAdapter<TigrisRaw>(impl(resolved, getSourceLocations));
}

function impl(
  config: TigrisConfig,
  getSourceLocations: () => Promise<BucketLocations | undefined>
): Adapter<TigrisRaw> {
  const bucket = config.bucket;

  return {
    name: 'tigris',
    raw: makeRaw(config),

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      // Tigris's `put` takes an `abortController` (not `abortSignal`); bridge
      // the caller's signal into a fresh controller so an abort propagates.
      const bridge = bridgeSignalToController(opts?.signal);
      try {
        const res = await put(key, toTigrisBody(body), {
          config,
          ...(opts?.contentType !== undefined
            ? { contentType: opts.contentType }
            : {}),
          ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
          ...(opts?.multipart !== undefined
            ? { multipart: opts.multipart }
            : {}),
          ...(opts?.partSize !== undefined ? { partSize: opts.partSize } : {}),
          ...(opts?.concurrency !== undefined
            ? { queueSize: opts.concurrency }
            : {}),
          ...(bridge.controller ? { abortController: bridge.controller } : {}),
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
      } finally {
        bridge.dispose();
      }
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      // `includeMetadata: true` returns `{ body, metadata }` so we get
      // etag / modified / contentType / userMetadata from the same S3
      // response (avoids the body/metadata mismatch a separate `head`
      // would risk). Native `range: { start, end }` is inclusive on
      // both ends; convert offset/length on the wire.
      const res = await get(key, 'file', {
        config,
        includeMetadata: true,
        ...(opts?.range !== undefined
          ? {
              range: {
                start: opts.range.offset,
                end: opts.range.offset + opts.range.length - 1,
              },
            }
          : {}),
      });
      const { body: file, metadata } = unwrap(res);
      const body = new Uint8Array(await file.arrayBuffer());
      return {
        path: key,
        // `metadata.size` is the response body size (matches the slice
        // for range reads, equals the object size for full reads) —
        // exactly the cross-adapter contract.
        size: metadata.size,
        contentType: metadata.contentType || 'application/octet-stream',
        etag: metadata.etag,
        lastModified: metadata.modified,
        body,
        ...(Object.keys(metadata.userMetadata).length > 0
          ? { metadata: metadata.userMetadata }
          : {}),
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
      // `getSignedUploadUrl` returns a discriminated PUT/POST union that
      // matches our `UploadUrlResult` shape one-to-one: presence of
      // `maxSize`/`minSize` switches it to POST under the hood.
      const res = await getSignedUploadUrl(key, {
        config,
        ...(opts?.expiresIn !== undefined ? { expiresIn: opts.expiresIn } : {}),
        ...(opts?.contentType !== undefined
          ? { contentType: opts.contentType }
          : {}),
        ...(opts?.maxSize !== undefined ? { maxSize: opts.maxSize } : {}),
        ...(opts?.minSize !== undefined ? { minSize: opts.minSize } : {}),
      });
      const data = unwrap(res);
      return data.method === 'POST'
        ? { method: 'POST', url: data.url, fields: data.fields }
        : { method: 'PUT', url: data.url };
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
        // Validate `fromSnapshot` against `listBucketSnapshots`. Same
        // reason as the cross-adapter contract: a bogus snapshot id
        // would otherwise surface as `Provider` from Tigris's
        // createBucket, breaking parity with fs/s3/gcs/azure/vercel.
        if (opts.fromSnapshot !== undefined) {
          const snaps = unwrap(await listBucketSnapshots(bucket, { config }));
          if (!snaps.snapshots.some((s) => s.version === opts.fromSnapshot)) {
            throw new StorageError({
              code: 'NotFound',
              message: `snapshot ${opts.fromSnapshot} not found`,
            });
          }
        }
        const locations = await getSourceLocations();
        const res = await createBucket(opts.name, {
          sourceBucketName: bucket,
          config,
          ...(opts.fromSnapshot !== undefined
            ? { sourceBucketSnapshot: opts.fromSnapshot }
            : {}),
          ...(locations !== undefined ? { locations } : {}),
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
        return impl({ ...config, bucket: name }, getSourceLocations);
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
      // Same pattern as the writable adapter — `includeMetadata: true`
      // for etag/modified/contentType, native `range` for byte slices.
      const res = await get(key, 'file', {
        config,
        snapshotVersion,
        includeMetadata: true,
        ...(opts?.range !== undefined
          ? {
              range: {
                start: opts.range.offset,
                end: opts.range.offset + opts.range.length - 1,
              },
            }
          : {}),
      });
      const { body: file, metadata } = unwrap(res);
      const body = new Uint8Array(await file.arrayBuffer());
      return {
        path: key,
        size: metadata.size,
        contentType: metadata.contentType || 'application/octet-stream',
        etag: metadata.etag,
        lastModified: metadata.modified,
        body,
        ...(Object.keys(metadata.userMetadata).length > 0
          ? { metadata: metadata.userMetadata }
          : {}),
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
