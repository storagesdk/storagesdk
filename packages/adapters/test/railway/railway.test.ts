import { describe, expect, it } from 'vitest';
import { storageAdapterTestSuite } from '../../src/test-suite.js';
import { railway } from '../../src/railway/railway.js';

const BUCKET = process.env.RAILWAY_BUCKET;
const ENDPOINT = process.env.RAILWAY_ENDPOINT;
const ACCESS_KEY_ID = process.env.RAILWAY_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.RAILWAY_SECRET_ACCESS_KEY;

const configured = Boolean(BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

const buildAdapter = () =>
  railway({
    bucket: BUCKET as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'railway adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('railway adapter (skipped)', () => {
    it('skipped: RAILWAY_BUCKET / RAILWAY_ACCESS_KEY_ID / RAILWAY_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
