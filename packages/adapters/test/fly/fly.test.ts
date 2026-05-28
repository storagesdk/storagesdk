import { describe, expect, it } from 'vitest';
import { fly } from '../../src/fly/fly.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.FLY_BUCKET;
const ENDPOINT = process.env.FLY_ENDPOINT;
const ACCESS_KEY_ID = process.env.FLY_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.FLY_SECRET_ACCESS_KEY;

const configured = Boolean(BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

const buildAdapter = () =>
  fly({
    bucket: BUCKET as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'fly adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('fly adapter (skipped)', () => {
    it('skipped: FLY_BUCKET / FLY_ACCESS_KEY_ID / FLY_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
