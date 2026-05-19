import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Storage } from '@storagesdk/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { s3 } from '../../src/s3/s3.js';

const ENDPOINT = process.env.S3_TEST_ENDPOINT ?? 'http://localhost:9000';
const REGION = 'us-east-1';
const CREDENTIALS = {
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
};

const bodyText = (item: { body: Uint8Array }) =>
  new TextDecoder().decode(item.body);

function uniqueBucket(): string {
  // Keep short so `<bucket>-snapshot-<25 digits>` fits in S3's 63-char limit.
  // 'sdk-' + 9 alphanumeric chars + '-' + 6 = 20 chars total.
  const a = Math.random().toString(36).slice(2, 11);
  const b = Math.random().toString(36).slice(2, 8);
  return `sdk-${a}-${b}`;
}

function adminClient(): S3Client {
  return new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: CREDENTIALS,
    forcePathStyle: true,
  });
}

async function setupBucket(): Promise<string> {
  const bucket = uniqueBucket();
  const admin = adminClient();
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  admin.destroy();
  return bucket;
}

async function nukeBucket(client: S3Client, bucket: string): Promise<void> {
  let token: string | undefined;
  while (true) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ...(token !== undefined ? { ContinuationToken: token } : {}),
      })
    );
    const toDelete: { Key: string }[] = [];
    for (const o of res.Contents ?? []) {
      if (o.Key) toDelete.push({ Key: o.Key });
    }
    if (toDelete.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: toDelete, Quiet: true },
        })
      );
    }
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
  }
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));
}

