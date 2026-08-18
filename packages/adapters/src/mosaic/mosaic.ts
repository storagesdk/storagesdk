import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface MosaicConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Access key id. Shown when you create an API key at
   * [storage.mosaicos.com](https://storage.mosaicos.com), and available
   * afterwards from `POST /v1/api-keys/<id>/sigv4`.
   */
  accessKeyId: string;
  /** Secret for that access key. */
  secretAccessKey: string;
  /**
   * Region. Mosaic places data itself and ignores the value, but the AWS
   * SDK requires one. Defaults to `'auto'`.
   */
  region?: string;
  /**
   * Override the endpoint URL. When unset, defaults to
   * `https://storage.mosaicos.com`.
   */
  endpoint?: string;
}

/**
 * Adapter for [Mosaic Object Storage](https://storage.mosaicos.com).
 *
 * Mosaic defaults the adapter sets for you:
 *  - `endpoint: 'https://storage.mosaicos.com'`.
 *  - `region: 'auto'` (Mosaic ignores it; the AWS SDK requires a value).
 *  - `forcePathStyle: true` (Mosaic addresses buckets by path).
 */
export function mosaic(config: MosaicConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: config.region ?? 'auto',
    endpoint: config.endpoint ?? 'https://storage.mosaicos.com',
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
