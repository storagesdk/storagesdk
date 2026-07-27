import { describe, expect, it } from 'vitest';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const FILESYSTEM = process.env.TENSORLAKE_FILESYSTEM;
const API_KEY = process.env.TENSORLAKE_API_KEY ?? process.env.TENSORLAKE_PAT;
const API_URL = process.env.TENSORLAKE_API_URL;
const ORGANIZATION_ID = process.env.TENSORLAKE_ORGANIZATION_ID;
const PROJECT_ID = process.env.TENSORLAKE_PROJECT_ID;

// Live tests against a real Tensorlake filesystem. Skip the whole suite when
// env vars are missing or empty (CI substitutes `${{ secrets.X }}` even when
// the secret is undefined → empty string; `Boolean(...)` catches both).
const configured = Boolean(FILESYSTEM && API_KEY);

// Load the adapter — and the `tensorlake` SDK it imports — lazily, only when
// the live suite is configured. tensorlake@0.5.89 declares `engines.node
// >= 22`, so a static import would evaluate the SDK on the Node 20 CI job even
// though the suite is skipped there.
if (configured) {
  const { tensorlake } = await import('../../src/tensorlake/tensorlake.js');

  const buildAdapter = () =>
    tensorlake({
      filesystem: FILESYSTEM as string,
      apiKey: API_KEY as string,
      ...(API_URL !== undefined ? { apiUrl: API_URL } : {}),
      ...(ORGANIZATION_ID !== undefined
        ? { organizationId: ORGANIZATION_ID }
        : {}),
      ...(PROJECT_ID !== undefined ? { projectId: PROJECT_ID } : {}),
    });

  storageAdapterTestSuite({
    name: 'tensorlake adapter',
    skip: false,
    testTimeoutMs: 30_000,
    adapter: buildAdapter,
    capabilities: {
      userMetadata: false,
      contentType: false,
      presignedUploads: false,
      fetchableSignedUrls: false,
    },
  });
} else {
  describe('tensorlake adapter (skipped)', () => {
    it('skipped: TENSORLAKE_FILESYSTEM / TENSORLAKE_API_KEY not set', () => {
      expect(true).toBe(true);
    });
  });
}
