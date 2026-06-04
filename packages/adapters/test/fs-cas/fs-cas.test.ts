import { createHash } from 'node:crypto';
import { type Dirent, existsSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fsCas } from '../../src/fs-cas/fs-cas.js';
import {
  setupTestStorage,
  storageAdapterTestSuite,
} from '../../src/test-suite.js';

// Like FS_TEST_ROOT for the fs adapter, the store root is treated as
// pre-existing infrastructure. Defaults to a tmpdir subfolder distinct from
// the fs adapter's so the two suites never share a workspace.
const FS_CAS_TEST_ROOT =
  process.env.FS_CAS_TEST_ROOT ??
  path.join(os.tmpdir(), 'storagesdk-fs-cas-test');
const FS_CAS_TEST_BUCKET = process.env.FS_CAS_TEST_BUCKET ?? 'storagesdk-test';

const buildAdapter = () =>
  fsCas({ root: FS_CAS_TEST_ROOT, bucket: FS_CAS_TEST_BUCKET });

const hashOf = (content: string): string =>
  createHash('blake2b512').update(content).digest('hex');

/** Where a given content string must land on disk: data/<hh>/<rest>. */
const blobPath = (content: string): string => {
  const h = hashOf(content);
  return path.join(FS_CAS_TEST_ROOT, 'data', h.slice(0, 2), h.slice(2));
};

/** A bucket's folder: buckets/<name>. */
const bucketDir = (name: string): string =>
  path.join(FS_CAS_TEST_ROOT, 'buckets', name);

const text = (item: { body: Uint8Array }): string =>
  new TextDecoder().decode(item.body);

storageAdapterTestSuite({
  name: 'fs-cas adapter',
  adapter: buildAdapter,
  capabilities: {
    // The blob path is unknowable before the bytes arrive (it IS their
    // hash), so presigned uploads are impossible. url() returns file://.
    presignedUploads: false,
    fetchableSignedUrls: false,
  },
});

