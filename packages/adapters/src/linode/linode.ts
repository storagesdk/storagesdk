import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface LinodeConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Region — the cluster name in the Linode endpoint. Find yours in
   * Linode Cloud Manager → **Object Storage** → your bucket.
   *
   * @example `'us-east-1'`, `'us-southeast-1'`, `'eu-central-1'`,
   * `'ap-south-1'`, `'us-iad-1'`, `'us-ord-1'`, `'fr-par-1'`,
   * `'gb-lon-1'`, `'in-maa-1'`, `'jp-osa-1'`, `'nl-ams-1'`,
   * `'se-sto-1'`, `'sg-sin-1'`, `'us-lax-1'`, `'us-mia-1'`,
   * `'us-sea-1'`
   */
  region: string;
  /**
   * Object Storage access key. Create at the Linode Cloud Manager →
   * **Object Storage** → **Access Keys**.
   */
  accessKeyId: string;
  /** Object Storage secret. Shown only once at creation. */
  secretAccessKey: string;
  /**
   * Override the endpoint URL. When unset, defaults to
   * `https://<region>.linodeobjects.com`.
   */
  endpoint?: string;
}

/**
 * Adapter for [Linode Object Storage](https://www.linode.com/products/object-storage).
 *
 * Linode defaults the adapter sets for you:
 *  - Endpoint built from `region` (e.g. `us-east-1` →
 *    `https://us-east-1.linodeobjects.com`); override with `endpoint`.
 *  - Virtual-hosted addressing (Linode's default).
 */
export function linode(config: LinodeConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint ?? `https://${config.region}.linodeobjects.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
