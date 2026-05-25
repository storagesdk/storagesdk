import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface R2Config {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Cloudflare account ID. The default R2 endpoint is built from this:
   * `https://<accountId>.r2.cloudflarestorage.com`. Find it in the
   * Cloudflare dashboard → R2 → "API" panel.
   */
  accountId: string;
  /**
   * R2 access key. Create at the Cloudflare dashboard → R2 → "Manage R2
   * API Tokens". Scope to the bucket(s) you intend to use.
   */
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Override the endpoint URL — useful for jurisdiction-specific endpoints
   * (`eu`, `fedramp-high`, etc.). When set, `accountId` is ignored.
   *
   * @example
   * `https://<accountId>.eu.r2.cloudflarestorage.com`
   */
  endpoint?: string;
}

/**
 * Adapter for Cloudflare R2.
 *
 * R2 defaults the adapter sets for you:
 *  - `region: 'auto'` (R2 ignores it but the AWS SDK requires a value).
 *  - Endpoint built from `accountId`; override with `endpoint` to target a
 *    different jurisdiction (`eu`, `fedramp-high`).
 *  - Virtual-hosted addressing.
 *
 * R2 doesn't support bucket tagging, so snapshot and fork lineage is
 * stored as a `.storagesdk.metadata.json` object at the bucket root.
 */
export function r2(config: R2Config): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    // R2 ignores region but the S3 SDK requires a value; Cloudflare's docs
    // tell you to use `'auto'`.
    region: 'auto',
    endpoint:
      config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
