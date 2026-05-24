import { describe, expect, it } from 'vitest';
import { s3 } from '../../src/s3/s3.js';
import {
  setupTestStorage,
  storageAdapterTestSuite,
} from '../../src/test-suite.js';

// All connection settings come from `S3_TEST_*` env vars. `S3_TEST_BUCKET`
// is required — the suite skips entirely when it isn't set. The other vars
// fall back to MinIO-friendly defaults so `pnpm test` works against the
// local `docker compose up minio` stack out of the box.
//
// Tests treat the bucket as pre-existing infrastructure with sufficient
// credentials — no bucket creation, no admin operations.
const BUCKET = process.env.S3_TEST_BUCKET;
const ENDPOINT = process.env.S3_TEST_ENDPOINT ?? 'http://localhost:9000';
const REGION = process.env.S3_TEST_REGION ?? 'us-east-1';
const CREDENTIALS = {
  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? 'minioadmin',
  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'minioadmin',
};
const FORCE_PATH_STYLE =
  (process.env.S3_TEST_FORCE_PATH_STYLE ?? 'true') === 'true';

const configured = Boolean(BUCKET);

const buildAdapter = () =>
  s3({
    bucket: BUCKET as string,
    region: REGION,
    endpoint: ENDPOINT,
    credentials: CREDENTIALS,
    forcePathStyle: FORCE_PATH_STYLE,
  });

const bodyText = (item: { body: Uint8Array }): string =>
  new TextDecoder().decode(item.body);

storageAdapterTestSuite({
  name: 's3 adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (configured) {
  describe('s3 adapter (implementation)', () => {
    const ctx = setupTestStorage(buildAdapter);

    describe('multipart upload', () => {
      it('completes a multipart upload of a 6 MB body', async () => {
        // Default partSize is 5 MB; 6 MB forces at least two parts.
        const body = new Uint8Array(6 * 1024 * 1024).fill(0x41);
        await ctx.upload('big.bin', body, { multipart: true });
        const meta = await ctx.head('big.bin');
        expect(meta.size).toBe(6 * 1024 * 1024);
      }, 15_000);

      it('reports progress via onProgress', async () => {
        const body = new Uint8Array(6 * 1024 * 1024).fill(0x41);
        const events: { loaded: number; total: number }[] = [];
        await ctx.upload('progress.bin', body, {
          multipart: true,
          onProgress: (e) => events.push(e),
        });
        expect(events.length).toBeGreaterThan(0);
        expect(events.at(-1)?.loaded).toBe(6 * 1024 * 1024);
      }, 15_000);
    });

    describe('presigned URLs (HTTP)', () => {
      it('signed GET URL works for download', async () => {
        await ctx.upload('photo.jpg', 'signed-content');
        const url = await ctx.url('photo.jpg', { expiresIn: 300 });
        expect(url).toMatch(/^https?:\/\//);
        expect(url).toContain('X-Amz-Signature=');

        const res = await fetch(url);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('signed-content');
      });

      it('signed PUT URL works for upload', async () => {
        const signed = await ctx.uploadUrl('uploaded.jpg', { expiresIn: 300 });
        expect(signed.method).toBe('PUT');
        expect(signed.url).toContain('X-Amz-Signature=');

        const res = await fetch(signed.url, {
          method: 'PUT',
          body: 'uploaded-content',
        });
        expect(res.ok).toBe(true);

        const item = await ctx.download('uploaded.jpg');
        expect(bodyText(item)).toBe('uploaded-content');
      });
    });

    describe('snapshot id and manifest storage', () => {
      it('snapshot id matches the `-snapshot-<25 digits>` shape', async () => {
        await ctx.upload('a.jpg', 'a');
        const info = await ctx.snapshots.create({ name: 'baseline' });
        expect(info.id).toMatch(/-snapshot-\d{25}$/);
      });

      it('list() hides the internal manifest on parent and snapshot', async () => {
        await ctx.upload('a.jpg', 'a');
        const info = await ctx.snapshots.create();

        const parentKeys = (await ctx.list()).items.map((i) => i.path);
        expect(parentKeys).not.toContain('.storagesdk.metadata.json');

        const reader = ctx.snapshots.get(info.id);
        const snapKeys = (await reader.list()).items.map((i) => i.path);
        expect(snapKeys).toContain('a.jpg');
        expect(snapKeys).not.toContain('.storagesdk.metadata.json');
      });
    });
  });
}

if (!configured) {
  describe('s3 adapter (skipped)', () => {
    it('skipped: S3_TEST_BUCKET not set', () => {
      expect(true).toBe(true);
    });
  });
}