describe('s3 adapter', () => {
  let bucket: string;
  let storage: Storage;

  beforeEach(async () => {
    bucket = await setupBucket();
    storage = new Storage({
      adapter: s3({
        bucket,
        region: REGION,
        endpoint: ENDPOINT,
        credentials: CREDENTIALS,
        forcePathStyle: true,
      }),
    });
  });

  afterEach(async () => {
    // Nuke the main bucket plus any siblings (snapshots/forks/etc) that
    // this test's bucket name prefix matches.
    const admin = adminClient();
    try {
      const res = await admin.send(new ListBucketsCommand({}));
      for (const b of res.Buckets ?? []) {
        if (b.Name && (b.Name === bucket || b.Name.startsWith(`${bucket}-`))) {
          try {
            await nukeBucket(admin, b.Name);
          } catch {
            /* swallow — another test may have raced us, or bucket is missing */
          }
        }
      }
    } catch {
      /* swallow */
    } finally {
      admin.destroy();
    }
  });

  describe('basic ops', () => {
    it('uploads and downloads a string body', async () => {
      await storage.upload('hello.txt', 'hello, world');
      const item = await storage.download('hello.txt');
      expect(bodyText(item)).toBe('hello, world');
      expect(item.size).toBe(12);
    });

    it('preserves contentType and user metadata', async () => {
      await storage.upload('photo.jpg', 'bytes', {
        contentType: 'image/jpeg',
        metadata: { author: 'alice' },
      });
      const meta = await storage.head('photo.jpg');
      expect(meta.contentType).toBe('image/jpeg');
      // S3 lowercases user-metadata keys.
      expect(meta.metadata?.author).toBe('alice');
    });

    it('throws NotFound for missing keys', async () => {
      await expect(storage.download('missing.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
      await expect(storage.head('missing.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('lists with prefix and paginates with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.upload(`photos/${i}.jpg`, String(i));
      }
      await storage.upload('videos/v.mp4', 'v');

      const filtered = await storage.list({ prefix: 'photos/' });
      expect(filtered.items.length).toBe(5);

      const page1 = await storage.list({ prefix: 'photos/', limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.cursor).toBeDefined();

      const cursor = page1.cursor;
      if (cursor === undefined) throw new Error('cursor not set');
      const page2 = await storage.list({
        prefix: 'photos/',
        limit: 2,
        cursor,
      });
      expect(page2.items.length).toBe(2);
      expect(page2.items[0]?.path).not.toBe(page1.items[0]?.path);
    });

    it('deletes a key', async () => {
      await storage.upload('photo.jpg', 'bytes');
      await storage.delete('photo.jpg');
      await expect(storage.head('photo.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('copies and moves keys server-side', async () => {
      await storage.upload('src.jpg', 'data', { contentType: 'image/jpeg' });
      await storage.copy('src.jpg', 'dst.jpg');
      expect((await storage.head('dst.jpg')).contentType).toBe('image/jpeg');

      await storage.move('dst.jpg', 'final.jpg');
      await expect(storage.head('dst.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
      expect((await storage.head('final.jpg')).contentType).toBe('image/jpeg');
    });

    it('copies and moves nested keys (path separators in key)', async () => {
      await storage.upload('photos/2024/a.jpg', 'a');
      await storage.copy('photos/2024/a.jpg', 'archive/2024/a.jpg');
      expect(bodyText(await storage.download('archive/2024/a.jpg'))).toBe('a');

      await storage.move('archive/2024/a.jpg', 'archive/2024/b.jpg');
      await expect(storage.head('archive/2024/a.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
      expect(bodyText(await storage.download('archive/2024/b.jpg'))).toBe('a');
    });

    it('copies keys with special characters that need URL encoding', async () => {
      await storage.upload('photos/holiday (2024) ☀️.jpg', 'sun');
      await storage.copy(
        'photos/holiday (2024) ☀️.jpg',
        'archive/holiday (2024) ☀️.jpg'
      );
      expect(
        bodyText(await storage.download('archive/holiday (2024) ☀️.jpg'))
      ).toBe('sun');
    });
  });

  describe('multipart upload', () => {
    it('completes a multipart upload of a 6 MB body', async () => {
      // Default partSize is 5 MB; 6 MB forces at least two parts.
      const body = new Uint8Array(6 * 1024 * 1024).fill(0x41);
      await storage.upload('big.bin', body, { multipart: true });
      const meta = await storage.head('big.bin');
      expect(meta.size).toBe(6 * 1024 * 1024);
    }, 15_000);

    it('reports progress via onProgress', async () => {
      const body = new Uint8Array(6 * 1024 * 1024).fill(0x41);
      const events: { loaded: number; total: number }[] = [];
      await storage.upload('progress.bin', body, {
        multipart: true,
        onProgress: (e) => events.push(e),
      });
      expect(events.length).toBeGreaterThan(0);
      const last = events.at(-1);
      expect(last?.loaded).toBe(6 * 1024 * 1024);
    }, 15_000);
  });

  describe('signed URLs', () => {
    it('signed GET URL works for download', async () => {
      await storage.upload('photo.jpg', 'signed-content');
      const url = await storage.url('photo.jpg', { expiresIn: 300 });
      expect(url).toMatch(/^https?:\/\//);
      expect(url).toContain('X-Amz-Signature=');

      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('signed-content');
    });

    it('signed PUT URL works for upload', async () => {
      const signed = await storage.uploadUrl('uploaded.jpg', {
        expiresIn: 300,
      });
      expect(signed.method).toBe('PUT');
      expect(signed.url).toContain('X-Amz-Signature=');

      const res = await fetch(signed.url, {
        method: 'PUT',
        body: 'uploaded-content',
      });
      expect(res.ok).toBe(true);

      const item = await storage.download('uploaded.jpg');
      expect(bodyText(item)).toBe('uploaded-content');
    });
  });

  describe('snapshots', () => {
    it('creates a sibling bucket with copied objects', async () => {
      await storage.upload('a.jpg', 'a-content');
      await storage.upload('photos/b.jpg', 'b-content');

      const info = await storage.snapshots.create({ name: 'baseline' });
      expect(info.id).toMatch(/-snapshot-\d{25}$/);

      const reader = storage.snapshots.get(info.id);
      expect(bodyText(await reader.download('a.jpg'))).toBe('a-content');
      expect(bodyText(await reader.download('photos/b.jpg'))).toBe('b-content');
    });

    it('reads frozen content after live storage mutates', async () => {
      await storage.upload('photo.jpg', 'before');
      const info = await storage.snapshots.create();
      await storage.upload('photo.jpg', 'after');

      const reader = storage.snapshots.get(info.id);
      expect(bodyText(await reader.download('photo.jpg'))).toBe('before');
      expect(bodyText(await storage.download('photo.jpg'))).toBe('after');
    });

    it('lists, heads, and deletes snapshots via the parent manifest', async () => {
      await storage.upload('a.jpg', 'a');
      const info = await storage.snapshots.create({ name: 'one' });

      expect((await storage.snapshots.list()).length).toBe(1);
      expect((await storage.snapshots.head(info.id)).name).toBe('one');

      await storage.snapshots.delete(info.id);
      expect((await storage.snapshots.list()).length).toBe(0);
      // The snapshot bucket itself is gone — head from outside fails.
      await expect(storage.snapshots.head(info.id)).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('hides the internal manifest from list() on parent and snapshot', async () => {
      await storage.upload('a.jpg', 'a');
      const info = await storage.snapshots.create();

      // Parent bucket has a manifest after snapshot creation; list() must hide it.
      const parentKeys = (await storage.list()).items.map((i) => i.path);
      expect(parentKeys).toContain('a.jpg');
      expect(parentKeys).not.toContain('.storagesdk.metadata.json');

      // Snapshot bucket also has its own manifest; list() must hide it.
      const reader = storage.snapshots.get(info.id);
      const snapKeys = (await reader.list()).items.map((i) => i.path);
      expect(snapKeys).toContain('a.jpg');
      expect(snapKeys).not.toContain('.storagesdk.metadata.json');
    });

    it('list({ limit }) returns full pages even when the manifest is present', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.upload(`k${i}.txt`, String(i));
      }
      await storage.snapshots.create();

      const page1 = await storage.list({ limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.cursor).toBeDefined();
    });
  });

  describe('forks', () => {
    it('creates a writable fork seeded from a snapshot', async () => {
      await storage.upload('photo.jpg', 'original');
      const snap = await storage.snapshots.create();

      const forkName = `${bucket}-fork`;
      await storage.forks.create({ name: forkName, fromSnapshot: snap.id });

      const fork = storage.forks.get(forkName);
      expect(bodyText(await fork.download('photo.jpg'))).toBe('original');

      await fork.upload('photo.jpg', 'modified');
      expect(bodyText(await fork.download('photo.jpg'))).toBe('modified');
      expect(bodyText(await storage.download('photo.jpg'))).toBe('original');
    });

    it('throws Conflict when the fork name already exists', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();

      const forkName = `${bucket}-twin`;
      await storage.forks.create({ name: forkName, fromSnapshot: snap.id });
      await expect(
        storage.forks.create({ name: forkName, fromSnapshot: snap.id })
      ).rejects.toMatchObject({ code: 'Conflict' });
    });

    it('lists, heads, and deletes forks via the parent manifest', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();

      const forkName = `${bucket}-fork`;
      await storage.forks.create({ name: forkName, fromSnapshot: snap.id });

      expect((await storage.forks.list()).length).toBe(1);
      expect((await storage.forks.head(forkName)).fromSnapshot).toBe(snap.id);

      await storage.forks.delete(forkName);
      expect((await storage.forks.list()).length).toBe(0);
    });

    it('supports nested snapshots and forks on a fork', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();
      const forkName = `${bucket}-child`;
      await storage.forks.create({ name: forkName, fromSnapshot: snap.id });

      const fork = storage.forks.get(forkName);
      await fork.upload('b.jpg', 'b');
      const childSnap = await fork.snapshots.create({ name: 'child-snap' });

      const childSnaps = await fork.snapshots.list();
      expect(childSnaps.length).toBe(1);
      expect(childSnaps[0]?.name).toBe('child-snap');

      // Clean up nested resources so the test's afterEach cleanup hooks work.
      await fork.snapshots.delete(childSnap.id);
    });
  });
});
