import {
  type _Error,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketTaggingCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutBucketTaggingCommand,
  PutObjectCommand,
  S3Client,
  type Tag,
  UploadPartCopyCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  type Adapter,
  type BodyInput,
  defineAdapter,
  emptyManifest,
  type ForkInfo,
  isInternalKey,
  type ListOptions,
  type ListResult,
  MANIFEST_PATH,
  type Manifest,
  nextSnapshotId,
  parseManifest,
  type ReadOnlyAdapter,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  serializeManifest,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
} from '@storagesdk/core/adapter';
import { asStorageError } from './errors.js';

export interface S3Config {
  /** Bucket the adapter operates on. */
  bucket: string;
  /** AWS region. Falls back to the SDK's default region resolution if omitted. */
  region?: string;
  /**
   * Static credentials. Omit to use the AWS SDK's default credential
   * provider chain (env vars, shared profile, EC2/ECS/EKS instance role,
   * SSO, etc.).
   */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  /** Override the S3 endpoint URL. Used for MinIO, R2, DigitalOcean Spaces, etc. */
  endpoint?: string;
  /** Force path-style addressing. Required by MinIO and most S3-compatible providers. */
  forcePathStyle?: boolean;
}

/**
 * Adapter for Amazon S3 and S3-compatible backends (MinIO, R2, DigitalOcean
 * Spaces, etc.). Internally constructs an `S3Client`; the underlying SDK is
 * not exposed in the public config. For advanced cases, the client is
 * available via `storage.raw`, typed as `S3Client` — no cast needed.
 */
// S3's hard limit on a single CopyObject is 5 GB. Above that the call fails
// and we fall back to multipart copy via UploadPartCopy. Hardcoded — not
// configurable, since the threshold tracks the AWS limit, not user preference.
const MULTIPART_COPY_THRESHOLD = 5 * 1000 * 1000 * 1000;

// AWS S3, MinIO, and most S3-compat providers honor these limits (50 tags
// per bucket; tag value up to 256 chars). The JSON manifest is base64-
// encoded (S3 rejects raw JSON chars like `{`, `,`, `"` in tag values),
// chunked into value-sized pieces, then stored under sortable tag keys
// (`storagesdk-manifest-NN`). Base64 inflates the payload by ~4/3 — net
// capacity is still ~9.6 KB of JSON per manifest, plenty for hundreds of
// snapshots/forks.
const MANIFEST_TAG_PREFIX = 'storagesdk-manifest-';
const MANIFEST_TAG_VALUE_MAX = 256;
const MANIFEST_TAG_COUNT_MAX = 50;

export function s3(config: S3Config): Adapter<S3Client> {
  const client = new S3Client({
    ...(config.region !== undefined ? { region: config.region } : {}),
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
    ...(config.forcePathStyle !== undefined
      ? { forcePathStyle: config.forcePathStyle }
      : {}),
    ...(config.credentials !== undefined
      ? { credentials: config.credentials }
      : {}),
  });

  const manifestStore = createManifestStore();
  return defineAdapter<S3Client>(impl(client, config.bucket, manifestStore));
}

