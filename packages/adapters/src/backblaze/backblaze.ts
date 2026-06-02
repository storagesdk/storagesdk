import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface BackblazeConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Region — the part after `s3.` in the S3 endpoint. Find yours in the
   * Backblaze console → Buckets → your bucket → "Endpoint".
   *
   * @example `'us-west-001'`, `'us-west-002'`, `'us-west-004'`, `'eu-central-003'`
   */
  region: string;
  /**
   * Application Key ID (S3-compatible `accessKeyId`). Create at
   * Backblaze console → Application Keys → Add a New Application Key.
   * Scope the key to the bucket(s) you intend to use.
   */
  accessKeyId: string;
  /**
   * Application Key (S3-compatible `secretAccessKey`). Shown only once
   * at creation — store it securely.
   */
  secretAccessKey: string;
  /**
   * Override the endpoint URL. When unset, defaults to
   * `https://s3.<region>.backblazeb2.com`.
   */
  endpoint?: string;
}

/**
 * Adapter for [Backblaze B2 Cloud Storage](https://www.backblaze.com/b2/cloud-storage.html).
 *
 * Backblaze defaults the adapter sets for you:
 *  - Endpoint built from `region` (e.g. `us-west-004` →
 *    `https://s3.us-west-004.backblazeb2.com`); override with
 *    `endpoint`.
 *  - Virtual-hosted addressing (Backblaze's S3-compatible default).
 */
export function backblaze(config: BackblazeConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint ?? `https://s3.${config.region}.backblazeb2.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
