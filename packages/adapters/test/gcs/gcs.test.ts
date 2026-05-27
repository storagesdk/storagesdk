import { describe, expect, it } from 'vitest';
import { gcs } from '../../src/gcs/gcs.js';
import {
  setupTestStorage,
  storageAdapterTestSuite,
} from '../../src/test-suite.js';

// Live tests against a real GCS bucket. Skip the whole suite when env
// vars are missing or empty. Authentication via either inline JSON
// credentials (GCS_CREDENTIALS_JSON, a base64-encoded service-account
// key) or a key file path (GCS_KEY_FILENAME), with Application Default
// Credentials as a fallback.
const BUCKET = process.env.GCS_BUCKET;
const PROJECT_ID = process.env.GCS_PROJECT_ID;
const KEY_FILENAME = process.env.GCS_KEY_FILENAME;
const CREDENTIALS_JSON = process.env.GCS_CREDENTIALS_JSON;
const API_ENDPOINT = process.env.GCS_API_ENDPOINT;

const configured = Boolean(BUCKET && PROJECT_ID);

const buildAdapter = () => {
  const credentials = CREDENTIALS_JSON
    ? (JSON.parse(CREDENTIALS_JSON) as {
        client_email: string;
        private_key: string;
      })
    : undefined;
  return gcs({
    bucket: BUCKET as string,
    projectId: PROJECT_ID as string,
    ...(credentials !== undefined ? { credentials } : {}),
    ...(KEY_FILENAME !== undefined ? { keyFilename: KEY_FILENAME } : {}),
    ...(API_ENDPOINT !== undefined ? { apiEndpoint: API_ENDPOINT } : {}),
  });
};

const bodyText = (item: { body: Uint8Array }): string =>
  new TextDecoder().decode(item.body);

storageAdapterTestSuite({
  name: 'gcs adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (configured) {
  describe('gcs adapter (implementation)', () => {
    const ctx = setupTestStorage(buildAdapter);

    describe('signed URLs', () => {
      it('signed GET URL returns the object content', async () => {
        await ctx.upload('signed.txt', 'signed-content');
        const url = await ctx.url('signed.txt', { expiresIn: 300 });
        expect(url).toMatch(/^https?:\/\//);
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
  describe('gcs adapter (skipped)', () => {
    it('skipped: GCS_BUCKET / GCS_PROJECT_ID not set', () => {
      expect(true).toBe(true);
    });
  });
}
