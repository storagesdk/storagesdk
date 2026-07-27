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

  describe('tensorlake adapter implementation', { timeout: 30_000 }, () => {
    it('composes concurrent fork registry mutations', async () => {
      const adapter = buildAdapter();
      const suffix = crypto.randomUUID();
      const seedPath = `concurrency/${suffix}.txt`;
      const first = `concurrent-first-${suffix}`;
      const second = `concurrent-second-${suffix}`;
      const third = `concurrent-third-${suffix}`;
      let snapshotId: string | undefined;

      try {
        await adapter.upload(seedPath, 'seed');
        snapshotId = (await adapter.snapshots.create()).id;
        await Promise.all([
          adapter.forks.create({ name: first, fromSnapshot: snapshotId }),
          adapter.forks.create({ name: second, fromSnapshot: snapshotId }),
        ]);
        expect(
          (await adapter.forks.list())
            .filter((fork) => fork.name === first || fork.name === second)
            .map((fork) => fork.name)
            .sort()
        ).toEqual([first, second].sort());

        await Promise.all([
          adapter.forks.delete(first),
          adapter.forks.create({ name: third, fromSnapshot: snapshotId }),
        ]);
        expect(
          (await adapter.forks.list())
            .filter(
              (fork) =>
                fork.name === first ||
                fork.name === second ||
                fork.name === third
            )
            .map((fork) => fork.name)
            .sort()
        ).toEqual([second, third].sort());
      } finally {
        await Promise.allSettled([
          adapter.forks.delete(first),
          adapter.forks.delete(second),
          adapter.forks.delete(third),
        ]);
        if (snapshotId !== undefined) {
          await adapter.snapshots.delete(snapshotId).catch(() => {});
        }
        await adapter.delete(seedPath);
      }
    });
  });
} else {
  describe('tensorlake adapter (skipped)', () => {
    it('skipped: TENSORLAKE_FILESYSTEM / TENSORLAKE_API_KEY not set', () => {
      expect(true).toBe(true);
    });
  });
}
