import {
  type Bucket,
  type File,
  Storage as GcsStorage,
} from '@google-cloud/storage';
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
  toWebStream,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
  writeManifest,
} from '@storagesdk/core/adapter';
import { asStorageError } from './errors.js';

export interface GcsConfig {
  /** GCS bucket the adapter operates on. */
  bucket: string;
  /** Google Cloud project ID. */
  projectId: string;
  /**
   * Service-account credentials. Pass `{ client_email, private_key }`
   * directly, or omit and rely on `keyFilename` / Application Default
   * Credentials (`GOOGLE_APPLICATION_CREDENTIALS` env var, gcloud login,
   * GCE/GKE metadata server).
   */
  credentials?: { client_email: string; private_key: string };
  /** Path to a service-account JSON key file. */
  keyFilename?: string;
  /**
   * Override the GCS JSON API endpoint. Useful for fake-gcs-server local
   * emulation. Defaults to the production GCS endpoint.
   */
  apiEndpoint?: string;
}

/**
 * Adapter for Google Cloud Storage.
 *
 * Maps a GCS bucket to a storagesdk "bucket". Snapshots and forks follow
 * the sibling-bucket convention used by the S3 adapter: each is a new
 * GCS bucket populated by server-side copy. Manifest sits as a
 * `.storagesdk.metadata.json` object at the root of each bucket,
 * filtered out of `list()` results.
 *
 * GCS bucket names are globally unique across all of GCS. Snapshot ids
 * include 25 digits of timestamp + crypto random, so collisions are
 * effectively impossible. Fork names are user-provided — pick something
 * unlikely to collide globally.
 */
export function gcs(config: GcsConfig): Adapter<GcsStorage> {
  const client = new GcsStorage({
    projectId: config.projectId,
    ...(config.credentials !== undefined
      ? { credentials: config.credentials }
      : {}),
    ...(config.keyFilename !== undefined
      ? { keyFilename: config.keyFilename }
      : {}),
    ...(config.apiEndpoint !== undefined
      ? { apiEndpoint: config.apiEndpoint }
      : {}),
  });
  return defineAdapter<GcsStorage>(impl(client, config.bucket));
}

