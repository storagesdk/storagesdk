import { existsSync, readdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fs } from '../../src/fs/fs.js';
import {
  setupTestStorage,
  storageAdapterTestSuite,
} from '../../src/test-suite.js';

// `FS_TEST_ROOT` and `FS_TEST_FOLDER` are the FS adapter's equivalent of S3's
// bucket: the test treats them as pre-existing infrastructure. Root defaults
// to `os.tmpdir()` (always present); folder defaults to a fixed name so
// repeated runs land in the same workspace.
const FS_TEST_ROOT = process.env.FS_TEST_ROOT ?? os.tmpdir();
const FS_TEST_FOLDER = process.env.FS_TEST_FOLDER ?? 'storagesdk-test';

const buildAdapter = () => fs({ root: FS_TEST_ROOT, folder: FS_TEST_FOLDER });

storageAdapterTestSuite({
  name: 'fs adapter',
  adapter: buildAdapter,
  capabilities: {
    // fs `url()` returns `file://`, not fetchable via HTTP.
    fetchableSignedUrls: false,
  },
});

// FS-specific implementation details: sidecar files, path-traversal guards,
// file:// URL shape, on-disk layout. The shared suite covers behavior;
// this block covers how the FS adapter delivers it.
describe('fs adapter (implementation)', () => {
  const ctx = setupTestStorage(buildAdapter);

  describe('sidecar files', () => {
    it('persists contentType and metadata via sidecar', async () => {
      await ctx.upload('photo.jpg', 'x', {
        contentType: 'image/jpeg',
        metadata: { author: 'me' },
      });
      const meta = await ctx.head('photo.jpg');
      expect(meta.contentType).toBe('image/jpeg');
      expect(meta.metadata).toEqual({ author: 'me' });
    });

    it('does not write a sidecar when nothing non-default is provided', async () => {
      await ctx.upload('photo.jpg', 'x');
      const sidecar = path.join(
        FS_TEST_ROOT,
        FS_TEST_FOLDER,
        ctx.prefix,
        'photo.jpg.storagesdk.meta.json'
      );
      expect(existsSync(sidecar)).toBe(false);
    });

    it('filters reserved sidecar keys from list', async () => {
      await ctx.upload('a.jpg', 'a');
      await ctx.upload('b.jpg', 'b', { contentType: 'image/jpeg' });
      const { items } = await ctx.list();
      expect(items.map((i) => i.path).sort()).toEqual(['a.jpg', 'b.jpg']);
    });

    it('rejects upload to the sidecar suffix', async () => {
      await expect(
        ctx.upload('foo.storagesdk.meta.json', 'x')
      ).rejects.toMatchObject({ code: 'InvalidArgument' });
    });

    it('deletes a file and its sidecar together', async () => {
      await ctx.upload('photo.jpg', 'data', { contentType: 'image/jpeg' });
      await ctx.delete('photo.jpg');
      expect(
        existsSync(
          path.join(
            FS_TEST_ROOT,
            FS_TEST_FOLDER,
            ctx.prefix,
            'photo.jpg.storagesdk.meta.json'
          )
        )
      ).toBe(false);
      expect(
        existsSync(
          path.join(FS_TEST_ROOT, FS_TEST_FOLDER, ctx.prefix, 'photo.jpg')
        )
      ).toBe(false);
    });

    it('clears the destination sidecar on copy when the source has none', async () => {
      await ctx.upload('dst.jpg', 'old', { contentType: 'image/jpeg' });
      await ctx.upload('src.jpg', 'new');
      await ctx.copy('src.jpg', 'dst.jpg');

      const dst = await ctx.head('dst.jpg');
      expect(dst.contentType).toBe('application/octet-stream');
      expect(dst.metadata).toBeUndefined();
      expect(
        existsSync(
          path.join(
            FS_TEST_ROOT,
            FS_TEST_FOLDER,
            ctx.prefix,
            'dst.jpg.storagesdk.meta.json'
          )
        )
      ).toBe(false);
    });

    it('clears the destination sidecar on move when the source has none', async () => {
      await ctx.upload('dst.jpg', 'old', { contentType: 'image/jpeg' });
      await ctx.upload('src.jpg', 'new');
      await ctx.move('src.jpg', 'dst.jpg');

      const dst = await ctx.head('dst.jpg');
      expect(dst.contentType).toBe('application/octet-stream');
      expect(
        existsSync(
          path.join(
            FS_TEST_ROOT,
            FS_TEST_FOLDER,
            ctx.prefix,
            'dst.jpg.storagesdk.meta.json'
          )
        )
      ).toBe(false);
    });
  });

  describe('path validation', () => {
    it('rejects path traversal in upload', async () => {
      // The wrapper prefixes with a single segment, so we need enough `..`
      // to escape both the prefix and the folder. `../../escape.txt`
      // becomes `<prefix>/../../escape.txt` which still resolves above the
      // adapter's root.
      await expect(ctx.upload('../../escape.txt', 'x')).rejects.toMatchObject({
        code: 'InvalidArgument',
      });
    });

    it('rejects path traversal in forks.create', async () => {
      await ctx.upload('a.jpg', 'a');
      const snap = await ctx.snapshots.create();
      await expect(
        ctx.forks.create({ name: '../escape', fromSnapshot: snap.id })
      ).rejects.toMatchObject({ code: 'InvalidArgument' });
    });

    it('rejects path traversal in forks.delete', async () => {
      await expect(ctx.forks.delete('../escape')).rejects.toMatchObject({
        code: 'InvalidArgument',
      });
    });

    it('rejects path traversal in forks.get', () => {
      expect(() => ctx.forks.get('../escape')).toThrowError(
        /invalid sibling name/
      );
    });

    it('rejects path traversal in snapshots.delete and snapshots.get', async () => {
      await expect(ctx.snapshots.delete('../escape')).rejects.toMatchObject({
        code: 'InvalidArgument',
      });
      expect(() => ctx.snapshots.get('../escape')).toThrowError(
        /invalid sibling name/
      );
    });

    it('rejects sibling names with path separators', async () => {
      await ctx.upload('a.jpg', 'a');
      const snap = await ctx.snapshots.create();
      await expect(
        ctx.forks.create({ name: 'foo/bar', fromSnapshot: snap.id })
      ).rejects.toMatchObject({ code: 'InvalidArgument' });
    });

    it('rejects empty, ".", and ".."', async () => {
      for (const bad of ['', '.', '..']) {
        await expect(ctx.forks.delete(bad)).rejects.toMatchObject({
          code: 'InvalidArgument',
        });
      }
    });
  });

  describe('file:// URLs', () => {
    it('url returns a file:// URL that round-trips to the absolute path', async () => {
      await ctx.upload('photo.jpg', 'x');
      const url = await ctx.url('photo.jpg');
      expect(url.startsWith('file:///')).toBe(true);
      const absolute = path.join(
        FS_TEST_ROOT,
        FS_TEST_FOLDER,
        ctx.prefix,
        'photo.jpg'
      );
      expect(fileURLToPath(url)).toBe(absolute);
      const noQuery = url.split('?')[0];
      expect(noQuery).toBe(pathToFileURL(absolute).toString());
    });

    it('encodes expires when expiresIn is set', async () => {
      await ctx.upload('photo.jpg', 'x');
      const url = await ctx.url('photo.jpg', { expiresIn: 3600 });
      expect(url).toMatch(/[?&]expires=\d+/);
    });

    it('uploadUrl returns a file:// URL with PUT', async () => {
      const signed = await ctx.uploadUrl('new.jpg', { expiresIn: 3600 });
      expect(signed.method).toBe('PUT');
      expect(signed.url.startsWith('file:///')).toBe(true);
    });

    it('url throws NotFound for missing keys', async () => {
      // FS checks existence on url(); HTTP-based adapters sign blindly.
      await expect(ctx.url('missing.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });
  });

  describe('on-disk layout', () => {
    it('snapshots.create materializes a sibling folder with copied contents', async () => {
      await ctx.upload('a.jpg', 'a');
      await ctx.upload('b.jpg', 'b');
      const info = await ctx.snapshots.create({ name: 'baseline' });
      expect(existsSync(path.join(FS_TEST_ROOT, info.id))).toBe(true);
      expect(
        existsSync(path.join(FS_TEST_ROOT, info.id, ctx.prefix, 'a.jpg'))
      ).toBe(true);
    });

    it('snapshots.delete removes the sibling folder', async () => {
      await ctx.upload('a.jpg', 'a');
      const info = await ctx.snapshots.create();
      await ctx.snapshots.delete(info.id);
      expect(existsSync(path.join(FS_TEST_ROOT, info.id))).toBe(false);
    });

    it('forks.delete removes the sibling folder', async () => {
      await ctx.upload('a.jpg', 'a');
      const snap = await ctx.snapshots.create();
      const name = ctx.forkName('rm');
      await ctx.forks.create({ name, fromSnapshot: snap.id });
      await ctx.forks.delete(name);
      expect(existsSync(path.join(FS_TEST_ROOT, name))).toBe(false);
    });
  });

  describe('streaming upload', () => {
    // Build a ReadableStream that emits each chunk on a separate `pull` so
    // the adapter genuinely streams rather than seeing one buffer.
    function multiChunkStream(
      chunks: Uint8Array[]
    ): ReadableStream<Uint8Array> {
      let i = 0;
      return new ReadableStream({
        pull(controller) {
          const chunk = chunks[i++];
          if (chunk !== undefined) {
            controller.enqueue(chunk);
          } else {
            controller.close();
          }
        },
      });
    }

    const enc = new TextEncoder();

    it('streams a multi-chunk ReadableStream to disk and round-trips bytes', async () => {
      const chunks = ['chunk-one-', 'chunk-two-', 'chunk-three'].map((s) =>
        enc.encode(s)
      );
      const expected = enc.encode('chunk-one-chunk-two-chunk-three');

      await ctx.upload('streamed.bin', multiChunkStream(chunks));

      const bytes = await ctx.download('streamed.bin', { as: 'bytes' });
      expect(bytes).toEqual(expected);
      const meta = await ctx.head('streamed.bin');
      expect(meta.size).toBe(expected.byteLength);
    });

    it('leaves no temp file behind and never surfaces one in list', async () => {
      await ctx.upload('clean.bin', multiChunkStream([enc.encode('payload')]));

      const dir = path.join(FS_TEST_ROOT, FS_TEST_FOLDER, ctx.prefix);
      const onDisk = readdirSync(dir);
      expect(onDisk.some((n) => n.endsWith('.storagesdk.tmp'))).toBe(false);

      const { items } = await ctx.list();
      expect(items.map((i) => i.path)).toEqual(['clean.bin']);
    });

    it('rejects upload to the temp suffix', async () => {
      await expect(ctx.upload('foo.storagesdk.tmp', 'x')).rejects.toMatchObject(
        { code: 'InvalidArgument' }
      );
    });

    it('cleans up the temp file when the upload is aborted mid-stream', async () => {
      const ctrl = new AbortController();
      // A stream whose second pull never resolves; abort fires while the
      // write is in flight, so the temp file exists but the rename never runs.
      const stalling = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(enc.encode('first-chunk'));
          ctrl.abort();
          return new Promise<void>(() => {});
        },
      });

      await expect(
        ctx.upload('aborted.bin', stalling, { signal: ctrl.signal })
      ).rejects.toMatchObject({ code: 'Aborted' });

      const dir = path.join(FS_TEST_ROOT, FS_TEST_FOLDER, ctx.prefix);
      const leftovers = existsSync(dir)
        ? readdirSync(dir).filter((n) => n.endsWith('.storagesdk.tmp'))
        : [];
      expect(leftovers).toEqual([]);
    });
  });
});
