import {
  type Adapter,
  bodyToBytes,
  checkSignal,
  defineAdapter,
  emptyManifest,
  type ForkInfo,
  isInternalKey,
  type ListOptions,
  type ListResult,
  nextSnapshotId,
  type ReadOnlyAdapter,
  readManifest,
  readStreamToBytes,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
  writeManifest,
} from '@storagesdk/core/adapter';
import {
  type BlobAccessType,
  copy as blobCopy,
  list as blobList,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
} from '@vercel/blob';
import { asStorageError } from './errors.js';

export interface VercelBlobConfig {
  /**
   * Logical bucket name. Vercel Blob stores all blobs in a single flat
   * pathname namespace, so the adapter maps each storagesdk "bucket"
   * to a pathname prefix — multiple buckets coexist in one Vercel
   * Blob store this way.
   */
  bucket: string;
  /**
   * Read-write token. Defaults to the `BLOB_READ_WRITE_TOKEN` env var
   * (Vercel SDK convention); set explicitly when running outside Vercel's
   * runtime or when you need to override.
   */
  token?: string;
  /**
   * Default access for new uploads. `public` blobs are addressable via
   * a CDN URL with no auth; `private` blobs require a signed URL to
   * read. Defaults to `public`. Changes the shape of `url()` (CDN URL
   * vs. signed URL) but not the `upload`/`download`/`head` surface.
   */
  access?: BlobAccessType;
}

/**
 * Resolved-config snapshot exposed via `storage.raw` so consumers can
 * call `@vercel/blob` functions directly (e.g. `put`, `copy`, `del`)
 * without re-threading the token + access defaults.
 */
export interface VercelBlobRaw {
  /** The token the adapter is authenticated with. */
  readonly token: string | undefined;
  /** The default access mode for uploads. */
  readonly access: BlobAccessType;
}

/**
 * Compose a Vercel Blob pathname from a logical bucket + key. Vercel
 * Blob has no native buckets, so every adapter operation prefixes the
 * caller-facing key with `${bucket}/` before reaching the SDK.
 */
const bucketKey = (bucket: string, key: string): string => `${bucket}/${key}`;