function impl(
  client: S3Client,
  bucket: string,
  manifest: ManifestStore
): Adapter<S3Client> {
  return {
    name: 's3',
    raw: client,

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      const payload = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
      // The SDK's Storage class auto-decides multipart based on body size and
      // its multipartThreshold; by the time we get here, `opts.multipart` is
      // either true or false (or rarely undefined for direct adapter calls,
      // in which case we default to single PUT).
      const useMultipart = opts?.multipart === true;

      try {
        if (useMultipart) {
          const upload = new Upload({
            client,
            params: buildPutParams(bucket, key, payload, opts),
            ...(opts?.partSize !== undefined
              ? { partSize: opts.partSize }
              : {}),
            ...(opts?.concurrency !== undefined
              ? { queueSize: opts.concurrency }
              : {}),
          });
          if (opts?.onProgress) {
            const cb = opts.onProgress;
            upload.on('httpUploadProgress', (e) => {
              if (e.loaded !== undefined && e.total !== undefined) {
                cb({ loaded: e.loaded, total: e.total });
              }
            });
          }
          await upload.done();
          // Multipart bodies may be streams (size unknown upfront), so the
          // authoritative metadata is what S3 has now. One HEAD round-trip.
          return await headObject(client, bucket, key);
        }

        const out = await client.send(
          new PutObjectCommand(buildPutParams(bucket, key, payload, opts))
        );
        return {
          path: key,
          size: byteLength(payload),
          contentType: opts?.contentType ?? 'application/octet-stream',
          etag: stripQuotes(out.ETag ?? ''),
          lastModified: new Date(),
          ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async download(key): Promise<StorageItem> {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key })
        );
        if (!out.Body) {
          throw new StorageError({
            code: 'NotFound',
            message: `${key} has no body`,
          });
        }
        const body = await out.Body.transformToByteArray();
        return {
          path: key,
          size: out.ContentLength ?? body.byteLength,
          contentType: out.ContentType ?? 'application/octet-stream',
          etag: stripQuotes(out.ETag ?? ''),
          lastModified: out.LastModified ?? new Date(),
          body: new Uint8Array(body),
          ...(out.Metadata !== undefined && Object.keys(out.Metadata).length > 0
            ? { metadata: out.Metadata }
            : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    head(key): Promise<StorageItemMeta> {
      return headObject(client, bucket, key);
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      try {
        const out = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ...(opts?.prefix !== undefined ? { Prefix: opts.prefix } : {}),
            ...(opts?.limit !== undefined ? { MaxKeys: opts.limit } : {}),
            ...(opts?.cursor !== undefined
              ? { ContinuationToken: opts.cursor }
              : {}),
            ...(opts?.delimiter !== undefined
              ? { Delimiter: opts.delimiter }
              : {}),
          })
        );
        const items: StorageItemMeta[] = (out.Contents ?? [])
          // Manifest only appears in bucket-tag-unsupported fallback mode
          // where it's stored as an object; in tag mode this filter is a
          // no-op. Filtering here can leave a page short by one item in
          // fallback mode — accepted, since the backend doesn't support
          // the cleaner tags path.
          .filter((obj) => obj.Key !== undefined && !isInternalKey(obj.Key))
          .map((obj) => ({
            path: obj.Key ?? '',
            size: obj.Size ?? 0,
            // ListObjectsV2 doesn't return ContentType or user metadata; that
            // takes a HEAD per key. Consumers wanting full meta call head().
            contentType: 'application/octet-stream',
            etag: stripQuotes(obj.ETag ?? ''),
            lastModified: obj.LastModified ?? new Date(),
          }));
        const cursor = out.NextContinuationToken;
        return cursor !== undefined ? { items, cursor } : { items };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async delete(key): Promise<void> {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key })
        );
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async copy(from, to): Promise<void> {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: to,
            CopySource: copySource(bucket, from),
          })
        );
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async move(from, to): Promise<void> {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: to,
            CopySource: copySource(bucket, from),
          })
        );
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: from })
        );
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      try {
        const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
        return await getSignedUrl(client, cmd, {
          expiresIn: opts?.expiresIn ?? 3600,
        });
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async uploadUrl(key, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      try {
        const cmd = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ...(opts?.contentType !== undefined
            ? { ContentType: opts.contentType }
            : {}),
        });
        const url = await getSignedUrl(client, cmd, {
          expiresIn: opts?.expiresIn ?? 3600,
        });
        return { method: 'PUT', url };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    // Snapshots and forks both materialize as sibling buckets following the
    // Phase 2 convention. Bucket creation collisions surface as Conflict (the
    // SDK-generated snapshot id makes them effectively impossible in practice).
    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        const id = nextSnapshotId(bucket);
        await createSibling(client, id);
        try {
          await copyAllObjects(client, bucket, id, {
            onProgress: (e) => {
              opts?.onProgress?.({ scanned: e.copied, total: e.total });
            },
          });

          await manifest.write(
            client,
            id,
            emptyManifest({ location: bucket, snapshotId: null })
          );

          const meta = await manifest.read(client, bucket);
          const info: SnapshotInfo = {
            id,
            createdAt: new Date(),
            ...(opts?.name !== undefined ? { name: opts.name } : {}),
          };
          meta.snapshots.push(info);
          await manifest.write(client, bucket, meta);
          return info;
        } catch (err) {
          await destroySibling(client, id);
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        return (await manifest.read(client, bucket)).snapshots;
      },

      async head(id): Promise<SnapshotInfo> {
        const meta = await manifest.read(client, bucket);
        const found = meta.snapshots.find((s) => s.id === id);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return found;
      },

      async delete(id): Promise<void> {
        const meta = await manifest.read(client, bucket);
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        await deleteBucketIfPresent(client, id);
        await manifest.write(client, bucket, meta);
      },

      get(id): ReadOnlyAdapter {
        // Return a read-only view over the snapshot bucket. The contract
        // exposes only the four read methods to callers; nothing chmods the
        // bucket itself read-only.
        const snapImpl = impl(client, id, manifest);
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
        await createSibling(client, opts.name);
        try {
          await copyAllObjects(client, opts.fromSnapshot, opts.name, {
            onProgress: (e) => {
              opts.onProgress?.({ copied: e.copied, total: e.total });
            },
          });

          await manifest.write(
            client,
            opts.name,
            emptyManifest({
              location: bucket,
              snapshotId: opts.fromSnapshot,
            })
          );

          const meta = await manifest.read(client, bucket);
          const info: ForkInfo = {
            name: opts.name,
            fromSnapshot: opts.fromSnapshot,
            createdAt: new Date(),
          };
          meta.forks.push(info);
          await manifest.write(client, bucket, meta);
          return info;
        } catch (err) {
          await destroySibling(client, opts.name);
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        return (await manifest.read(client, bucket)).forks;
      },

      async head(name): Promise<ForkInfo> {
        const meta = await manifest.read(client, bucket);
        const found = meta.forks.find((f) => f.name === name);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return found;
      },

      async delete(name): Promise<void> {
        const meta = await manifest.read(client, bucket);
        meta.forks = meta.forks.filter((f) => f.name !== name);
        await deleteBucketIfPresent(client, name);
        await manifest.write(client, bucket, meta);
      },

      get(name): Adapter<S3Client> {
        // Returns a full read/write adapter rooted at the fork bucket. The
        // outer `defineAdapter` (in `s3()`) wraps the raw impl exactly once
        // via its recursive `forks.get`, so this stays single-wrapped.
        return impl(client, name, manifest);
      },
    },
  };
}

