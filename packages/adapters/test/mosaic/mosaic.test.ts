import { describe, expect, it } from 'vitest';
import { mosaic } from '../../src/mosaic/mosaic.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.MOSAIC_BUCKET;
const ACCESS_KEY_ID = process.env.MOSAIC_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.MOSAIC_SECRET_ACCESS_KEY;
const REGION = process.env.MOSAIC_REGION;
const ENDPOINT = process.env.MOSAIC_ENDPOINT;

// Live tests against a real Mosaic bucket. Skip when env vars are
// missing so contributors without credentials can run the rest.
const configured = Boolean(BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

const buildAdapter = () =>
  mosaic({
    bucket: BUCKET as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(REGION !== undefined ? { region: REGION } : {}),
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'mosaic adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('mosaic adapter (skipped)', () => {
    it('skipped: MOSAIC_BUCKET / ACCESS_KEY_ID / SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