/** Inverse of `bucketKey` — strip the `${bucket}/` prefix off a pathname. */
const stripBucketPrefix = (bucket: string, path: string): string => {
  const prefix = `${bucket}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
};

/**
 * Option fragment spread into every `@vercel/blob` call. `token` is
 * `?: string` (not `?: string | undefined`) under
 * `exactOptionalPropertyTypes`, so we omit the key entirely when the
 * adapter wasn't configured with one — the SDK falls back to
 * `BLOB_READ_WRITE_TOKEN` from the environment.
 */
type TokenSpread = { token: string } | Record<string, never>;

/**
 * Adapter for Vercel Blob.
 *
 * Vercel Blob has no native bucket concept — every blob lives in a flat
 * pathname namespace within a Blob store. The adapter maps each
 * storagesdk "bucket" to a pathname prefix (`<bucket>/<key>`), so
 * multiple logical buckets coexist in one store.
 *
 * Snapshots and forks follow the sibling-prefix convention from the
 * filesystem adapter: a snapshot lives at `<bucket>-snapshot-<id>/`,
 * a fork at `<forkName>/`. Each carries its own `.storagesdk.metadata.json`
 * manifest at the prefix root.
 *
 * **Gaps:** Vercel Blob has no concept of user metadata, so the
 * `metadata` option on `upload` is silently dropped (documented in the
 * adapter compat matrix). Bring your own sidecar if you need per-object
 * metadata.
 */
export function vercel(config: VercelBlobConfig): Adapter<VercelBlobRaw> {
  const raw: VercelBlobRaw = {
    token: config.token,
    access: config.access ?? 'public',
  };
  // Built once per user-facing adapter; sub-impls (snapshot readers,
  // forks) receive the same shared object.
  const tokenSpread: TokenSpread =
    config.token !== undefined ? { token: config.token } : {};
  return defineAdapter<VercelBlobRaw>(impl(raw, config.bucket, tokenSpread));
}

function impl(
  raw: VercelBlobRaw,
  bucketName: string,
  tokenSpread: TokenSpread
): Adapter<VercelBlobRaw> {
  return {
    name: 'vercel',
    raw,

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      // Vercel Blob has no user-metadata field; `opts.metadata` is
      // silently dropped (documented in README).
      const payload = await bodyToBytes(body);
      try {
        await put(bucketKey(bucketName, key), Buffer.from(payload), {
          access: raw.access,
          addRandomSuffix: false,
          allowOverwrite: true,
          ...(opts?.contentType !== undefined
            ? { contentType: opts.contentType }
            : {}),
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          ...tokenSpread,
        });
        return {
          path: key,
          size: payload.byteLength,
          contentType: opts?.contentType ?? 'application/octet-stream',
          // Vercel's PutBlobResult doesn't expose etag/lastModified;
          // omit them rather than fabricating values. `head()` returns
          // them when callers need a fresh read.
          etag: '',
          lastModified: new Date(),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      try {
        // `get` with the resolved access mode returns a stream from the
        // CDN (public) or the auth'd origin (private). It returns null
        // for 304 responses — we don't send `ifNoneMatch`, so 200 is
        // the only path we hit on success.
        // Range requests go through Vercel's `headers` passthrough on
        // `get` — the CDN/origin honors `Range: bytes=N-M` like any
        // HTTP server. The response stream contains just the slice.
        const rangeHeader =
          opts?.range !== undefined
            ? {
                Range: `bytes=${opts.range.offset}-${opts.range.offset + opts.range.length - 1}`,
              }
            : undefined;
        const res = await get(bucketKey(bucketName, key), {
          access: raw.access,
          // The SDK contract is read-your-writes — writes that just
          // landed must be visible to the next read. Vercel's CDN can
          // serve stale reads (including stale 404s) for a short
          // window after a put, which breaks the manifest read/write
          // round-trip for snapshots and forks. `useCache: false`
          // bypasses the CDN; it's effective for private blobs and a
          // no-op for public ones (documented caveat in the README).
          useCache: false,
          ...(rangeHeader !== undefined ? { headers: rangeHeader } : {}),
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          ...tokenSpread,
        });
        // `@vercel/blob` normalizes any non-304 HTTP status to
        // `statusCode: 200` in `GetBlobResult` (incl. 206 Partial
        // Content for range responses), so the 200 check is the
        // success path for both full and range reads.
        if (res === null || res.statusCode !== 200) {
          throw new StorageError({
            code: 'NotFound',
            message: `${key} not found`,
          });
        }
        const body = await readStreamToBytes(res.stream);
        return {
          path: key,
          // `res.blob.size` is the full-object size from blob metadata;
          // on a range response that doesn't match what's in `body`.
          // Use the actual bytes returned so `StorageItem.size`
          // reflects the slice — matches the cross-adapter contract.
          size: body.byteLength,
          contentType: res.blob.contentType,
          etag: res.blob.etag,
          lastModified: res.blob.uploadedAt,
          body,
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      try {
        const res = await head(bucketKey(bucketName, key), {
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          ...tokenSpread,
        });
        return {
          path: key,
          size: res.size,
          contentType: res.contentType,
          etag: res.etag,
          lastModified: res.uploadedAt,
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const limit = opts?.limit ?? 1000;
      try {
        // Scope every call to the bucket prefix and append the
        // caller's prefix on top. The manifest blob is filtered in
        // post — same approach as the S3 adapter (matched page size
        // to limit, accept page that returns `limit - 1` items when
        // the manifest is on it).
        const callerPrefix = opts?.prefix ?? '';
        const res = await blobList({
          prefix: `${bucketName}/${callerPrefix}`,
          limit,
          ...(opts?.cursor !== undefined ? { cursor: opts.cursor } : {}),
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          ...tokenSpread,
        });
        const items: StorageItemMeta[] = [];
        for (const blob of res.blobs) {
          const path = stripBucketPrefix(bucketName, blob.pathname);
          if (isInternalKey(path)) continue;
          items.push({
            path,
            size: blob.size,
            // ListBlobResultBlob doesn't carry contentType — Vercel
            // omits it from the list endpoint. Fall back to the
            // generic default; callers needing contentType can `head`.
            contentType: 'application/octet-stream',
            etag: blob.etag,
            lastModified: blob.uploadedAt,
          });
        }
        return res.cursor !== undefined
          ? { items, cursor: res.cursor }
          : { items };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        await del(bucketKey(bucketName, key), {
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          ...tokenSpread,
        });
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        await blobCopy(bucketKey(bucketName, from), bucketKey(bucketName, to), {
          access: raw.access,
          addRandomSuffix: false,
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          ...tokenSpread,
        });
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      // Vercel Blob has no native move; copy + delete is what we get.
      // Copy is atomic on the destination, so the worst-case partial
      // state is a leftover source — same pattern as S3 / GCS.
      try {
        await blobCopy(bucketKey(bucketName, from), bucketKey(bucketName, to), {
          access: raw.access,
          addRandomSuffix: false,
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          ...tokenSpread,
        });
        await del(bucketKey(bucketName, from), tokenSpread);
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      try {
        // For public access, the CDN URL on the `head` response is
        // already callable with no auth — return it directly.
        // For private access, mint a signed URL via the delegation
        // flow so callers get something the browser can fetch.
        if (raw.access === 'public') {
          const res = await head(bucketKey(bucketName, key), {
            ...(opts?.signal ? { abortSignal: opts.signal } : {}),
            ...tokenSpread,
          });
          return res.url;
        }
        const signedToken = await issueSignedToken({
          pathname: bucketKey(bucketName, key),
          operations: ['get'],
          validUntil: Date.now() + (opts?.expiresIn ?? 3600) * 1000,
          ...tokenSpread,
        });
        const { presignedUrl } = await presignUrl(signedToken, {
          operation: 'get',
          pathname: bucketKey(bucketName, key),
          access: 'private',
        });
        return presignedUrl;
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async uploadUrl(key, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      checkSignal(opts?.signal);
      // Vercel Blob signed PUT URLs go through a two-call delegation
      // flow: `issueSignedToken` mints a server-side token scoped to
      // the pathname and operation; `presignUrl` produces the PUT URL.
      // `maximumSizeInBytes` and `allowedContentTypes` are enforced at
      // signing time (no POST policy needed), so `maxSize`/`minSize`
      // map cleanly. `minSize` has no equivalent on Vercel — silently
      // dropped (documented in compat matrix).
      try {
        const validUntil = Date.now() + (opts?.expiresIn ?? 3600) * 1000;
        const signedToken = await issueSignedToken({
          pathname: bucketKey(bucketName, key),
          operations: ['put'],
          validUntil,
          ...(opts?.contentType !== undefined
            ? { allowedContentTypes: [opts.contentType] }
            : {}),
          ...(opts?.maxSize !== undefined
            ? { maximumSizeInBytes: opts.maxSize }
            : {}),
          ...tokenSpread,
        });
        const { presignedUrl } = await presignUrl(signedToken, {
          operation: 'put',
          pathname: bucketKey(bucketName, key),
          access: raw.access,
          addRandomSuffix: false,
          allowOverwrite: true,
          ...(opts?.contentType !== undefined
            ? { allowedContentTypes: [opts.contentType] }
            : {}),
          ...(opts?.maxSize !== undefined
            ? { maximumSizeInBytes: opts.maxSize }
            : {}),
        });
        return { method: 'PUT', url: presignedUrl };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    // Sibling-prefix convention for snapshots and forks: each is a new
    // pathname prefix within the same Vercel Blob store, populated by
    // server-side `copy` per blob. Manifest sits at `<prefix>/.storagesdk.metadata.json`.
    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const id = nextSnapshotId(bucketName);
        try {
          await copyAllBlobs(raw, bucketName, id, opts?.signal, tokenSpread);

          const snapImpl = impl(raw, id, tokenSpread);
          await writeManifest(
            snapImpl,
            emptyManifest({ location: bucketName, snapshotId: null })
          );

          const thisImpl = impl(raw, bucketName, tokenSpread);
          const meta = await readManifest(thisImpl);
          const info: SnapshotInfo = {
            id,
            createdAt: new Date(),
            ...(opts?.name !== undefined ? { name: opts.name } : {}),
          };
          meta.snapshots.push(info);
          await writeManifest(thisImpl, meta);
          return info;
        } catch (err) {
          await destroySibling(id, tokenSpread).catch(() => {});
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        const thisImpl = impl(raw, bucketName, tokenSpread);
        return (await readManifest(thisImpl)).snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const thisImpl = impl(raw, bucketName, tokenSpread);
        const meta = await readManifest(thisImpl);
        const found = meta.snapshots.find((s) => s.id === id);
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
        const thisImpl = impl(raw, bucketName, tokenSpread);
        const meta = await readManifest(thisImpl);
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        await destroySibling(id, tokenSpread);
        await writeManifest(thisImpl, meta);
      },

      get(id): ReadOnlyAdapter {
        const snapImpl = impl(raw, id, tokenSpread);
        return {
          download: (p, opts) => snapImpl.download(p, opts),
          head: (p, opts) => snapImpl.head(p, opts),
          list: (opts) => snapImpl.list(opts),
          url: (p, opts) => snapImpl.url(p, opts),
        };
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        // Vercel Blob has no native bucket concept, so two forks with
        // the same name would just write to the same pathname prefix.
        // Pre-check via the parent manifest so duplicate fork names
        // surface as `Conflict` to match the cross-adapter contract.
        // Race window is narrow and bounded — if a fork sneaks in
        // between the check and the create, the second one will
        // overwrite (no condition support in Vercel's `put`); the
        // examples create serially.
        const parent = impl(raw, bucketName, tokenSpread);
        const existing = await readManifest(parent);
        if (existing.forks.some((f) => f.name === opts.name)) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }
        // Validate `fromSnapshot` against the manifest — without this
        // check a bogus snapshot id would silently produce an empty
        // fork referencing nothing. Other adapters (fs, s3, gcs, etc.)
        // reject; match that.
        if (
          opts.fromSnapshot !== undefined &&
          !existing.snapshots.some((s) => s.id === opts.fromSnapshot)
        ) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${opts.fromSnapshot} not found`,
          });
        }
        const source = opts.fromSnapshot ?? bucketName;
        try {
          await copyAllBlobs(raw, source, opts.name, opts.signal, tokenSpread);

          const forkImpl = impl(raw, opts.name, tokenSpread);
          await writeManifest(
            forkImpl,
            emptyManifest({
              location: bucketName,
              snapshotId: opts.fromSnapshot ?? null,
            })
          );

          const thisImpl = impl(raw, bucketName, tokenSpread);
          const meta = await readManifest(thisImpl);
          const info: ForkInfo = {
            name: opts.name,
            createdAt: new Date(),
            ...(opts.fromSnapshot !== undefined
              ? { fromSnapshot: opts.fromSnapshot }
              : {}),
          };
          meta.forks.push(info);
          await writeManifest(thisImpl, meta);
          return info;
        } catch (err) {
          await destroySibling(opts.name, tokenSpread).catch(() => {});
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        const thisImpl = impl(raw, bucketName, tokenSpread);
        return (await readManifest(thisImpl)).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const thisImpl = impl(raw, bucketName, tokenSpread);
        const meta = await readManifest(thisImpl);
        const found = meta.forks.find((f) => f.name === name);
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
        const thisImpl = impl(raw, bucketName, tokenSpread);
        const meta = await readManifest(thisImpl);
        meta.forks = meta.forks.filter((f) => f.name !== name);
        await destroySibling(name, tokenSpread);
        await writeManifest(thisImpl, meta);
      },

      get(name): Adapter<VercelBlobRaw> {
        return impl(raw, name, tokenSpread);
      },
    },
  };
}

