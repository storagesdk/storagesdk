import { describe, expect, it } from 'vitest';
import { r2 } from '../../src/r2/r2.js';
import {
  setupTestStorage,
  storageAdapterTestSuite,
} from '../../src/test-suite.js';

const BUCKET = process.env.R2_BUCKET;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.R2_ENDPOINT;

// Live tests against a real Cloudflare R2 bucket. Skip the whole suite
// when env vars are missing or empty so contributors without R2
// credentials can still run the rest of the suite.
const configured = Boolean(
  BUCKET && ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  r2({
    bucket: BUCKET as string,
    accountId: ACCOUNT_ID as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

const bodyText = (item: { body: Uint8Array }): string =>
  new TextDecoder().decode(item.body);

storageAdapterTestSuite({
  name: 'r2 adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (configured) {
  describe('r2 adapter (implementation)', () => {
    const ctx = setupTestStorage(buildAdapter);

    describe('presigned URLs over HTTP', () => {
      it('signed GET URL returns the object content', async () => {
        await ctx.upload('signed.txt', 'signed-content');
        const url = await ctx.url('signed.txt', { expiresIn: 300 });
        expect(url).toMatch(/^https?:\/\//);
        expect(url).toContain('X-Amz-Signature=');
        const res = await fetch(url);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('signed-content');
      });

      it('signed PUT URL works for upload', async () => {
        const signed = await ctx.uploadUrl('uploaded.bin', { expiresIn: 300 });
        expect(signed.method).toBe('PUT');
        expect(signed.url).toContain('X-Amz-Signature=');
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
  describe('r2 adapter (skipped)', () => {
    it('skipped: R2_BUCKET / R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
