import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface NeonConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Branch S3 endpoint URL. Get it from the Neon Console or API:
   * `https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/storage`.
   */
  endpoint: string;
  /** S3 access key (Neon credential `token_id`). */
  accessKeyId: string;
  /** S3 secret access key (Neon credential `s3_secret_access_key`). */
  secretAccessKey: string;
  /**
   * Region. Defaults to `us-east-2`, the only region where Neon Object
   * Storage is available during the beta.
   */
  region?: string;
}

/**
 * Adapter for [Neon Object Storage](https://neon.com/docs/storage/overview).
 *
 * Neon Object Storage is S3-compatible, so this adapter delegates to the S3
 * adapter with Neon-specific defaults:
 *  - `forcePathStyle: true` (required by Neon endpoints).
 *  - `requestChecksumCalculation: 'WHEN_REQUIRED'` (prevents the AWS SDK
 *    from embedding an empty-body checksum in presigned PUT URLs).
 *  - `region: 'us-east-2'` when omitted.
 */
export function neon(config: NeonConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: config.region ?? 'us-east-2',
    endpoint: config.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
