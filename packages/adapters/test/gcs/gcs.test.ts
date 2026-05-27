import { describe, expect, it } from 'vitest';
import { gcs } from '../../src/gcs/gcs.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

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

storageAdapterTestSuite({
  name: 'gcs adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('gcs adapter (skipped)', () => {
    it('skipped: GCS_BUCKET / GCS_PROJECT_ID not set', () => {
      expect(true).toBe(true);
    });
  });
}
