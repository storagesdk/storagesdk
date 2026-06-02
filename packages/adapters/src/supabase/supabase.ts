import type { S3Client } from '@aws-sdk/client-s3';
import type { Adapter } from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

export interface SupabaseConfig {
  /** Bucket the adapter operates on (must already exist). */
  bucket: string;
  /**
   * Your Supabase project ref — the subdomain prefix in your project
   * URL (`https://<projectRef>.supabase.co`). Find it in the Supabase
   * dashboard → **Project Settings** → **API**.
   */
  projectRef: string;
  /**
   * S3 access key. Create at the Supabase dashboard → **Project
   * Settings** → **Storage** → **S3 Connection** → **Generate new
   * credentials**.
   */
  accessKeyId: string;
  /** S3 secret. Shown only once at creation. */
  secretAccessKey: string;
  /**
   * Region. Supabase Storage's S3-compatible endpoint ignores it but
   * the AWS SDK requires a value. Defaults to `'us-east-1'`.
   */
  region?: string;
  /**
   * Override the endpoint URL. When unset, defaults to
   * `https://<projectRef>.supabase.co/storage/v1/s3`.
   */
  endpoint?: string;
}

/**
 * Adapter for [Supabase Storage](https://supabase.com/storage) via its
 * S3-compatible endpoint.
 *
 * Supabase defaults the adapter sets for you:
 *  - Endpoint built from `projectRef`
 *    (`https://<projectRef>.supabase.co/storage/v1/s3`); override with
 *    `endpoint`.
 *  - `region: 'us-east-1'` (Supabase ignores it but the AWS SDK
 *    requires a value).
 *  - `forcePathStyle: true` (required by Supabase's S3 endpoint).
 */
export function supabase(config: SupabaseConfig): Adapter<S3Client> {
  return s3({
    bucket: config.bucket,
    region: config.region ?? 'us-east-1',
    endpoint:
      config.endpoint ??
      `https://${config.projectRef}.supabase.co/storage/v1/s3`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
