import { Storage } from '@storagesdk/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tigris } from '../../src/tigris/tigris.js';

const BUCKET = process.env.TIGRIS_BUCKET;
const ENDPOINT = process.env.TIGRIS_ENDPOINT;
const ACCESS_KEY_ID = process.env.TIGRIS_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.TIGRIS_SECRET_ACCESS_KEY;

// Live tests against a real Tigris bucket. Skip entirely when required
// env vars are missing or empty so contributors without credentials can
// still run the rest of the suite. CI sets `${{ secrets.X }}` even when
// the secret is undefined, which produces an empty string — `!truthy`
// covers both cases. `TIGRIS_ENDPOINT` is optional — when unset, the
// adapter falls back to the Tigris SDK's default endpoint.
const configured = Boolean(BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

const d = configured ? describe : describe.skip;

// Unique per-run prefix so concurrent test runs don't collide on shared
// objects. Cleanup happens in afterEach.
const RUN_PREFIX = `storagesdk-test-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const key = (k: string) => `${RUN_PREFIX}/${k}`;

const bodyText = (item: { body: Uint8Array }) =>
  new TextDecoder().decode(item.body);

d('tigris adapter', () => {
  let storage: Storage;
  let createdForks: string[] = [];

  beforeAll(() => {
    storage = new Storage({
      adapter: tigris({
        bucket: BUCKET as string,
        accessKeyId: ACCESS_KEY_ID as string,
        secretAccessKey: SECRET_ACCESS_KEY as string,
        ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
      }),
    });
  });

  afterEach(async () => {
    // Best-effort cleanup. List anything under our prefix, delete.
    try {
      let cursor: string | undefined;
      do {
        const page = await storage.list({
          prefix: `${RUN_PREFIX}/`,
          ...(cursor !== undefined ? { cursor } : {}),
        });
        for (const it of page.items) {
          await storage.delete(it.path).catch(() => {});
        }
        cursor = page.cursor;
      } while (cursor);
    } catch {
      /* swallow */
    }
    for (const name of createdForks) {
      await storage.forks.delete(name).catch(() => {});
    }
    createdForks = [];
  });

  describe('basic ops', () => {
    it('uploads and downloads a string body', async () => {
      await storage.upload(key('hello.txt'), 'hello, tigris');
      const item = await storage.download(key('hello.txt'));
      expect(bodyText(item)).toBe('hello, tigris');
      expect(item.size).toBe(13);
    });

    it('preserves contentType on head', async () => {
      await storage.upload(key('photo.jpg'), 'bytes', {
        contentType: 'image/jpeg',
      });
      const meta = await storage.head(key('photo.jpg'));
      expect(meta.contentType).toBe('image/jpeg');
    });

    it('throws NotFound for missing keys', async () => {
      await expect(storage.download(key('missing.jpg'))).rejects.toMatchObject({
        code: 'NotFound',
      });
      await expect(storage.head(key('missing.jpg'))).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('lists with prefix and paginates with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.upload(key(`photos/${i}.jpg`), String(i));
      }

      const filtered = await storage.list({ prefix: key('photos/') });
      expect(filtered.items.length).toBe(5);

      const page1 = await storage.list({ prefix: key('photos/'), limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.cursor).toBeDefined();
    });

    it('deletes a key', async () => {
      await storage.upload(key('photo.jpg'), 'bytes');
      await storage.delete(key('photo.jpg'));
      await expect(storage.head(key('photo.jpg'))).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('copies and moves keys server-side', async () => {
      await storage.upload(key('src.jpg'), 'data', {
        contentType: 'image/jpeg',
      });
      await storage.copy(key('src.jpg'), key('dst.jpg'));
      expect((await storage.head(key('dst.jpg'))).contentType).toBe(
        'image/jpeg'
      );

      await storage.move(key('dst.jpg'), key('final.jpg'));
      await expect(storage.head(key('dst.jpg'))).rejects.toMatchObject({
        code: 'NotFound',
      });
      expect((await storage.head(key('final.jpg'))).contentType).toBe(
        'image/jpeg'
      );
    });
  });

  describe('signed URLs', () => {
    it('signed GET URL returns the object content', async () => {
      await storage.upload(key('signed.txt'), 'signed-content');
      const url = await storage.url(key('signed.txt'), { expiresIn: 300 });
      expect(typeof url).toBe('string');
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('signed-content');
    });

    it('signed PUT URL works for upload', async () => {
      const signed = await storage.uploadUrl(key('uploaded.bin'), {
        expiresIn: 300,
      });
      expect(signed.method).toBe('PUT');
      const res = await fetch(signed.url, {
        method: 'PUT',
        body: 'uploaded-content',
      });
      expect(res.ok).toBe(true);
      const item = await storage.download(key('uploaded.bin'));
      expect(bodyText(item)).toBe('uploaded-content');
    });
  });

  describe('snapshots', () => {
    it('creates a snapshot and reads frozen content via get(id)', async () => {
      await storage.upload(key('s.txt'), 'before');
      const info = await storage.snapshots.create({ name: 'baseline' });
      expect(info.id).toBeTruthy();

      await storage.upload(key('s.txt'), 'after');

      const reader = storage.snapshots.get(info.id);
      expect(bodyText(await reader.download(key('s.txt')))).toBe('before');
      expect(bodyText(await storage.download(key('s.txt')))).toBe('after');
    });

    it('lists snapshots via the parent bucket', async () => {
      const before = (await storage.snapshots.list()).length;
      const info = await storage.snapshots.create({ name: 'list-test' });
      const after = await storage.snapshots.list();
      expect(after.length).toBe(before + 1);
      expect(after.find((s) => s.id === info.id)).toBeDefined();
    });

    it('deletes a snapshot via deleteBucketSnapshot', async () => {
      const info = await storage.snapshots.create({ name: 'delete-test' });

      const before = await storage.snapshots.list();
      expect(before.find((s) => s.id === info.id)).toBeDefined();

      await storage.snapshots.delete(info.id);

      const after = await storage.snapshots.list();
      expect(after.find((s) => s.id === info.id)).toBeUndefined();
    });

    it('snapshot reader url() returns a presigned URL scoped to the snapshot version', async () => {
      await storage.upload(key('snapurl.txt'), 'snapshot-bytes');
      const info = await storage.snapshots.create();

      // Mutate live so we can prove the URL points at the snapshot bytes.
      await storage.upload(key('snapurl.txt'), 'live-bytes');

      const reader = storage.snapshots.get(info.id);
      const url = await reader.url(key('snapurl.txt'), { expiresIn: 300 });
      expect(typeof url).toBe('string');

      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('snapshot-bytes');
    });
  });

  describe('forks', () => {
    it('creates a writable fork seeded from a snapshot', async () => {
      await storage.upload(key('orig.txt'), 'original');
      const snap = await storage.snapshots.create();

      const forkName = `${BUCKET}-${RUN_PREFIX}-f`.slice(0, 60);
      createdForks.push(forkName);
      await storage.forks.create({ name: forkName, fromSnapshot: snap.id });

      const fork = storage.forks.get(forkName);
      expect(bodyText(await fork.download(key('orig.txt')))).toBe('original');

      await fork.upload(key('orig.txt'), 'modified');
      expect(bodyText(await fork.download(key('orig.txt')))).toBe('modified');
      expect(bodyText(await storage.download(key('orig.txt')))).toBe(
        'original'
      );
    });

    it('creates a fork from the live parent bucket when fromSnapshot is omitted', async () => {
      await storage.upload(key('live.txt'), 'live');

      const forkName = `${BUCKET}-${RUN_PREFIX}-l`.slice(0, 60);
      createdForks.push(forkName);
      await storage.forks.create({ name: forkName });

      const fork = storage.forks.get(forkName);
      expect(bodyText(await fork.download(key('live.txt')))).toBe('live');
    });

    it('lists and heads forks via listForks', async () => {
      const forkName = `${BUCKET}-${RUN_PREFIX}-ls`.slice(0, 60);
      createdForks.push(forkName);
      await storage.forks.create({ name: forkName });

      const all = await storage.forks.list();
      expect(all.find((f) => f.name === forkName)).toBeDefined();

      const head = await storage.forks.head(forkName);
      expect(head.name).toBe(forkName);
    });

    it('forks.head throws NotFound for a missing fork name', async () => {
      await expect(
        storage.forks.head('definitely-not-a-fork')
      ).rejects.toMatchObject({ code: 'NotFound' });
    });
  });
});

if (!configured) {
  describe('tigris adapter (skipped)', () => {
    it('skipped: TIGRIS_BUCKET / TIGRIS_ACCESS_KEY_ID / TIGRIS_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
