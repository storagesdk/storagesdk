import { describe, expect, it } from 'vitest';
import { storageAdapterTestSuite } from '../../src/test-suite.js';
import { vercel } from '../../src/vercel/vercel.js';

// Live tests against a real Vercel Blob store. Skip the whole suite when
// env vars are missing or empty. `BLOB_READ_WRITE_TOKEN` is the Vercel
// SDK convention — the same env var their own examples and templates use.
const BUCKET = process.env.VERCEL_BLOB_BUCKET;
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
// Vercel Blob stores have a store-level access setting; the adapter's
// `access` must match. Default to 'public' (the common case); override
// with `VERCEL_BLOB_ACCESS=private` to test against a private store.
const ACCESS = (process.env.VERCEL_BLOB_ACCESS ?? 'public') as
  | 'public'
  | 'private';

const configured = Boolean(BUCKET && TOKEN);

const buildAdapter = () =>
  vercel({
    bucket: BUCKET as string,
    token: TOKEN as string,
    access: ACCESS,
  });

storageAdapterTestSuite({
  name: 'vercel adapter',
  skip: !configured,
  adapter: buildAdapter,
  capabilities: {
    // Vercel Blob has no user-metadata concept.
    userMetadata: false,
  },
});

if (!configured) {
  describe('vercel adapter (skipped)', () => {
    it('skipped: VERCEL_BLOB_BUCKET / BLOB_READ_WRITE_TOKEN not set', () => {
      expect(true).toBe(true);
    });
  });
}
