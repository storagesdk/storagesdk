import { describe, expect, it } from 'vitest';
import { storageAdapterTestSuite } from '../../src/test-suite.js';
import { tigris } from '../../src/tigris/tigris.js';

const BUCKET = process.env.TIGRIS_BUCKET;
const ENDPOINT = process.env.TIGRIS_ENDPOINT;
const ACCESS_KEY_ID = process.env.TIGRIS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.TIGRIS_SECRET_ACCESS_KEY;

// Live tests against a real Tigris bucket. Skip the whole suite when env
// vars are missing or empty (CI substitutes `${{ secrets.X }}` even when
// the secret is undefined → empty string; `Boolean(...)` catches both).
const configured = Boolean(BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

const buildAdapter = () =>
  tigris({
    bucket: BUCKET as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'tigris adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('tigris adapter (skipped)', () => {
    it('skipped: TIGRIS_BUCKET / TIGRIS_ACCESS_KEY_ID / TIGRIS_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
