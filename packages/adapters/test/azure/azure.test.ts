import { describe, expect, it } from 'vitest';
import { azure } from '../../src/azure/azure.js';
import {
  setupTestStorage,
  storageAdapterTestSuite,
} from '../../src/test-suite.js';

// All connection settings come from `AZURE_*` env vars. `AZURE_BUCKET`
// is required — the suite skips entirely when it isn't set. The other
// vars fall back to Azurite (the official Microsoft Blob emulator)
// defaults, so `pnpm test` works against the local
// `docker compose up azurite` stack out of the box.
//
// The well-known Azurite dev account is published by Microsoft and
// works on every Azurite install:
// https://learn.microsoft.com/azure/storage/common/storage-use-azurite#well-known-storage-account-and-key
const BUCKET = process.env.AZURE_BUCKET;
const ACCOUNT_NAME = process.env.AZURE_ACCOUNT_NAME ?? 'devstoreaccount1';
const ACCOUNT_KEY =
  process.env.AZURE_ACCOUNT_KEY ??
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const ENDPOINT =
  process.env.AZURE_ENDPOINT ?? 'http://127.0.0.1:10000/devstoreaccount1';

const configured = Boolean(BUCKET);

const buildAdapter = () =>
  azure({
    bucket: BUCKET as string,
    accountName: ACCOUNT_NAME,
    accountKey: ACCOUNT_KEY,
    endpoint: ENDPOINT,
  });

const bodyText = (item: { body: Uint8Array }): string =>
  new TextDecoder().decode(item.body);

storageAdapterTestSuite({
  name: 'azure adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (configured) {
  describe('azure adapter (implementation)', () => {
    const ctx = setupTestStorage(buildAdapter);

    describe('SAS URLs', () => {
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
          headers: { 'x-ms-blob-type': 'BlockBlob' },
        });
        expect(res.ok).toBe(true);
        const item = await ctx.download('uploaded.bin');
        expect(bodyText(item)).toBe('uploaded-content');
      });
    });
  });
}

if (!configured) {
  describe('azure adapter (skipped)', () => {
    it('skipped: AZURE_BUCKET not set', () => {
      expect(true).toBe(true);
    });
  });
}
