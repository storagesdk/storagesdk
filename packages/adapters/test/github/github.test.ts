import { describe, expect, it } from 'vitest';
import { github } from '../../src/github/github.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const TOKEN = process.env.GITHUB_TEST_TOKEN;
const OWNER = process.env.GITHUB_TEST_OWNER;
const REPO = process.env.GITHUB_TEST_REPO;
const BRANCH = process.env.GITHUB_TEST_BRANCH;

// Live tests against a real GitHub repo. The token needs Contents write
// scope. Each conformance run mutates the working branch (creates/updates/
// deletes files + tags + branches); use a dedicated test repo, not your
// canonical one.
const configured = Boolean(TOKEN && OWNER && REPO);

const buildAdapter = () =>
  github({
    owner: OWNER as string,
    repo: REPO as string,
    token: TOKEN as string,
    ...(BRANCH !== undefined ? { branch: BRANCH } : {}),
  });

storageAdapterTestSuite({
  name: 'github adapter',
  skip: !configured,
  adapter: buildAdapter,
  capabilities: {
    // Git tracks file content + path, not user metadata or Content-Type.
    userMetadata: false,
    contentType: false,
    // GitHub has no presigned upload endpoint.
    presignedUploads: false,
    // raw.githubusercontent.com URLs work for public repos; private test
    // repos won't satisfy the unauthenticated-fetch assertion.
    fetchableSignedUrls: false,
  },
  // Each GitHub op is a network round-trip (~300–800ms); tests that
  // sequence 5–6 writes blow past the default 5s vitest timeout.
  testTimeoutMs: 30_000,
});

if (!configured) {
  describe('github adapter (skipped)', () => {
    it('skipped: GITHUB_TEST_TOKEN / GITHUB_TEST_OWNER / GITHUB_TEST_REPO not all set', () => {
      expect(true).toBe(true);
    });
  });
}
