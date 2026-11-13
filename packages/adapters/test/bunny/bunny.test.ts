import { describe, expect, it } from 'vitest';
import { bunny } from '../../src/bunny/bunny.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

// Live tests against a real Bunny storage zone. Skip the whole suite when
// the required env vars are missing or empty. `accessKey` is the storage
// zone *password*, not the account API key.
const ZONE = process.env.BUNNY_STORAGE_ZONE;
const ACCESS_KEY = process.env.BUNNY_STORAGE_ACCESS_KEY;
const BUCKET = process.env.BUNNY_STORAGE_BUCKET ?? 'storagesdk-test';
const REGION = process.env.BUNNY_STORAGE_REGION as
  | Parameters<typeof bunny>[0]['region']
  | undefined;
// A linked pull zone makes `url()` publicly fetchable; without it the
// adapter returns the auth-required storage URL and the suite skips the
// fetch assertions.
const PULL_ZONE = process.env.BUNNY_PULL_ZONE;

const configured = Boolean(ZONE && ACCESS_KEY);

const buildAdapter = () =>
  bunny({
    zone: ZONE as string,
    bucket: BUCKET,
    accessKey: ACCESS_KEY as string,
    ...(REGION ? { region: REGION } : {}),
    ...(PULL_ZONE ? { pullZone: PULL_ZONE } : {}),
  });

storageAdapterTestSuite({
  name: 'bunny adapter',
  skip: !configured,
  adapter: buildAdapter,
  capabilities: {
    // Bunny Edge Storage has no user-metadata field.
    userMetadata: false,
    // No presigned upload URL.
    presignedUploads: false,
    // `url()` is publicly fetchable only when a pull zone is configured.
    fetchableSignedUrls: Boolean(PULL_ZONE),
  },
  // Bunny has no server-side copy, so snapshot/fork seeding and copy/move
  // stream bytes per object — give the network-bound tests more headroom.
  testTimeoutMs: 30_000,
});

if (!configured) {
  describe('bunny adapter (skipped)', () => {
    it('skipped: BUNNY_STORAGE_ZONE / BUNNY_STORAGE_ACCESS_KEY not set', () => {
      expect(true).toBe(true);
    });
  });
}