async function headObject(
  client: S3Client,
  bucket: string,
  key: string
): Promise<StorageItemMeta> {
  try {
    const out = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return {
      path: key,
      size: out.ContentLength ?? 0,
      contentType: out.ContentType ?? 'application/octet-stream',
      etag: stripQuotes(out.ETag ?? ''),
      lastModified: out.LastModified ?? new Date(),
      ...(out.Metadata !== undefined && Object.keys(out.Metadata).length > 0
        ? { metadata: out.Metadata }
        : {}),
    };
  } catch (err) {
    throw asStorageError(err);
  }
}

function buildPutParams(
  bucket: string,
  key: string,
  body: Exclude<BodyInput, ArrayBuffer>,
  opts: UploadOptions | undefined
) {
  return {
    Bucket: bucket,
    Key: key,
    Body: body,
    ...(opts?.contentType !== undefined
      ? { ContentType: opts.contentType }
      : {}),
    ...(opts?.metadata !== undefined ? { Metadata: opts.metadata } : {}),
  };
}

function byteLength(body: BodyInput): number {
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (typeof body === 'string')
    return new TextEncoder().encode(body).byteLength;
  if (body instanceof Blob) return body.size;
  return 0;
}

function stripQuotes(s: string): string {
  return s.replace(/^"|"$/g, '');
}

/**
 * Build a `CopySource` value for `CopyObjectCommand`: `<bucket>/<encoded-key>`.
 * AWS expects the key portion URL-encoded with `/` separators preserved —
 * `encodeURIComponent` alone would mangle nested keys like `photos/a.jpg` into
 * `photos%2Fa.jpg`, which S3-compatible providers (MinIO, R2, etc.) won't
 * uniformly forgive.
 */
