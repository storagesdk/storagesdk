import * as os from 'node:os';
import * as path from 'node:path';
import { azure } from '@storagesdk/adapters/azure';
import { fs } from '@storagesdk/adapters/fs';
import { gcs } from '@storagesdk/adapters/gcs';
import { minio } from '@storagesdk/adapters/minio';
import { r2 } from '@storagesdk/adapters/r2';
import { s3 } from '@storagesdk/adapters/s3';
import { tigris } from '@storagesdk/adapters/tigris';
import { vercel } from '@storagesdk/adapters/vercel';
import type { Adapter } from '@storagesdk/core/adapter';

/**
 * Pick a storage adapter for an example based on `EXAMPLE_ADAPTER`
 * (defaults to `fs` — works with zero config). Each example imports this
 * so the same feature demo can run against any backend by changing env
 * vars only.
 *
 * Env vars (single namespaced scheme):
 *   EXAMPLE_ADAPTER          fs | s3 | r2 | minio | tigris | azure | gcs | vercel (default: fs)
 *   EXAMPLE_BUCKET           required for every non-fs adapter
 *   EXAMPLE_ENDPOINT         required for minio; optional for s3, tigris, azure
 *   EXAMPLE_REGION           optional for s3, minio
 *   EXAMPLE_ACCESS_KEY_ID    required for s3, r2, minio, tigris
 *   EXAMPLE_SECRET_ACCESS_KEY required for s3, r2, minio, tigris
 *   EXAMPLE_FORCE_PATH_STYLE 'true' to force path-style addressing (s3, tigris)
 *   EXAMPLE_ACCOUNT_ID       required for r2 (Cloudflare account id)
 *   EXAMPLE_ACCOUNT_NAME     required for azure (Azure storage account name)
 *   EXAMPLE_ACCOUNT_KEY      required for azure (account access key)
 *   EXAMPLE_PROJECT_ID       required for gcs (GCP project id)
 *   EXAMPLE_KEY_FILENAME     path to GCP service-account JSON key (gcs)
 *   EXAMPLE_TOKEN            Vercel Blob read-write token (vercel; falls back
 *                            to BLOB_READ_WRITE_TOKEN env var on Vercel runtimes)
 */
export function getAdapter(): Adapter {
  const choice = (process.env.EXAMPLE_ADAPTER ?? 'fs').toLowerCase();
  if (choice === 'fs') {
    const root = path.join(os.tmpdir(), `storagesdk-example-${Date.now()}`);
    return fs({ root, folder: 'demo' });
  }
  if (choice === 's3') {
    const bucket = process.env.EXAMPLE_BUCKET;
    const accessKeyId = process.env.EXAMPLE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.EXAMPLE_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'EXAMPLE_BUCKET, EXAMPLE_ACCESS_KEY_ID, and EXAMPLE_SECRET_ACCESS_KEY are required for EXAMPLE_ADAPTER=s3'
      );
    }
    return s3({
      bucket,
      credentials: { accessKeyId, secretAccessKey },
      endpoint: process.env.EXAMPLE_ENDPOINT,
      region: process.env.EXAMPLE_REGION,
      forcePathStyle: process.env.EXAMPLE_FORCE_PATH_STYLE === 'true',
    });
  }
  if (choice === 'r2') {
    const bucket = process.env.EXAMPLE_BUCKET;
    const accountId = process.env.EXAMPLE_ACCOUNT_ID;
    const accessKeyId = process.env.EXAMPLE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.EXAMPLE_SECRET_ACCESS_KEY;
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'EXAMPLE_BUCKET, EXAMPLE_ACCOUNT_ID, EXAMPLE_ACCESS_KEY_ID, and EXAMPLE_SECRET_ACCESS_KEY are required for EXAMPLE_ADAPTER=r2'
      );
    }
    return r2({
      bucket,
      accountId,
      accessKeyId,
      secretAccessKey,
      ...(process.env.EXAMPLE_ENDPOINT !== undefined
        ? { endpoint: process.env.EXAMPLE_ENDPOINT }
        : {}),
    });
  }
  if (choice === 'minio') {
    const bucket = process.env.EXAMPLE_BUCKET;
    const endpoint = process.env.EXAMPLE_ENDPOINT;
    const accessKeyId = process.env.EXAMPLE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.EXAMPLE_SECRET_ACCESS_KEY;
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'EXAMPLE_BUCKET, EXAMPLE_ENDPOINT, EXAMPLE_ACCESS_KEY_ID, and EXAMPLE_SECRET_ACCESS_KEY are required for EXAMPLE_ADAPTER=minio'
      );
    }
    return minio({
      bucket,
      endpoint,
      accessKeyId,
      secretAccessKey,
      ...(process.env.EXAMPLE_REGION !== undefined
        ? { region: process.env.EXAMPLE_REGION }
        : {}),
    });
  }
  if (choice === 'tigris') {
    const bucket = process.env.EXAMPLE_BUCKET;
    const accessKeyId = process.env.EXAMPLE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.EXAMPLE_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'EXAMPLE_BUCKET, EXAMPLE_ACCESS_KEY_ID, and EXAMPLE_SECRET_ACCESS_KEY are required for EXAMPLE_ADAPTER=tigris'
      );
    }
    return tigris({
      bucket,
      accessKeyId,
      secretAccessKey,
      endpoint: process.env.EXAMPLE_ENDPOINT,
      forcePathStyle: process.env.EXAMPLE_FORCE_PATH_STYLE === 'true',
    });
  }
  if (choice === 'azure') {
    const bucket = process.env.EXAMPLE_BUCKET;
    const accountName = process.env.EXAMPLE_ACCOUNT_NAME;
    const accountKey = process.env.EXAMPLE_ACCOUNT_KEY;
    if (!bucket || !accountName || !accountKey) {
      throw new Error(
        'EXAMPLE_BUCKET, EXAMPLE_ACCOUNT_NAME, and EXAMPLE_ACCOUNT_KEY are required for EXAMPLE_ADAPTER=azure'
      );
    }
    return azure({
      bucket,
      accountName,
      accountKey,
      ...(process.env.EXAMPLE_ENDPOINT !== undefined
        ? { endpoint: process.env.EXAMPLE_ENDPOINT }
        : {}),
    });
  }
  if (choice === 'gcs') {
    const bucket = process.env.EXAMPLE_BUCKET;
    const projectId = process.env.EXAMPLE_PROJECT_ID;
    const keyFilename = process.env.EXAMPLE_KEY_FILENAME;
    if (!bucket || !projectId) {
      throw new Error(
        'EXAMPLE_BUCKET and EXAMPLE_PROJECT_ID are required for EXAMPLE_ADAPTER=gcs'
      );
    }
    return gcs({
      bucket,
      projectId,
      ...(keyFilename !== undefined ? { keyFilename } : {}),
    });
  }
  if (choice === 'vercel') {
    const bucket = process.env.EXAMPLE_BUCKET;
    const token =
      process.env.EXAMPLE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
    if (!bucket || !token) {
      throw new Error(
        'EXAMPLE_BUCKET and EXAMPLE_TOKEN (or BLOB_READ_WRITE_TOKEN) are required for EXAMPLE_ADAPTER=vercel'
      );
    }
    return vercel({ bucket, token });
  }
  throw new Error(
    `Unknown EXAMPLE_ADAPTER '${choice}'. Expected one of: fs, s3, r2, minio, tigris, azure, gcs, vercel.`
  );
}
