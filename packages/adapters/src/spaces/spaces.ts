import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface SpacesConfig {
  /** Bucket (Space) the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Datacenter — the part before `.digitaloceanspaces.com` in the
   * endpoint. Used only in the endpoint URL; the S3 SDK's signing
   * region is hard-coded `'us-east-1'` because Spaces rejects
   * datacenter-based signing on AWS SDK v3.
   *
   * Find yours in the DigitalOcean dashboard → **Spaces Object
   * Storage**.
   *
   * @example `'nyc3'`, `'ams3'`, `'sgp1'`, `'sfo3'`, `'fra1'`, `'syd1'`, `'blr1'`
   */
  region: string;
  /**
   * Spaces access key. Create at the DigitalOcean dashboard → **API**
   * → **Spaces Keys**.
   */
  accessKeyId: string;
  /** Spaces secret. Shown only once at creation. */
  secretAccessKey: string;
  /**
   * Override the endpoint URL. When unset, defaults to
   * `https://<region>.digitaloceanspaces.com`.
   */
  endpoint?: string;
}

/**
 * Adapter for [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces).
 *
 * DigitalOcean defaults the adapter sets for you:
 *  - Endpoint built from `region` (e.g. `nyc3` →
 *    `https://nyc3.digitaloceanspaces.com`); override with `endpoint`.
 *  - SigV4 signing region is hard-coded `'us-east-1'` — Spaces uses
 *    the datacenter only in the endpoint URL; passing it as the SDK's
 *    signing region trips `SignatureDoesNotMatch` on AWS SDK v3.
 *    Same shape as R2 hardcoding `'auto'`.
 *  - Virtual-hosted addressing (Spaces' default).
 */
export function spaces(config: SpacesConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: 'us-east-1',
    endpoint:
      config.endpoint ?? `https://${config.region}.digitaloceanspaces.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
