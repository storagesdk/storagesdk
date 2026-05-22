import * as os from 'node:os';
import * as path from 'node:path';
import { fs } from '@storagesdk/adapters/fs';
import { s3 } from '@storagesdk/adapters/s3';
import { tigris } from '@storagesdk/adapters/tigris';
import type { Adapter } from '@storagesdk/core/adapter';

/**
 * Pick a storage adapter for an example based on `EXAMPLE_ADAPTER`
 * (defaults to `fs` — works with zero config). Each example imports this
 * so the same feature demo can run against FS, S3, or Tigris just by
 * changing env vars.
 *
 * Env vars (single namespaced scheme):
 *   EXAMPLE_ADAPTER          fs | s3 | tigris (default: fs)
 *   EXAMPLE_BUCKET           required for s3, tigris
 *   EXAMPLE_ENDPOINT         optional (e.g. MinIO, self-hosted Tigris)
 *   EXAMPLE_REGION           optional for s3
 *   EXAMPLE_ACCESS_KEY_ID    required for s3, tigris
 *   EXAMPLE_SECRET_ACCESS_KEY required for s3, tigris
 *   EXAMPLE_FORCE_PATH_STYLE 'true' to force path-style addressing
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
  throw new Error(
    `Unknown EXAMPLE_ADAPTER '${choice}'. Expected one of: fs, s3, tigris.`
  );
}