/**
 * Server-side copy every blob from one prefix to another. Paginates
 * through the source via `list` so the in-memory footprint stays
 * one page at a time. Skips the source manifest — the destination
 * writes its own.
 */
async function copyAllBlobs(
  raw: VercelBlobRaw,
  fromBucket: string,
  toBucket: string,
  signal: AbortSignal | undefined,
  tokenSpread: TokenSpread
): Promise<void> {
  const fromPrefix = `${fromBucket}/`;
  const toPrefix = `${toBucket}/`;
  let cursor: string | undefined;
  do {
    const page = await blobList({
      prefix: fromPrefix,
      ...(cursor !== undefined ? { cursor } : {}),
      ...(signal ? { abortSignal: signal } : {}),
      ...tokenSpread,
    });
    for (const blob of page.blobs) {
      const relative = blob.pathname.slice(fromPrefix.length);
      if (isInternalKey(relative)) continue;
      await blobCopy(blob.pathname, `${toPrefix}${relative}`, {
        access: raw.access,
        addRandomSuffix: false,
        ...(signal ? { abortSignal: signal } : {}),
        ...tokenSpread,
      });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor !== undefined);
}

/**
 * Best-effort cleanup after a failed snapshot/fork creation. Lists
 * every blob under the sibling prefix and deletes them. Swallows
 * secondary errors — the original failure is what the caller cares
 * about.
 */
async function destroySibling(
  name: string,
  tokenSpread: TokenSpread
): Promise<void> {
  const prefix = `${name}/`;
  try {
    let cursor: string | undefined;
    do {
      const page = await blobList({
        prefix,
        ...(cursor !== undefined ? { cursor } : {}),
        ...tokenSpread,
      });
      const pathnames = page.blobs.map((b) => b.pathname);
      if (pathnames.length > 0) {
        await del(pathnames, tokenSpread);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor !== undefined);
  } catch {
    /* swallow — best-effort */
  }
}
