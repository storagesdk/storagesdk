import { describe, expect, it } from 'vitest';
import { bunnyS3 } from '../../src/bunny-s3/bunny-s3.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

// Live tests against a real Bunny storage zone created with S3
// compatibility turned on. Skip the whole suite when the required env
// vars are missing or empty. `accessKey` is the storage zone password.
const ZONE = process.env.BUNNY_S3_ZONE;
const ACCESS_KEY = process.env.BUNNY_S3_ACCESS_KEY;
const BUCKET = process.env.BUNNY_S3_BUCKET ?? 'storagesdk-test';
const REGION = process.env.BUNNY_S3_REGION as
  | Parameters<typeof bunnyS3>[0]['region']
  | undefined;
const ENDPOINT = process.env.BUNNY_S3_ENDPOINT;

const configured = Boolean(ZONE && ACCESS_KEY);

const buildAdapter = () =>
  bunnyS3({
    zone: ZONE as string,
    bucket: BUCKET,
    accessKey: ACCESS_KEY as string,
    ...(REGION ? { region: REGION } : {}),
    ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'bunny-s3 adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('bunny-s3 adapter (skipped)', () => {
    it('skipped: BUNNY_S3_ZONE / BUNNY_S3_ACCESS_KEY not set', () => {
      expect(true).toBe(true);
    });
  });
}