// fs-cas-specific implementation details: content-addressed blob layout,
// dedup, sweep-on-delete reclamation, metadata-only snapshots and forks.
// The shared suite covers behavior; this block covers how fs-cas delivers it.
describe('fs-cas adapter (implementation)', () => {
  const ctx = setupTestStorage(buildAdapter);

  // Per-test unique content so blob-path assertions can't collide with
  // leftovers from other tests (or crashed earlier runs) in the shared store.
  const unique = (tag: string): string => `${tag}-${ctx.prefix}`;

  describe('content-addressed layout', () => {
    it('stores blobs at data/<hh>/<rest> by blake2b512', async () => {
      const content = unique('layout');
      await ctx.upload('a.txt', content);
      expect(existsSync(blobPath(content))).toBe(true);
    });

    it('uses the content hash as the etag', async () => {
      const content = unique('etag');
      await ctx.upload('a.txt', content);
      const meta = await ctx.head('a.txt');
      expect(meta.etag).toBe(hashOf(content));
    });

    it('writes bucket.json under buckets/<name>/', async () => {
      await ctx.upload('a.txt', unique('bucket-json'));
      expect(
        existsSync(path.join(bucketDir(FS_CAS_TEST_BUCKET), 'bucket.json'))
      ).toBe(true);
    });

    it('stores snapshots as JSON files under buckets/<name>/snapshots/', async () => {
      await ctx.upload('a.txt', unique('snap-json'));
      const info = await ctx.snapshots.create({ name: 'baseline' });
      const snapFile = path.join(
        bucketDir(FS_CAS_TEST_BUCKET),
        'snapshots',
        `${info.id}.json`
      );
      expect(existsSync(snapFile)).toBe(true);
      await ctx.snapshots.delete(info.id);
      expect(existsSync(snapFile)).toBe(false);
    });

    it('leaves tmp/ empty after operations', async () => {
      await ctx.upload('a.txt', unique('tmp'), { contentType: 'text/plain' });
      await ctx.snapshots.create();
      const tmpDir = path.join(FS_CAS_TEST_ROOT, 'tmp');
      const leftovers = existsSync(tmpDir) ? await fsp.readdir(tmpDir) : [];
      expect(leftovers).toEqual([]);
    });
  });

  describe('dedup', () => {
    it('two keys with identical content share one blob', async () => {
      const content = unique('dedup');
      await ctx.upload('one.txt', content);
      const first = await fsp.stat(blobPath(content));
      await ctx.upload('two.txt', content);
      const second = await fsp.stat(blobPath(content));
      // The second upload reuses the existing blob instead of rewriting it.
      expect(second.mtimeMs).toBe(first.mtimeMs);
      expect(text(await ctx.download('two.txt'))).toBe(content);
    });

    it('keys with the same content keep distinct metadata', async () => {
      const content = unique('meta-distinct');
      await ctx.upload('a.json', content, { contentType: 'application/json' });
      await ctx.upload('a.txt', content, {
        contentType: 'text/plain',
        metadata: { kind: 'note' },
      });
      expect((await ctx.head('a.json')).contentType).toBe('application/json');
      const txt = await ctx.head('a.txt');
      expect(txt.contentType).toBe('text/plain');
      expect(txt.metadata).toEqual({ kind: 'note' });
      expect((await ctx.head('a.json')).metadata).toBeUndefined();
    });
  });

  describe('sweep-on-delete reclamation', () => {
    it('deleting the only reference removes the blob', async () => {
      const content = unique('sweep-solo');
      await ctx.upload('solo.txt', content);
      expect(existsSync(blobPath(content))).toBe(true);
      await ctx.delete('solo.txt');
      expect(existsSync(blobPath(content))).toBe(false);
    });

    it('keeps the blob while another key still references it', async () => {
      const content = unique('sweep-shared');
      await ctx.upload('src.txt', content);
      await ctx.copy('src.txt', 'dst.txt');
      await ctx.delete('src.txt');
      expect(existsSync(blobPath(content))).toBe(true);
      await ctx.delete('dst.txt');
      expect(existsSync(blobPath(content))).toBe(false);
    });

    it('overwriting a key sweeps the displaced blob', async () => {
      const v1 = unique('overwrite-1');
      const v2 = unique('overwrite-2');
      await ctx.upload('k.txt', v1);
      await ctx.upload('k.txt', v2);
      expect(existsSync(blobPath(v1))).toBe(false);
      expect(existsSync(blobPath(v2))).toBe(true);
    });

    it('a snapshot reference keeps a blob alive until the snapshot is deleted', async () => {
      const before = unique('frozen-before');
      const after = unique('frozen-after');
      await ctx.upload('s.txt', before);
      const snap = await ctx.snapshots.create();
      await ctx.upload('s.txt', after);
      // The snapshot still references the original blob.
      expect(existsSync(blobPath(before))).toBe(true);
      expect(existsSync(blobPath(after))).toBe(true);
      await ctx.snapshots.delete(snap.id);
      expect(existsSync(blobPath(before))).toBe(false);
    });
  });

  describe('metadata-only snapshots and forks', () => {
    it('forking copies no blob data', async () => {
      const content = unique('fork-share');
      await ctx.upload('a.txt', content);
      const snap = await ctx.snapshots.create();
      const dataDir = path.join(FS_CAS_TEST_ROOT, 'data');
      const before = await countFiles(dataDir);
      const name = ctx.forkName('cheap');
      await ctx.forks.create({ name, fromSnapshot: snap.id });
      expect(await countFiles(dataDir)).toBe(before);
      expect(existsSync(path.join(bucketDir(name), 'bucket.json'))).toBe(true);
      const fork = ctx.forks.get(name);
      expect(text(await fork.download('a.txt'))).toBe(content);
    });

    it('forks.delete removes the fork bucket dir and sweeps fork-only blobs', async () => {
      const name = ctx.forkName('rm');
      await ctx.forks.create({ name });
      const fork = ctx.forks.get(name);
      const content = unique('fork-only');
      await fork.upload('only.txt', content);
      expect(existsSync(blobPath(content))).toBe(true);
      await ctx.forks.delete(name);
      expect(existsSync(bucketDir(name))).toBe(false);
      expect(existsSync(blobPath(content))).toBe(false);
    });
  });

  describe('bucket name validation', () => {
    // Bucket and fork names are literal directory segments under buckets/,
    // so traversal-style names must be rejected. Object keys are exempt —
    // they never touch the filesystem.
    it('rejects path traversal in forks.create', async () => {
      await expect(
        ctx.forks.create({ name: '../escape' })
      ).rejects.toMatchObject({ code: 'InvalidArgument' });
    });

    it('rejects fork names with path separators', async () => {
      await expect(ctx.forks.create({ name: 'foo/bar' })).rejects.toMatchObject(
        { code: 'InvalidArgument' }
      );
    });

    it('rejects path traversal in forks.delete', async () => {
      await expect(ctx.forks.delete('../escape')).rejects.toMatchObject({
        code: 'InvalidArgument',
      });
    });

    it('rejects path traversal in forks.get', () => {
      expect(() => ctx.forks.get('../escape')).toThrowError(
        /invalid bucket name/
      );
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
    it('url points at the immutable blob, not a key path', async () => {
      const content = unique('url');
      await ctx.upload('photo.jpg', content);
      const url = await ctx.url('photo.jpg');
      expect(url.startsWith('file:///')).toBe(true);
      expect(fileURLToPath(url)).toBe(blobPath(content));
    });

    it('encodes expires when expiresIn is set', async () => {
      await ctx.upload('photo.jpg', unique('expires'));
      const url = await ctx.url('photo.jpg', { expiresIn: 3600 });
      expect(url).toMatch(/[?&]expires=\d+/);
    });

    it('url throws NotFound for missing keys', async () => {
      await expect(ctx.url('missing.jpg')).rejects.toMatchObject({
        code: 'NotFound',
      });
    });

    it('uploadUrl throws NotSupported', async () => {
      await expect(ctx.uploadUrl('new.jpg')).rejects.toMatchObject({
        code: 'NotSupported',
      });
    });
  });
});

/** Recursively count regular files under `dir` (0 when it doesn't exist). */
async function countFiles(dir: string): Promise<number> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}
