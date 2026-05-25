import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface MinioConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * MinIO endpoint URL — required. No default since MinIO is typically
   * self-hosted at an organization-specific address.
   *
   * @example `http://localhost:9000`, `https://minio.internal.example`
   */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Region. MinIO ignores it but the AWS SDK requires a value. Defaults to
   * `'us-east-1'`.
   */
  region?: string;
  /**
   * Path-style addressing. MinIO requires it; defaults to `true`. Set
   * `false` only if your MinIO deployment is fronted by a virtual-hosted
   * reverse proxy.
   */
  forcePathStyle?: boolean;
}

/**
 * Adapter for [MinIO](https://min.io/).
 *
 * MinIO defaults the adapter sets for you:
 *  - `forcePathStyle: true` (MinIO's requirement).
 *  - `region: 'us-east-1'` (MinIO ignores it but the AWS SDK requires a
 *    value).
 */
export function minio(config: MinioConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: config.region ?? 'us-east-1',
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
