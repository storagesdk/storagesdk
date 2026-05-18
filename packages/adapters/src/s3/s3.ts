import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
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
  type ListOptions,
  type ListResult,
  nextSnapshotId,
  type ReadOnlyAdapter,
  readManifest,
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

  return defineAdapter<S3Client>(impl(client, config.bucket));
}

function impl(client: S3Client, bucket: string): Adapter<S3Client> {
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
        const items: StorageItemMeta[] = (out.Contents ?? []).map((obj) => ({
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
        await copyAllObjects(client, bucket, id, {
          onProgress: (e) => {
            opts?.onProgress?.({ scanned: e.copied, total: e.total });
          },
        });

        // Write the snapshot's own manifest (overwriting whatever the copy
        // brought across from the parent).
        await writeManifest(
          impl(client, id),
          emptyManifest({ location: bucket, snapshotId: null })
        );

        // Append to the parent's manifest.
        const self = impl(client, bucket);
        const meta = await readManifest(self);
        const info: SnapshotInfo = {
          id,
          createdAt: new Date(),
          ...(opts?.name !== undefined ? { name: opts.name } : {}),
        };
        meta.snapshots.push(info);
        await writeManifest(self, meta);
        return info;
      },

      async list(): Promise<SnapshotInfo[]> {
        return (await readManifest(impl(client, bucket))).snapshots;
      },

      async head(id): Promise<SnapshotInfo> {
        const meta = await readManifest(impl(client, bucket));
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
        const self = impl(client, bucket);
        const meta = await readManifest(self);
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        await emptyBucket(client, id);
        try {
          await client.send(new DeleteBucketCommand({ Bucket: id }));
        } catch (err) {
          throw asStorageError(err);
        }
        await writeManifest(self, meta);
      },

      get(id): ReadOnlyAdapter {
        // Return a read-only view over the snapshot bucket. The contract
        // exposes only the four read methods to callers; nothing chmods the
        // bucket itself read-only.
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
        await createSibling(client, opts.name);
        await copyAllObjects(client, opts.fromSnapshot, opts.name, {
          onProgress: (e) => {
            opts.onProgress?.({ copied: e.copied, total: e.total });
          },
        });

        await writeManifest(
          impl(client, opts.name),
          emptyManifest({
            location: bucket,
            snapshotId: opts.fromSnapshot,
          })
        );

        const self = impl(client, bucket);
        const meta = await readManifest(self);
        const info: ForkInfo = {
          name: opts.name,
          fromSnapshot: opts.fromSnapshot,
          createdAt: new Date(),
        };
        meta.forks.push(info);
        await writeManifest(self, meta);
        return info;
      },

      async list(): Promise<ForkInfo[]> {
        return (await readManifest(impl(client, bucket))).forks;
      },

      async head(name): Promise<ForkInfo> {
        const meta = await readManifest(impl(client, bucket));
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
        const self = impl(client, bucket);
        const meta = await readManifest(self);
        meta.forks = meta.forks.filter((f) => f.name !== name);
        await emptyBucket(client, name);
        try {
          await client.send(new DeleteBucketCommand({ Bucket: name }));
        } catch (err) {
          throw asStorageError(err);
        }
        await writeManifest(self, meta);
      },

      get(name): Adapter<S3Client> {
        // Returns a full read/write adapter rooted at the fork bucket. The
        // outer `defineAdapter` (in `s3()`) wraps the raw impl exactly once
        // via its recursive `forks.get`, so this stays single-wrapped.
        return impl(client, name);
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
 * Empty a bucket so it can be deleted. Tries `ListObjectVersions` first to
 * cover Versioning-enabled buckets and delete markers; falls back to the
 * simple `ListObjectsV2` path if the backend doesn't support
 * `ListObjectVersions` (Cloudflare R2 returns NotImplemented). Both paths
 * batch deletions via `DeleteObjects` (up to 1000 per call).
 */
async function emptyBucket(client: S3Client, bucket: string): Promise<void> {
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
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: toDelete, Quiet: true },
        })
      );
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
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: toDelete, Quiet: true },
        })
      );
    }
    if (!res.IsTruncated) return;
    token = res.NextContinuationToken;
  }
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
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: fromBucket,
        ...(token !== undefined ? { ContinuationToken: token } : {}),
      })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key !== undefined && obj.Size !== undefined) {
        objects.push({ key: obj.Key, size: obj.Size });
      }
    }
    token = res.NextContinuationToken;
  } while (token);

  const concurrency = opts.concurrency ?? 4;
  const total = objects.length;
  let copied = 0;
  const queue = [...objects];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const obj = queue.shift();
      if (obj === undefined) return;
      try {
        if (obj.size > MULTIPART_COPY_THRESHOLD) {
          await multipartCopy(client, fromBucket, toBucket, obj.key, obj.size);
        } else {
          await client.send(
            new CopyObjectCommand({
              Bucket: toBucket,
              Key: obj.key,
              CopySource: copySource(fromBucket, obj.key),
            })
          );
        }
      } catch (err) {
        throw asStorageError(err);
      }
      copied++;
      opts.onProgress?.({ copied, total });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );
}

/**
 * Copy a single object via multipart copy. Splits the source object into
 * 5 GB parts (the AWS single-copy limit) and uploads each via
 * `UploadPartCopy`. Parts are uploaded serially — adapter-level parallelism
 * is at the object level (see `copyAllObjects`).
 */
async function multipartCopy(
  client: S3Client,
  fromBucket: string,
  toBucket: string,
  key: string,
  size: number
): Promise<void> {
  const partSize = MULTIPART_COPY_THRESHOLD;
  const numParts = Math.ceil(size / partSize);
  const init = await client.send(
    new CreateMultipartUploadCommand({ Bucket: toBucket, Key: key })
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
        })
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
      })
    );
  } catch (err) {
    // Abort to free server-side resources; swallow any abort error so we
    // don't mask the original failure.
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
