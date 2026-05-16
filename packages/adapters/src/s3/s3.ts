import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  type Adapter,
  type BodyInput,
  defineAdapter,
  type ListOptions,
  type ListResult,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
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

    // Snapshots and forks are deferred to a follow-up PR. The contract
    // requires both, so we surface NotSupported explicitly until then.
    // Async methods reject the returned promise; `get` (sync) throws.
    snapshots: {
      create: async () => {
        throw notSupportedError('snapshots.create');
      },
      list: async () => {
        throw notSupportedError('snapshots.list');
      },
      head: async () => {
        throw notSupportedError('snapshots.head');
      },
      delete: async () => {
        throw notSupportedError('snapshots.delete');
      },
      get: () => {
        throw notSupportedError('snapshots.get');
      },
    },
    forks: {
      create: async () => {
        throw notSupportedError('forks.create');
      },
      list: async () => {
        throw notSupportedError('forks.list');
      },
      head: async () => {
        throw notSupportedError('forks.head');
      },
      delete: async () => {
        throw notSupportedError('forks.delete');
      },
      get: () => {
        throw notSupportedError('forks.get');
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

function notSupportedError(op: string): StorageError {
  return new StorageError({
    code: 'NotSupported',
    message: `${op} is not implemented for the S3 adapter yet`,
  });
}
