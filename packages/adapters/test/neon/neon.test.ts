import { describe, expect, it } from 'vitest';
import { neonConfigFromEnv } from '../../src/neon/env.js';
import { neon } from '../../src/neon/neon.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.NEON_BUCKET;
const ENDPOINT =
  process.env.NEON_ENDPOINT ??
  process.env.AWS_ENDPOINT_URL_S3 ??
  process.env.S3_ENDPOINT;

const ACCESS_KEY_ID =
  process.env.NEON_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY =
  process.env.NEON_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
const REGION = process.env.NEON_REGION ?? process.env.AWS_REGION;

// Live tests against a real Neon Object Storage bucket. Skip the whole
// suite when env vars are missing or empty so contributors without Neon
// credentials can still run the rest of the suite.
const configured = Boolean(
  BUCKET && ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  neon({
    bucket: BUCKET as string,
    endpoint: ENDPOINT as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(REGION ? { region: REGION } : {}),
  });

storageAdapterTestSuite({
  name: 'neon adapter',
  skip: !configured,
  adapter: buildAdapter,
});

describe('neon config', () => {
  it('reads the S3 endpoint fallback', () => {
    const saved = process.env;
    process.env = {
      ...saved,
      NEON_BUCKET: 'photos',
      S3_ENDPOINT: 'https://branch.storage.example',
      NEON_ACCESS_KEY_ID: 'token-id',
      NEON_SECRET_ACCESS_KEY: 'secret',
    };
    delete process.env.NEON_ENDPOINT;
    delete process.env.AWS_ENDPOINT_URL_S3;

    try {
      expect(neonConfigFromEnv()).toMatchObject({
        bucket: 'photos',
        endpoint: 'https://branch.storage.example',
        accessKeyId: 'token-id',
        secretAccessKey: 'secret',
      });
    } finally {
      process.env = saved;
    }
  });

  it('defaults the region to Neon’s beta region', async () => {
    const adapter = neon({
      bucket: 'photos',
      endpoint: 'https://branch.storage.example',
      accessKeyId: 'token-id',
      secretAccessKey: 'secret',
    });

    expect(adapter.name).toBe('s3');
    expect(await adapter.raw.config.region()).toBe('us-east-2');
  });
});

if (!configured) {
  describe('neon adapter (skipped)', () => {
    it('skipped: NEON_BUCKET / NEON_ENDPOINT / NEON_ACCESS_KEY_ID / NEON_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
