import { describe, expect, it } from 'vitest';
import { azure } from '../../src/azure/azure.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

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

storageAdapterTestSuite({
  name: 'azure adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('azure adapter (skipped)', () => {
    it('skipped: AZURE_BUCKET not set', () => {
      expect(true).toBe(true);
    });
  });
}
