import { describe, expect, it } from 'vitest';
import { backblaze } from '../../src/backblaze/backblaze.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.BACKBLAZE_BUCKET;
const REGION = process.env.BACKBLAZE_REGION;
const ACCESS_KEY_ID = process.env.BACKBLAZE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.BACKBLAZE_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.BACKBLAZE_ENDPOINT;

// Live tests against a real Backblaze B2 bucket. Skip when env vars are
// missing so contributors without credentials can run the rest.
const configured = Boolean(
  BUCKET && REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  backblaze({
    bucket: BUCKET as string,
    region: REGION as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'backblaze adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('backblaze adapter (skipped)', () => {
    it('skipped: BACKBLAZE_BUCKET / REGION / ACCESS_KEY_ID / SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
