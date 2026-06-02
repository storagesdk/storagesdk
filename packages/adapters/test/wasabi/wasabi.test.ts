import { describe, expect, it } from 'vitest';
import { storageAdapterTestSuite } from '../../src/test-suite.js';
import { wasabi } from '../../src/wasabi/wasabi.js';

const BUCKET = process.env.WASABI_BUCKET;
const REGION = process.env.WASABI_REGION;
const ACCESS_KEY_ID = process.env.WASABI_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.WASABI_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.WASABI_ENDPOINT;

// Live tests against a real Wasabi bucket. Skip when env vars are
// missing so contributors without credentials can run the rest.
const configured = Boolean(
  BUCKET && REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  wasabi({
    bucket: BUCKET as string,
    region: REGION as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'wasabi adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('wasabi adapter (skipped)', () => {
    it('skipped: WASABI_BUCKET / REGION / ACCESS_KEY_ID / SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