function impl(client: GcsStorage, bucketName: string): Adapter<GcsStorage> {
  const bucket = client.bucket(bucketName);

  return {
    name: 'gcs',
    raw: client,

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const file = bucket.file(key);
      const payload = await bodyToBytes(body);
      try {
        await file.save(Buffer.from(payload), {
          ...(opts?.contentType !== undefined
            ? { contentType: opts.contentType }
            : {}),
          ...(opts?.metadata !== undefined
            ? { metadata: { metadata: opts.metadata } }
            : {}),
        });
        return {
          path: key,
          size: payload.byteLength,
          contentType: opts?.contentType ?? 'application/octet-stream',
          etag: '',
          lastModified: new Date(),
          ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const file = bucket.file(key);
      try {
        // Single HTTP GET: body streams from the same response whose
        // headers carry the metadata, so they can't drift apart (no
        // TOCTOU between a download and a getMetadata).
        const stream = file.createReadStream();
        const headersPromise = new Promise<
          Record<string, string | string[] | undefined>
        >((resolve, reject) => {
          stream.once('response', (res) => resolve(res.headers));
          stream.once('error', reject);
        });
        const bodyPromise = readStreamToBytes(toWebStream(stream));
        const [headers, body] = await Promise.all([
          headersPromise,
          bodyPromise,
        ]);

        const meta: Record<string, string> = {};
        for (const [k, v] of Object.entries(headers)) {
          if (k.startsWith('x-goog-meta-') && typeof v === 'string') {
            meta[k.slice('x-goog-meta-'.length)] = v;
          }
        }
        const contentLength = headers['content-length'];
        const etag = headers.etag;
        const lastModified = headers['last-modified'];
        const contentType = headers['content-type'];
        return {
          path: key,
          size:
            typeof contentLength === 'string'
              ? Number(contentLength)
              : body.byteLength,
          contentType:
            typeof contentType === 'string'
              ? contentType
              : 'application/octet-stream',
          etag: typeof etag === 'string' ? etag.replace(/^"|"$/g, '') : '',
          lastModified:
            typeof lastModified === 'string'
              ? new Date(lastModified)
              : new Date(),
          body,
          ...(Object.keys(meta).length > 0 ? { metadata: meta } : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const file = bucket.file(key);
      try {
        const [meta] = await file.getMetadata();
        return {
          path: key,
          size:
            typeof meta.size === 'number' ? meta.size : Number(meta.size ?? 0),
          contentType: meta.contentType ?? 'application/octet-stream',
          etag: meta.etag ?? '',
          lastModified: meta.updated ? new Date(meta.updated) : new Date(),
          ...(meta.metadata && Object.keys(meta.metadata).length > 0
            ? { metadata: meta.metadata as Record<string, string> }
            : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const limit = opts?.limit ?? 1000;
      try {
        // Page size matches the caller's `limit` exactly. Filtering the
        // internal manifest may yield `limit - 1` items on the page
        // that contains it; that's the contract callers should expect
        // from `list({ limit })` ("up to N", not "exactly N"). The S3
        // adapter does the same. Over-fetching by 1 here would advance
        // the page token past an item we silently discarded.
        const [files, nextQuery] = await bucket.getFiles({
          maxResults: limit,
          autoPaginate: false,
          ...(opts?.prefix !== undefined ? { prefix: opts.prefix } : {}),
          ...(opts?.cursor !== undefined ? { pageToken: opts.cursor } : {}),
        });
        const items: StorageItemMeta[] = [];
        for (const f of files as File[]) {
          if (isInternalKey(f.name)) continue;
          const meta = f.metadata;
          items.push({
            path: f.name,
            size:
              typeof meta.size === 'number'
                ? meta.size
                : Number(meta.size ?? 0),
            contentType: meta.contentType ?? 'application/octet-stream',
            etag: meta.etag ?? '',
            lastModified: meta.updated ? new Date(meta.updated) : new Date(),
          });
        }
        const cursor = (nextQuery as { pageToken?: string } | undefined)
          ?.pageToken;
        return cursor !== undefined ? { items, cursor } : { items };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        await bucket.file(key).delete({ ignoreNotFound: true });
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        await bucket.file(from).copy(bucket.file(to));
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        await bucket.file(from).copy(bucket.file(to));
        // Copy succeeded — see the delete through unconditionally so a
        // mid-move abort doesn't leave both src and dst.
        await bucket.file(from).delete();
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      try {
        const [url] = await bucket.file(key).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + (opts?.expiresIn ?? 3600) * 1000,
        });
        return url;
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async uploadUrl(key, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      checkSignal(opts?.signal);
      // POST-policy support via `generateSignedPostPolicyV4`. Triggered
      // when `maxSize`/`minSize` is set — the size cap is enforced
      // server-side. Without those, return a `write` signed URL for PUT.
      try {
        const file = bucket.file(key);
        const wantsPost =
          opts?.minSize !== undefined || opts?.maxSize !== undefined;
        if (wantsPost) {
          const min = opts?.minSize ?? 0;
          const max = opts?.maxSize ?? 5 * 1024 * 1024 * 1024;
          const conditions: unknown[] = [['content-length-range', min, max]];
          if (opts?.contentType !== undefined) {
            conditions.push({ 'content-type': opts.contentType });
          }
          const [post] = await file.generateSignedPostPolicyV4({
            expires: Date.now() + (opts?.expiresIn ?? 3600) * 1000,
            conditions: conditions as never,
            ...(opts?.contentType !== undefined
              ? { fields: { 'content-type': opts.contentType } }
              : {}),
          });
          return { method: 'POST', url: post.url, fields: post.fields };
        }
        const [url] = await file.getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + (opts?.expiresIn ?? 3600) * 1000,
          ...(opts?.contentType !== undefined
            ? { contentType: opts.contentType }
            : {}),
        });
        return { method: 'PUT', url };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const id = nextSnapshotId(bucketName);
        await createSibling(client, id);
        try {
          await copyAllFiles(client, bucketName, id);
          const snapImpl = impl(client, id);
          await writeManifest(
            snapImpl,
            emptyManifest({ location: bucketName, snapshotId: null })
          );

          const thisImpl = impl(client, bucketName);
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
          await destroySibling(client, id);
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        const thisImpl = impl(client, bucketName);
        return (await readManifest(thisImpl)).snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const thisImpl = impl(client, bucketName);
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
        const thisImpl = impl(client, bucketName);
        const meta = await readManifest(thisImpl);
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        await destroySibling(client, id);
        await writeManifest(thisImpl, meta);
      },

      get(id): ReadOnlyAdapter {
        const snapImpl = impl(client, id);
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
        await createSibling(client, opts.name);
        try {
          const source = opts.fromSnapshot ?? bucketName;
          await copyAllFiles(client, source, opts.name);
          const forkImpl = impl(client, opts.name);
          await writeManifest(
            forkImpl,
            emptyManifest({
              location: bucketName,
              snapshotId: opts.fromSnapshot ?? null,
            })
          );

          const thisImpl = impl(client, bucketName);
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
          await destroySibling(client, opts.name);
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        const thisImpl = impl(client, bucketName);
        return (await readManifest(thisImpl)).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const thisImpl = impl(client, bucketName);
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
        const thisImpl = impl(client, bucketName);
        const meta = await readManifest(thisImpl);
        meta.forks = meta.forks.filter((f) => f.name !== name);
        await destroySibling(client, name);
        await writeManifest(thisImpl, meta);
      },

      get(name): Adapter<GcsStorage> {
        return impl(client, name);
      },
    },
  };
}

async function createSibling(
  client: GcsStorage,
  name: string
): Promise<Bucket> {
  try {
    const [bucket] = await client.createBucket(name);
    return bucket;
  } catch (err) {
    throw asStorageError(err);
  }
}

async function destroySibling(client: GcsStorage, name: string): Promise<void> {
  try {
    const bucket = client.bucket(name);
    await bucket.deleteFiles({ force: true });
    await bucket.delete();
  } catch {
    /* swallow — best-effort */
  }
}

async function copyAllFiles(
  client: GcsStorage,
  fromBucket: string,
  toBucket: string
): Promise<void> {
  const src = client.bucket(fromBucket);
  const dst = client.bucket(toBucket);
  // Stream pages one at a time. `getFiles()` without `autoPaginate:
  // false` fetches every page into a single array before the copy
  // loop starts — fine for tests, bad for buckets with many objects.
  for await (const file of src.getFilesStream() as AsyncIterable<File>) {
    if (isInternalKey(file.name)) continue;
    await file.copy(dst.file(file.name));
  }
}
