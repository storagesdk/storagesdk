import { describe, expect, it } from 'vitest';
import { spaces } from '../../src/spaces/spaces.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.SPACES_BUCKET;
const REGION = process.env.SPACES_REGION;
const ACCESS_KEY_ID = process.env.SPACES_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.SPACES_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.SPACES_ENDPOINT;

// Live tests against a real DigitalOcean Space. Skip when env vars are
// missing so contributors without credentials can run the rest.
const configured = Boolean(
  BUCKET && REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  spaces({
    bucket: BUCKET as string,
    region: REGION as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'spaces adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('spaces adapter (skipped)', () => {
    it('skipped: SPACES_BUCKET / REGION / ACCESS_KEY_ID / SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
