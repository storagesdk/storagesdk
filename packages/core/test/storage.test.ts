import { beforeEach, describe, expect, it } from 'vitest';
import { StorageError } from '../src/errors.js';
import { Storage } from '../src/storage.js';
import type { StorageItem } from '../src/types.js';
import { inMemoryAdapter } from './in-memory-adapter.js';

const bodyText = (item: StorageItem) => new TextDecoder().decode(item.body);

describe('Storage', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new Storage({ adapter: inMemoryAdapter() });
  });

  describe('upload and download', () => {
    it('round-trips a string', async () => {
      const written = await storage.upload('hello.txt', 'hello world');
      expect(written.path).toBe('hello.txt');
      expect(written.size).toBe('hello world'.length);

      const item = await storage.download('hello.txt');
      expect(bodyText(item)).toBe('hello world');
    });

    it('returns a stream when requested', async () => {
      await storage.upload('a.txt', 'streamed');
      const stream = await storage.download('a.txt', { as: 'stream' });
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        chunks.push(r.value);
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      expect(total).toBe('streamed'.length);
    });

    it('records contentType and metadata', async () => {
      await storage.upload('photo.jpg', 'bytes', {
        contentType: 'image/jpeg',
        metadata: { author: 'a' },
      });
      const item = await storage.download('photo.jpg');
      expect(item.contentType).toBe('image/jpeg');
      expect(item.metadata).toEqual({ author: 'a' });
    });

    it('returns text via as: text', async () => {
      await storage.upload('a.txt', 'hello');
      const text = await storage.download('a.txt', { as: 'text' });
      expect(text).toBe('hello');
    });

    it('returns bytes via as: bytes', async () => {
      await storage.upload('a.bin', new Uint8Array([1, 2, 3]));
      const bytes = await storage.download('a.bin', { as: 'bytes' });
      expect(Array.from(bytes)).toEqual([1, 2, 3]);
    });

    it('returns blob via as: blob', async () => {
      await storage.upload('a.txt', 'blob-me');
      const blob = await storage.download('a.txt', { as: 'blob' });
      expect(await blob.text()).toBe('blob-me');
    });

    it('returns json via as: json', async () => {
      await storage.upload('a.json', JSON.stringify({ x: 1 }));
      const data = (await storage.download('a.json', { as: 'json' })) as {
        x: number;
      };
      expect(data.x).toBe(1);
    });

    it('throws NotFound for missing keys', async () => {
      await expect(storage.download('nope')).rejects.toBeInstanceOf(
        StorageError
      );
      await expect(storage.download('nope')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });
  });

  describe('head', () => {
    it('returns metadata without consuming the body', async () => {
      await storage.upload('x', 'data');
      const item = await storage.head('x');
      expect(item.size).toBe(4);
      expect(item.path).toBe('x');
    });
  });

  describe('list', () => {
    it('filters by prefix', async () => {
      await storage.upload('photos/a.jpg', 'a');
      await storage.upload('photos/b.jpg', 'b');
      await storage.upload('videos/c.mp4', 'c');

      const { items } = await storage.list({ prefix: 'photos/' });
      expect(items.map((i) => i.path)).toEqual([
        'photos/a.jpg',
        'photos/b.jpg',
      ]);
    });

    it('normalizes a leading slash in prefix', async () => {
      await storage.upload('/photos/a.jpg', 'a');
      await storage.upload('photos/b.jpg', 'b');

      const slashed = await storage.list({ prefix: '/photos/' });
      const clean = await storage.list({ prefix: 'photos/' });
      expect(slashed.items.map((i) => i.path)).toEqual(
        clean.items.map((i) => i.path)
      );
      expect(slashed.items.length).toBe(2);
    });

    it('paginates with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.upload(`k${i}`, String(i));
      }

      const page1 = await storage.list({ limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.cursor).toBeDefined();

      const cursor = page1.cursor;
      if (cursor === undefined) throw new Error('cursor not set');
      const page2 = await storage.list({ limit: 2, cursor });
      expect(page2.items.length).toBe(2);
      expect(page2.items[0]?.path).not.toBe(page1.items[0]?.path);
    });
  });

  describe('delete, copy, move', () => {
    it('deletes', async () => {
      await storage.upload('a', '1');
      await storage.delete('a');
      await expect(storage.head('a')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('copies', async () => {
      await storage.upload('a', '1');
      await storage.copy('a', 'b');
      expect(bodyText(await storage.download('b'))).toBe('1');
      // source still exists
      expect(bodyText(await storage.download('a'))).toBe('1');
    });

    it('moves', async () => {
      await storage.upload('a', '1');
      await storage.move('a', 'b');
      expect(bodyText(await storage.download('b'))).toBe('1');
      await expect(storage.head('a')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });
  });

  describe('paths', () => {
    it('normalizes leading slashes', async () => {
      await storage.upload('/with-slash', 'x');
      // without leading slash should find the same key
      expect(bodyText(await storage.download('with-slash'))).toBe('x');
    });

    it('rejects empty paths', async () => {
      await expect(storage.upload('', 'x')).rejects.toMatchObject({
        code: 'InvalidArgument',
      });
    });
  });

  describe('signed URLs', () => {
    it('returns url() from the adapter', async () => {
      await storage.upload('a', 'x');
      const u = await storage.url('a');
      expect(u).toContain('a');
    });

    it('returns an uploadUrl contract', async () => {
      const u = await storage.uploadUrl('a');
      expect(u.method).toBe('PUT');
      expect(u.url).toContain('a');
    });
  });

  describe('snapshots', () => {
    it('creates a snapshot and reads it back via get(id)', async () => {
      await storage.upload('a', 'v1');
      const info = await storage.snapshots.create({ name: 'before' });
      expect(typeof info.id).toBe('string');
      expect(info.name).toBe('before');

      await storage.upload('a', 'v2');

      const reader = storage.snapshots.get(info.id);
      expect(bodyText(await reader.download('a'))).toBe('v1');
      expect(bodyText(await storage.download('a'))).toBe('v2');
    });

    it('reader supports download overloads', async () => {
      await storage.upload('a.txt', 'hello');
      const info = await storage.snapshots.create();
      const reader = storage.snapshots.get(info.id);
      expect(await reader.download('a.txt', { as: 'text' })).toBe('hello');
    });

    it('lists snapshots', async () => {
      await storage.upload('a', 'x');
      await storage.snapshots.create({ name: 's1' });
      await storage.snapshots.create({ name: 's2' });
      const list = await storage.snapshots.list();
      expect(list.length).toBe(2);
    });

    it('head returns info for a snapshot', async () => {
      await storage.upload('a', 'x');
      const info = await storage.snapshots.create({ name: 's1' });
      const fetched = await storage.snapshots.head(info.id);
      expect(fetched.id).toBe(info.id);
      expect(fetched.name).toBe('s1');
    });

    it('deletes a snapshot', async () => {
      await storage.upload('a', 'x');
      const info = await storage.snapshots.create();
      await storage.snapshots.delete(info.id);
      expect((await storage.snapshots.list()).length).toBe(0);
    });
  });

  describe('forks', () => {
    it('creates a fork and reads/writes via get(name)', async () => {
      await storage.upload('a', 'parent');
      const snap = await storage.snapshots.create();
      const forkInfo = await storage.forks.create({
        name: 'exp',
        fromSnapshot: snap.id,
      });
      expect(forkInfo.name).toBe('exp');
      expect(forkInfo.fromSnapshot).toBe(snap.id);

      const fork = storage.forks.get('exp');
      expect(fork).toBeInstanceOf(Storage);
      expect(bodyText(await fork.download('a'))).toBe('parent');

      // mutations on the fork don't affect the source
      await fork.upload('a', 'fork-changed');
      expect(bodyText(await storage.download('a'))).toBe('parent');
    });

    it('lists forks', async () => {
      await storage.upload('a', 'x');
      const snap = await storage.snapshots.create();
      await storage.forks.create({ name: 'one', fromSnapshot: snap.id });
      await storage.forks.create({ name: 'two', fromSnapshot: snap.id });
      const list = await storage.forks.list();
      expect(list.map((f) => f.name).sort()).toEqual(['one', 'two']);
    });

    it('head returns info for a fork', async () => {
      await storage.upload('a', 'x');
      const snap = await storage.snapshots.create();
      await storage.forks.create({ name: 'exp', fromSnapshot: snap.id });
      const info = await storage.forks.head('exp');
      expect(info.name).toBe('exp');
      expect(info.fromSnapshot).toBe(snap.id);
    });

    it('deletes a fork', async () => {
      await storage.upload('a', 'x');
      const snap = await storage.snapshots.create();
      await storage.forks.create({ name: 'exp', fromSnapshot: snap.id });
      await storage.forks.delete('exp');
      expect((await storage.forks.list()).length).toBe(0);
    });
  });

  describe('escape hatch', () => {
    it('exposes raw', () => {
      expect(storage.raw).toBeDefined();
    });
  });
});
