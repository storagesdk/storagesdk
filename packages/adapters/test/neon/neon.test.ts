import { describe, expect, it } from 'vitest';
import { neon } from '../../src/neon/neon.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.NEON_BUCKET;
const ENDPOINT = process.env.NEON_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3;

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

if (!configured) {
  describe('neon adapter (skipped)', () => {
    it('skipped: NEON_BUCKET / NEON_ENDPOINT / NEON_ACCESS_KEY_ID / NEON_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
