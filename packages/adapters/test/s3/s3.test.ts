import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
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
  return `storagesdk-test-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function setupBucket(): Promise<string> {
  const bucket = uniqueBucket();
  const admin = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: CREDENTIALS,
    forcePathStyle: true,
  });
  await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  admin.destroy();
  return bucket;
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
    // Empty the bucket so MinIO can clean up between tests.
    try {
      const { items } = await storage.list({ limit: 1000 });
      await Promise.all(items.map((i) => storage.delete(i.path)));
    } catch {
      /* bucket may already be in an odd state — ignore */
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

  describe('snapshots/forks (PR-A: stubbed)', () => {
    it('snapshots.create throws NotSupported', async () => {
      await expect(storage.snapshots.create()).rejects.toMatchObject({
        code: 'NotSupported',
      });
    });

    it('forks.create throws NotSupported', async () => {
      await expect(
        storage.forks.create({ name: 'x', fromSnapshot: 'y' })
      ).rejects.toMatchObject({ code: 'NotSupported' });
    });
  });
});
