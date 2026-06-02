import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface WasabiConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Region — the part after `s3.` in the Wasabi endpoint. Find yours
   * in the Wasabi console → Buckets → your bucket → "Properties".
   *
   * @example `'us-east-1'`, `'us-east-2'`, `'us-west-1'`, `'eu-central-1'`,
   * `'eu-central-2'`, `'ap-northeast-1'`, `'ap-northeast-2'`,
   * `'ca-central-1'`
   */
  region: string;
  /**
   * Wasabi access key. Create at the Wasabi console → **Access Keys**.
   */
  accessKeyId: string;
  /** Wasabi secret. Shown only once at creation. */
  secretAccessKey: string;
  /**
   * Override the endpoint URL. When unset, defaults to
   * `https://s3.<region>.wasabisys.com`.
   */
  endpoint?: string;
}

/**
 * Adapter for [Wasabi Hot Cloud Storage](https://wasabi.com/cloud-storage).
 *
 * Wasabi defaults the adapter sets for you:
 *  - Endpoint built from `region` (e.g. `us-east-1` →
 *    `https://s3.us-east-1.wasabisys.com`); override with `endpoint`.
 *  - Virtual-hosted addressing (Wasabi's default).
 */
export function wasabi(config: WasabiConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint ?? `https://s3.${config.region}.wasabisys.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
