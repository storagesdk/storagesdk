import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Adapter, ForkOptions } from '@storagesdk/core/adapter';
import { StorageError } from '@storagesdk/core/adapter';
import { asStorageError } from '../s3/errors.js';
import { s3 } from '../s3/s3.js';

export interface NeonConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Branch S3 endpoint URL (`AWS_ENDPOINT_URL_S3`), e.g.
   * `https://br-xxx.storage.c-2.us-east-2.aws.neon.tech`. Each branch has
   * its own endpoint; not the Console API URL.
   */
  endpoint: string;
  /** S3 access key (`AWS_ACCESS_KEY_ID`, the Neon credential `token_id`). */
  accessKeyId: string;
  /**
   * S3 secret access key (`AWS_SECRET_ACCESS_KEY`, the Neon credential
   * `s3_secret_access_key`).
   */
  secretAccessKey: string;
  /**
   * Region (`AWS_REGION`). Defaults to the region in the endpoint hostname,
   * or `us-east-2` when the endpoint doesn't name one.
   */
  region?: string;
}

// Branch endpoints look like `br-xxx.storage.c-2.us-east-2.aws.neon.tech`.
const ENDPOINT_REGION = /\.([a-z]{2}-[a-z]+-\d+)\.aws\.neon\.tech$/;

function regionFromEndpoint(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).hostname.match(ENDPOINT_REGION)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Adapter for [Neon Object Storage](https://neon.com/docs/storage/overview).
 *
 * Neon Object Storage is S3-compatible, so this adapter delegates to the S3
 * adapter with Neon-specific defaults:
 *  - `forcePathStyle: true` (required by Neon endpoints).
 *  - `requestChecksumCalculation: 'WHEN_REQUIRED'` (prevents the AWS SDK
 *    from embedding an empty-body checksum in presigned PUT URLs).
 *  - `region` taken from the endpoint hostname when omitted, falling back
 *    to `us-east-2`.
 */
export function neon(config: NeonConfig): Adapter<S3Client> {
  return withNeonForkGuard(
    s3({
      bucket: config.bucket,
      region:
        config.region ?? regionFromEndpoint(config.endpoint) ?? 'us-east-2',
      endpoint: config.endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  );
}

function withNeonForkGuard(adapter: Adapter<S3Client>): Adapter<S3Client> {
  return {
    ...adapter,
    forks: {
      ...adapter.forks,
      async create(opts: ForkOptions) {
        try {
          await adapter.raw.send(new HeadBucketCommand({ Bucket: opts.name }));
        } catch (error) {
          const mapped = asStorageError(error);
          if (mapped.code === 'NotFound') {
            return adapter.forks.create(opts);
          }
          throw mapped;
        }

        throw new StorageError({
          code: 'Conflict',
          message: `fork ${opts.name} already exists`,
        });
      },
      get(name) {
        return withNeonForkGuard(adapter.forks.get(name));
      },
    },
  };
}
