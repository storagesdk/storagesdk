import { describe, expect, it } from 'vitest';
import { linode } from '../../src/linode/linode.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.LINODE_BUCKET;
const REGION = process.env.LINODE_REGION;
const ACCESS_KEY_ID = process.env.LINODE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.LINODE_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.LINODE_ENDPOINT;

// Live tests against a real Linode Object Storage bucket. Skip when
// env vars are missing so contributors without credentials can run
// the rest.
const configured = Boolean(
  BUCKET && REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  linode({
    bucket: BUCKET as string,
    region: REGION as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'linode adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('linode adapter (skipped)', () => {
    it('skipped: LINODE_BUCKET / REGION / ACCESS_KEY_ID / SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
