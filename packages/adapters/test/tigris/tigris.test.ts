import { describe, expect, it } from 'vitest';
import {
  setupTestStorage,
  storageAdapterTestSuite,
} from '../../src/test-suite.js';
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

const bodyText = (item: { body: Uint8Array }): string =>
  new TextDecoder().decode(item.body);

storageAdapterTestSuite({
  name: 'tigris adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (configured) {
  describe('tigris adapter (implementation)', () => {
    const ctx = setupTestStorage(buildAdapter);

    describe('presigned URLs over HTTP', () => {
      it('signed GET URL returns the object content', async () => {
        await ctx.upload('signed.txt', 'signed-content');
        const url = await ctx.url('signed.txt', { expiresIn: 300 });
        const res = await fetch(url);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('signed-content');
      });

      it('signed PUT URL works for upload', async () => {
        const signed = await ctx.uploadUrl('uploaded.bin', { expiresIn: 300 });
        expect(signed.method).toBe('PUT');
        const res = await fetch(signed.url, {
          method: 'PUT',
          body: 'uploaded-content',
        });
        expect(res.ok).toBe(true);
        const item = await ctx.download('uploaded.bin');
        expect(bodyText(item)).toBe('uploaded-content');
      });
    });
  });
}

if (!configured) {
  describe('tigris adapter (skipped)', () => {
    it('skipped: TIGRIS_BUCKET / TIGRIS_ACCESS_KEY_ID / TIGRIS_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