function copySource(bucket: string, key: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${bucket}/${encodedKey}`;
}

/** CreateBucket via the S3 API. Surfaces `BucketAlreadyExists` as Conflict. */
async function createSibling(client: S3Client, name: string): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: name }));
  } catch (err) {
    throw asStorageError(err);
  }
}

/**
 * Best-effort cleanup after a failed snapshot/fork creation. Empties the
 * bucket and removes it so the user-facing name (forks) or the SDK-generated
 * id (snapshots) isn't left orphaned. Swallows secondary errors — the
 * original failure is what the caller cares about.
 */
async function destroySibling(client: S3Client, name: string): Promise<void> {
  try {
    await emptyBucket(client, name);
    await client.send(new DeleteBucketCommand({ Bucket: name }));
  } catch {
    // Intentionally swallowed: cleanup is best-effort. If it fails (e.g. the
    // bucket was already deleted, or permissions changed mid-flight), the
    // original error from the caller's try block is more informative.
  }
}

/**
 * Empty + delete a bucket, treating "already gone" as success so the caller
 * can proceed to update its parent manifest. Matches the FS adapter's
 * `rm -rf`-style tolerance — an externally removed sibling shouldn't be
 * able to wedge the manifest with a stale entry the SDK can never clear.
 */
async function deleteBucketIfPresent(
  client: S3Client,
  name: string
): Promise<void> {
  try {
    await emptyBucket(client, name);
    await client.send(new DeleteBucketCommand({ Bucket: name }));
  } catch (err) {
    const mapped = asStorageError(err);
    if (mapped.code === 'NotFound') return;
    throw mapped;
  }
}

const EMPTY_BUCKET_MAX_ATTEMPTS = 3;

/**
 * Empty a bucket so it can be deleted. Tries `ListObjectVersions` first to
 * cover Versioning-enabled buckets and delete markers; falls back to the
 * simple `ListObjectsV2` path if the backend doesn't support
 * `ListObjectVersions` (Cloudflare R2 returns NotImplemented). Both paths
 * batch deletions via `DeleteObjects` (up to 1000 per call).
 *
 * After each pass we verify with a 1-key `ListObjectsV2` — a partial
 * `DeleteObjects` failure or backend-side delete-marker insertion can leave
 * residue that the initial pagination loop missed. Retries up to
 * `EMPTY_BUCKET_MAX_ATTEMPTS` before giving up.
 */
async function emptyBucket(client: S3Client, bucket: string): Promise<void> {
  for (let attempt = 0; attempt < EMPTY_BUCKET_MAX_ATTEMPTS; attempt++) {
    await emptyBucketOnce(client, bucket);

    const check = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 })
    );
    if (!check.Contents || check.Contents.length === 0) return;
  }

  throw new StorageError({
    code: 'Provider',
    message: `bucket ${bucket} is still non-empty after ${EMPTY_BUCKET_MAX_ATTEMPTS} cleanup attempts`,
  });
}

async function emptyBucketOnce(
  client: S3Client,
  bucket: string
): Promise<void> {
  try {
    await emptyBucketVersioned(client, bucket);
  } catch (err) {
    if (isNotImplementedError(err)) {
      try {
        await emptyBucketSimple(client, bucket);
        return;
      } catch (fallbackErr) {
        throw asStorageError(fallbackErr);
      }
    }
    throw asStorageError(err);
  }
}

async function emptyBucketVersioned(
  client: S3Client,
  bucket: string
): Promise<void> {
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  while (true) {
    const res = await client.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        ...(keyMarker !== undefined ? { KeyMarker: keyMarker } : {}),
        ...(versionIdMarker !== undefined
          ? { VersionIdMarker: versionIdMarker }
          : {}),
      })
    );

    const toDelete: { Key: string; VersionId: string }[] = [];
    for (const v of res.Versions ?? []) {
      if (v.Key && v.VersionId) {
        toDelete.push({ Key: v.Key, VersionId: v.VersionId });
      }
    }
    for (const dm of res.DeleteMarkers ?? []) {
      if (dm.Key && dm.VersionId) {
        toDelete.push({ Key: dm.Key, VersionId: dm.VersionId });
      }
    }

    if (toDelete.length > 0) {
      const out = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: toDelete, Quiet: true },
        })
      );
      throwIfDeleteObjectsHasErrors(out.Errors);
    }

    if (!res.IsTruncated) return;
    keyMarker = res.NextKeyMarker;
    versionIdMarker = res.NextVersionIdMarker;
  }
}

async function emptyBucketSimple(
  client: S3Client,
  bucket: string
): Promise<void> {
  let token: string | undefined;
  while (true) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ...(token !== undefined ? { ContinuationToken: token } : {}),
      })
    );
    const toDelete: { Key: string }[] = [];
    for (const obj of res.Contents ?? []) {
      if (obj.Key) toDelete.push({ Key: obj.Key });
    }
    if (toDelete.length > 0) {
      const out = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: toDelete, Quiet: true },
        })
      );
      throwIfDeleteObjectsHasErrors(out.Errors);
    }
    if (!res.IsTruncated) return;
    token = res.NextContinuationToken;
  }
}

/**
 * S3's `DeleteObjects` returns 200 with a per-key `Errors` array even when
 * some objects fail (e.g. AccessDenied on one of N). Without checking it
 * we'd treat partial failures as success, leave the residue behind, and
 * later hit `BucketNotEmpty` on `DeleteBucket` with no signal of why.
 * Treat any error as a Provider failure with the first message for context.
 */
function throwIfDeleteObjectsHasErrors(errors: _Error[] | undefined): void {
  if (!errors || errors.length === 0) return;
  const first = errors[0];
  throw new StorageError({
    code: 'Provider',
    message:
      `DeleteObjects failed for ${errors.length} key(s); first: ` +
      `${first?.Key ?? '?'} (${first?.Code ?? '?'}): ${first?.Message ?? '?'}`,
  });
}

function isNotImplementedError(err: unknown): boolean {
  const aws = err as
    | { name?: string; $metadata?: { httpStatusCode?: number } }
    | null
    | undefined;
  return (
    aws?.name === 'NotImplemented' || aws?.$metadata?.httpStatusCode === 501
  );
}

interface CopyAllObjectsOptions {
  onProgress?: (e: { copied: number; total: number }) => void;
  concurrency?: number;
}

/**
 * Copy every object from one bucket to another. Single `CopyObject` for
 * objects up to S3's 5 GB single-copy limit; multipart copy
 * (`UploadPartCopy`) for anything larger. Object-level parallelism with a
 * configurable concurrency cap (default 4); parts within a multipart copy
 * are uploaded serially (TODO: parallelize parts if real-world testing
 * shows benefit).
 */
async function copyAllObjects(
  client: S3Client,
  fromBucket: string,
  toBucket: string,
  opts: CopyAllObjectsOptions = {}
): Promise<void> {
  const objects: { key: string; size: number }[] = [];
  let token: string | undefined;
  try {
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: fromBucket,
          ...(token !== undefined ? { ContinuationToken: token } : {}),
        })
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key !== undefined && obj.Size !== undefined) {
          // Skip the SDK's internal manifest — the caller writes a fresh one
          // for the snapshot/fork right after this copy completes. Copying
          // the parent's would just be overwritten and briefly mislead readers.
          if (isInternalKey(obj.Key)) continue;
          objects.push({ key: obj.Key, size: obj.Size });
        }
      }
      token = res.NextContinuationToken;
    } while (token);
  } catch (err) {
    throw asStorageError(err);
  }

  const concurrency = opts.concurrency ?? 4;
  const total = objects.length;
  let copied = 0;
  const queue = [...objects];
  // Workers record the first failure in a shared slot and bail instead of
  // throwing. We also abort the shared AbortController so any in-flight S3
  // calls on sibling workers terminate immediately rather than running to
  // completion — without that, the caller's cleanup (`destroySibling`) could
  // race against copies still landing objects in the destination bucket.
  let firstError: unknown;
  const abort = new AbortController();

  async function worker(): Promise<void> {
    while (queue.length > 0 && firstError === undefined) {
      const obj = queue.shift();
      if (obj === undefined) return;
      try {
        if (obj.size > MULTIPART_COPY_THRESHOLD) {
          await multipartCopy(
            client,
            fromBucket,
            toBucket,
            obj.key,
            obj.size,
            abort.signal
          );
        } else {
          await client.send(
            new CopyObjectCommand({
              Bucket: toBucket,
              Key: obj.key,
              CopySource: copySource(fromBucket, obj.key),
            }),
            { abortSignal: abort.signal }
          );
        }
      } catch (err) {
        if (firstError === undefined) {
          firstError = err;
          abort.abort();
        }
        return;
      }
      copied++;
      opts.onProgress?.({ copied, total });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );

  if (firstError !== undefined) {
    throw asStorageError(firstError);
  }
}

/**
 * Copy a single object via multipart copy. Splits the source object into
 * 5 GB parts (the AWS single-copy limit) and uploads each via
 * `UploadPartCopy`. Parts are uploaded serially — adapter-level parallelism
 * is at the object level (see `copyAllObjects`). The optional `abortSignal`
 * cancels in-flight part copies when a sibling worker fails.
 */
async function multipartCopy(
  client: S3Client,
  fromBucket: string,
  toBucket: string,
  key: string,
  size: number,
  abortSignal?: AbortSignal
): Promise<void> {
  const partSize = MULTIPART_COPY_THRESHOLD;
  const numParts = Math.ceil(size / partSize);
  const sendOpts = abortSignal !== undefined ? { abortSignal } : {};
  const init = await client.send(
    new CreateMultipartUploadCommand({ Bucket: toBucket, Key: key }),
    sendOpts
  );
  const uploadId = init.UploadId;
  if (!uploadId) {
    throw new StorageError({
      code: 'Provider',
      message: 'CreateMultipartUpload did not return an UploadId',
    });
  }

  try {
    const parts: { PartNumber: number; ETag: string }[] = [];
    for (let i = 0; i < numParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize - 1, size - 1);
      const res = await client.send(
        new UploadPartCopyCommand({
          Bucket: toBucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: i + 1,
          CopySource: copySource(fromBucket, key),
          CopySourceRange: `bytes=${start}-${end}`,
        }),
        sendOpts
      );
      const etag = res.CopyPartResult?.ETag;
      if (!etag) {
        throw new StorageError({
          code: 'Provider',
          message: 'UploadPartCopy did not return an ETag',
        });
      }
      parts.push({ PartNumber: i + 1, ETag: etag });
    }

    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: toBucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
      sendOpts
    );
  } catch (err) {
    // Abort to free server-side resources. Intentionally *not* passing
    // `abortSignal` — if the caller aborted, we still need this cleanup
    // call to actually run. Swallow secondary errors so we don't mask the
    // original failure.
    await client
      .send(
        new AbortMultipartUploadCommand({
          Bucket: toBucket,
          Key: key,
          UploadId: uploadId,
        })
      )
      .catch(() => {});
    throw err;
  }
}

interface ManifestStore {
  read(client: S3Client, bucket: string): Promise<Manifest>;
  write(client: S3Client, bucket: string, manifest: Manifest): Promise<void>;
}

/**
 * Per-adapter manifest store. Tries to keep the manifest in S3 bucket tags
 * (invisible to `ListObjectsV2`, so `list({ limit })` returns exact N items).
 * If the backend doesn't support bucket tagging (e.g. Cloudflare R2 currently
 * returns `NotImplemented` / 501), falls back to storing the manifest as a
 * regular object at `MANIFEST_PATH` and remembers the mode for subsequent
 * calls. In fallback mode `list()` filters the manifest from results, which
 * may produce N-1 items on the page that contains it — accepted as the
 * unavoidable price of S3 server-side pagination on backends without tags.
 *
 * The mode is per-adapter-instance: the cap is detected once on the first
 * tag-op error and reused for every bucket the adapter touches (main bucket
 * + every sibling snapshot/fork bucket on the same endpoint).
 */
function createManifestStore(): ManifestStore {
  let mode: 'unknown' | 'tags' | 'object' = 'unknown';

  return {
    async read(client, bucket) {
      if (mode !== 'object') {
        try {
          const m = await readFromTags(client, bucket);
          mode = 'tags';
          return m;
        } catch (err) {
          if (!isTagsUnsupportedError(err)) throw asStorageError(err);
          mode = 'object';
        }
      }
      return readFromObject(client, bucket);
    },

    async write(client, bucket, m) {
      if (mode !== 'object') {
        try {
          await writeToTags(client, bucket, m);
          mode = 'tags';
          return;
        } catch (err) {
          if (!isTagsUnsupportedError(err)) throw asStorageError(err);
          mode = 'object';
        }
      }
      await writeToObject(client, bucket, m);
    },
  };
}

async function readFromTags(
  client: S3Client,
  bucket: string
): Promise<Manifest> {
  let tagSet: Tag[];
  try {
    const res = await client.send(
      new GetBucketTaggingCommand({ Bucket: bucket })
    );
    tagSet = res.TagSet ?? [];
  } catch (err) {
    // S3 returns NoSuchTagSet when no tags are set yet — that's "no manifest
    // written," not an error. Pass anything else through so the caller can
    // decide whether to fall back to object storage.
    if ((err as { name?: string } | null)?.name === 'NoSuchTagSet') {
      return emptyManifest();
    }
    throw err;
  }

  const ours = tagSet
    .filter((t) => (t.Key ?? '').startsWith(MANIFEST_TAG_PREFIX))
    .sort((a, b) => (a.Key ?? '').localeCompare(b.Key ?? ''));
  if (ours.length === 0) return emptyManifest();

  const b64 = ours.map((t) => t.Value ?? '').join('');
  const json = Buffer.from(b64, 'base64').toString('utf-8');
  return parseManifest(json);
}

async function writeToTags(
  client: S3Client,
  bucket: string,
  m: Manifest
): Promise<void> {
  // Preserve any user-set tags on the bucket — PutBucketTagging is a full
  // replacement, so we round-trip the existing set and merge.
  let existing: Tag[] = [];
  try {
    const res = await client.send(
      new GetBucketTaggingCommand({ Bucket: bucket })
    );
    existing = res.TagSet ?? [];
  } catch (err) {
    if ((err as { name?: string } | null)?.name !== 'NoSuchTagSet') throw err;
  }
  const userTags = existing.filter(
    (t) => !(t.Key ?? '').startsWith(MANIFEST_TAG_PREFIX)
  );

  const json = serializeManifest(m);
  const b64 = Buffer.from(json, 'utf-8').toString('base64');
  const chunks: Tag[] = [];
  for (let i = 0; i < b64.length; i += MANIFEST_TAG_VALUE_MAX) {
    const idx = chunks.length.toString().padStart(2, '0');
    chunks.push({
      Key: `${MANIFEST_TAG_PREFIX}${idx}`,
      Value: b64.slice(i, i + MANIFEST_TAG_VALUE_MAX),
    });
  }

  const total = userTags.length + chunks.length;
  if (total > MANIFEST_TAG_COUNT_MAX) {
    throw new StorageError({
      code: 'NotSupported',
      message:
        `manifest does not fit in S3 bucket-tag capacity (${chunks.length} ` +
        `manifest tags + ${userTags.length} user tags > ${MANIFEST_TAG_COUNT_MAX})`,
    });
  }

  await client.send(
    new PutBucketTaggingCommand({
      Bucket: bucket,
      Tagging: { TagSet: [...userTags, ...chunks] },
    })
  );
}

async function readFromObject(
  client: S3Client,
  bucket: string
): Promise<Manifest> {
  try {
    const out = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: MANIFEST_PATH })
    );
    if (!out.Body) return emptyManifest();
    const text = await out.Body.transformToString();
    return parseManifest(text);
  } catch (err) {
    const mapped = asStorageError(err);
    if (mapped.code === 'NotFound') return emptyManifest();
    throw mapped;
  }
}

async function writeToObject(
  client: S3Client,
  bucket: string,
  m: Manifest
): Promise<void> {
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: MANIFEST_PATH,
        Body: serializeManifest(m),
        ContentType: 'application/json',
      })
    );
  } catch (err) {
    throw asStorageError(err);
  }
}

/**
 * Heuristic: did the backend reject the bucket-tagging call because it
 * doesn't support the API? AWS S3, MinIO, and tag-capable providers don't
 * return these; R2 and similar gap-fillers tend to return `NotImplemented`
 * (501) or `MethodNotAllowed` (405) for unsupported bucket-level APIs.
 */
function isTagsUnsupportedError(err: unknown): boolean {
  if (isNotImplementedError(err)) return true;
  const aws = err as
    | { name?: string; $metadata?: { httpStatusCode?: number } }
    | null
    | undefined;
  return (
    aws?.name === 'MethodNotAllowed' || aws?.$metadata?.httpStatusCode === 405
  );
}
