import { existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Storage } from '@storagesdk/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fs } from '../../src/fs/fs.js';

const bodyText = (item: { body: Uint8Array }) =>
  new TextDecoder().decode(item.body);

describe('fs adapter', () => {
  let root: string;
  let storage: Storage;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'storagesdk-fs-'));
    storage = new Storage({ adapter: fs({ root, folder: 'photos' }) });
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  describe('basic ops', () => {
    it('uploads and downloads a string body', async () => {
      await storage.upload('photo.jpg', 'hello');
      const item = await storage.download('photo.jpg');
      expect(bodyText(item)).toBe('hello');
      expect(item.size).toBe(5);
    });

    it('persists contentType and metadata via sidecar', async () => {
      await storage.upload('photo.jpg', 'x', {
        contentType: 'image/jpeg',
        metadata: { author: 'me' },
      });
      const meta = await storage.head('photo.jpg');
      expect(meta.contentType).toBe('image/jpeg');
      expect(meta.metadata).toEqual({ author: 'me' });
    });

    it('does not write a sidecar when nothing non-default is provided', async () => {
      await storage.upload('photo.jpg', 'x');
      const sidecarFile = path.join(
        root,
        'photos',
        'photo.jpg.storagesdk.meta.json'
      );
      expect(existsSync(sidecarFile)).toBe(false);
    });

    it('filters reserved keys from list', async () => {
      await storage.upload('a.jpg', 'a');
      await storage.upload('b.jpg', 'b', { contentType: 'image/jpeg' });
      const { items } = await storage.list();
      expect(items.map((i) => i.path).sort()).toEqual(['a.jpg', 'b.jpg']);
    });

    it('rejects upload to the sidecar suffix', async () => {
      await expect(
        storage.upload('foo.storagesdk.meta.json', 'x')
      ).rejects.toMatchObject({ code: 'InvalidArgument' });
    });

    it('rejects path traversal', async () => {
      await expect(storage.upload('../escape.txt', 'x')).rejects.toMatchObject({
        code: 'InvalidArgument',
      });
    });

    it('throws NotFound for missing keys', async () => {
      await expect(storage.download('missing.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
      await expect(storage.head('missing.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('copies and moves files with their sidecars', async () => {
      await storage.upload('src.jpg', 'data', {
        contentType: 'image/jpeg',
      });
      await storage.copy('src.jpg', 'dst.jpg');
      const dst = await storage.head('dst.jpg');
      expect(dst.contentType).toBe('image/jpeg');

      await storage.move('dst.jpg', 'final.jpg');
      await expect(storage.head('dst.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
      const final = await storage.head('final.jpg');
      expect(final.contentType).toBe('image/jpeg');
    });

    it('deletes a file and its sidecar', async () => {
      await storage.upload('photo.jpg', 'data', {
        contentType: 'image/jpeg',
      });
      await storage.delete('photo.jpg');
      const sidecarFile = path.join(
        root,
        'photos',
        'photo.jpg.storagesdk.meta.json'
      );
      expect(existsSync(sidecarFile)).toBe(false);
      expect(existsSync(path.join(root, 'photos', 'photo.jpg'))).toBe(false);
    });

    it('paginates with prefix and cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await storage.upload(`photos/${i}.jpg`, String(i));
      }
      const page1 = await storage.list({ prefix: 'photos/', limit: 2 });
      expect(page1.items.length).toBe(2);
      const cursor = page1.cursor;
      if (cursor === undefined) throw new Error('cursor not set');
      const page2 = await storage.list({
        prefix: 'photos/',
        limit: 2,
        cursor,
      });
      expect(page2.items[0]?.path).not.toBe(page1.items[0]?.path);
    });
  });

  describe('url and uploadUrl', () => {
    it('returns a file:// URL that round-trips back to the absolute path', async () => {
      await storage.upload('photo.jpg', 'x');
      const url = await storage.url('photo.jpg');
      expect(url.startsWith('file:///')).toBe(true);
      const absolute = path.join(root, 'photos', 'photo.jpg');
      expect(fileURLToPath(url)).toBe(absolute);
      // Sanity: the canonical conversion matches what we returned (modulo
      // optional query params). Drops query before comparison.
      const noQuery = url.split('?')[0];
      expect(noQuery).toBe(pathToFileURL(absolute).toString());
    });

    it('encodes expires when expiresIn is set', async () => {
      await storage.upload('photo.jpg', 'x');
      const url = await storage.url('photo.jpg', { expiresIn: 3600 });
      expect(url).toMatch(/[?&]expires=\d+/);
    });

    it('uploadUrl returns the same shape', async () => {
      const signed = await storage.uploadUrl('new.jpg', { expiresIn: 3600 });
      expect(signed.method).toBe('PUT');
      expect(signed.url.startsWith('file:///')).toBe(true);
    });

    it('url throws NotFound for missing keys', async () => {
      await expect(storage.url('missing.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });
  });

  describe('snapshots', () => {
    it('creates a sibling folder with copied contents', async () => {
      await storage.upload('a.jpg', 'a');
      await storage.upload('b.jpg', 'b');
      const info = await storage.snapshots.create({ name: 'baseline' });
      const snapPath = path.join(root, info.id);
      expect(existsSync(snapPath)).toBe(true);
      expect(existsSync(path.join(snapPath, 'a.jpg'))).toBe(true);
    });

    it('reads frozen content through snapshots.get', async () => {
      await storage.upload('photo.jpg', 'before');
      const info = await storage.snapshots.create();
      await storage.upload('photo.jpg', 'after');
      const reader = storage.snapshots.get(info.id);
      const item = await reader.download('photo.jpg');
      expect(bodyText(item)).toBe('before');
    });

    it('lists, heads, and deletes snapshots via the manifest', async () => {
      await storage.upload('a.jpg', 'a');
      const info = await storage.snapshots.create({ name: 'one' });
      expect((await storage.snapshots.list()).length).toBe(1);
      expect((await storage.snapshots.head(info.id)).name).toBe('one');
      await storage.snapshots.delete(info.id);
      expect((await storage.snapshots.list()).length).toBe(0);
      expect(existsSync(path.join(root, info.id))).toBe(false);
    });

    it('list({ limit }) returns full pages even when the manifest is present', async () => {
      // Five real entries plus the manifest written by snapshots.create.
      // Without pre-pagination filtering the first page could come back
      // short by one item when the manifest sorts into the slice window.
      for (let i = 0; i < 5; i++) {
        await storage.upload(`k${i}.txt`, String(i));
      }
      await storage.snapshots.create();

      const page1 = await storage.list({ limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.cursor).toBeDefined();

      const cursor = page1.cursor;
      if (cursor === undefined) throw new Error('cursor not set');
      const page2 = await storage.list({ limit: 2, cursor });
      expect(page2.items.length).toBe(2);
    });
  });

  describe('forks', () => {
    it('creates a writable fork seeded from a snapshot', async () => {
      await storage.upload('photo.jpg', 'original');
      const snap = await storage.snapshots.create();
      await storage.forks.create({
        name: 'photos-exp',
        fromSnapshot: snap.id,
      });

      const fork = storage.forks.get('photos-exp');
      const original = await fork.download('photo.jpg');
      expect(bodyText(original)).toBe('original');

      await fork.upload('photo.jpg', 'modified');
      const modified = await fork.download('photo.jpg');
      expect(bodyText(modified)).toBe('modified');

      // Parent unchanged
      const parent = await storage.download('photo.jpg');
      expect(bodyText(parent)).toBe('original');
    });

    it('creates a fork from the live parent when fromSnapshot is omitted', async () => {
      await storage.upload('a.jpg', 'live');
      await storage.forks.create({ name: 'live-fork' });

      const fork = storage.forks.get('live-fork');
      expect(bodyText(await fork.download('a.jpg'))).toBe('live');

      const info = await storage.forks.head('live-fork');
      expect(info.fromSnapshot).toBeUndefined();
    });

    it('throws Conflict when a fork name already exists', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();
      await storage.forks.create({ name: 'twin', fromSnapshot: snap.id });
      await expect(
        storage.forks.create({ name: 'twin', fromSnapshot: snap.id })
      ).rejects.toMatchObject({ code: 'Conflict' });
    });

    it('throws NotFound when forks.get is called on a missing fork', () => {
      expect(() => storage.forks.get('nonexistent')).toThrowError(/not found/);
    });

    it('supports nested snapshots and forks on a fork', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();
      await storage.forks.create({ name: 'child', fromSnapshot: snap.id });

      const child = storage.forks.get('child');
      await child.upload('b.jpg', 'b');
      const childSnap = await child.snapshots.create({ name: 'child-snap' });

      const childSnaps = await child.snapshots.list();
      expect(childSnaps.length).toBe(1);
      expect(childSnaps[0]?.name).toBe('child-snap');
      expect(existsSync(path.join(root, childSnap.id))).toBe(true);
    });

    it('lists, heads, and deletes forks via the manifest', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();
      await storage.forks.create({ name: 'fork-one', fromSnapshot: snap.id });
      expect((await storage.forks.list()).length).toBe(1);
      expect((await storage.forks.head('fork-one')).fromSnapshot).toBe(snap.id);
      await storage.forks.delete('fork-one');
      expect((await storage.forks.list()).length).toBe(0);
      expect(existsSync(path.join(root, 'fork-one'))).toBe(false);
    });
  });

  describe('sibling-name validation', () => {
    it('rejects path traversal in forks.create', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();
      await expect(
        storage.forks.create({ name: '../escape', fromSnapshot: snap.id })
      ).rejects.toMatchObject({ code: 'InvalidArgument' });
    });

    it('rejects path traversal in forks.delete', async () => {
      await expect(storage.forks.delete('../escape')).rejects.toMatchObject({
        code: 'InvalidArgument',
      });
    });

    it('rejects path traversal in forks.get', () => {
      expect(() => storage.forks.get('../escape')).toThrowError(
        /invalid sibling name/
      );
    });

    it('rejects path traversal in snapshots.delete and snapshots.get', async () => {
      await expect(storage.snapshots.delete('../escape')).rejects.toMatchObject(
        { code: 'InvalidArgument' }
      );
      expect(() => storage.snapshots.get('../escape')).toThrowError(
        /invalid sibling name/
      );
    });

    it('rejects names with path separators', async () => {
      await storage.upload('a.jpg', 'a');
      const snap = await storage.snapshots.create();
      await expect(
        storage.forks.create({ name: 'foo/bar', fromSnapshot: snap.id })
      ).rejects.toMatchObject({ code: 'InvalidArgument' });
    });

    it('rejects empty, ".", and ".."', async () => {
      for (const bad of ['', '.', '..']) {
        await expect(storage.forks.delete(bad)).rejects.toMatchObject({
          code: 'InvalidArgument',
        });
      }
    });
  });

  describe('sidecar cleanup on copy/move', () => {
    it('clears the destination sidecar when the source has none', async () => {
      // dst starts with a sidecar (from an old upload with contentType set).
      await storage.upload('dst.jpg', 'old', { contentType: 'image/jpeg' });
      // src has no sidecar (default contentType, no metadata).
      await storage.upload('src.jpg', 'new');

      await storage.copy('src.jpg', 'dst.jpg');

      const dst = await storage.head('dst.jpg');
      expect(dst.contentType).toBe('application/octet-stream');
      expect(dst.metadata).toBeUndefined();
      // Sidecar file should be gone.
      expect(
        existsSync(path.join(root, 'photos', 'dst.jpg.storagesdk.meta.json'))
      ).toBe(false);
    });

    it('clears the destination sidecar on move when the source has none', async () => {
      await storage.upload('dst.jpg', 'old', { contentType: 'image/jpeg' });
      await storage.upload('src.jpg', 'new');

      await storage.move('src.jpg', 'dst.jpg');

      const dst = await storage.head('dst.jpg');
      expect(dst.contentType).toBe('application/octet-stream');
      expect(
        existsSync(path.join(root, 'photos', 'dst.jpg.storagesdk.meta.json'))
      ).toBe(false);
    });
  });
});
