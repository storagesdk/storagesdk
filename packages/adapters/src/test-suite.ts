import { Storage, StorageError } from '@storagesdk/core';
import type { Adapter, ReadOnlyAdapter } from '@storagesdk/core/adapter';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/**
 * Per-backend capability switches. Every flag defaults to `true`; set one
 * to `false` to opt the conformance suite out of the assertions that
 * exercise that capability. Names describe the *behavior* the backend
 * supports, not the SDK feature.
 */
export interface AdapterCapabilities {
  /** Backend preserves user-provided `metadata` across upload → head/download. */
  userMetadata?: boolean;
  /** Backend preserves the `contentType` value across upload → head/download. */
  contentType?: boolean;
  /** Backend supports presigned upload URLs (`uploadUrl()` resolves to a URL the client can `PUT`/`POST` against). */
  presignedUploads?: boolean;
  /** `url()` returns URLs that can be fetched over plain HTTP. */
  fetchableSignedUrls?: boolean;
}

export interface StorageAdapterTestSuiteOptions<Raw = unknown> {
  /** Describe-block name shown in vitest output. */
  name: string;
  /**
   * The adapter under test. Pass an instance, or a factory if construction
   * depends on env vars that might be missing when `skip` is true.
   */
  adapter: Adapter<Raw> | (() => Adapter<Raw>);
  /**
   * Skip the whole suite — used by live-credentials adapters when env vars
   * aren't set so contributors without credentials can still run the rest
   * of the project's tests.
   */
  skip?: boolean;
  /**
   * Whether to clean up keys, snapshots, and forks created by each test.
   * Defaults to true. Set false to leave state behind for inspection.
   */
  cleanup?: boolean;
  /**
   * Per-backend capability flags. Omit to assume every capability is
   * supported (default for cloud object stores). Set a flag to `false`
   * to opt out of the corresponding assertions.
   */
  capabilities?: AdapterCapabilities;
  /**
   * Per-test timeout in milliseconds. Override when a backend's
   * per-operation latency makes vitest's default 5s too tight (e.g.
   * tests that perform many sequential network round-trips).
   */
  testTimeoutMs?: number;
}

export interface SetupTestStorageOptions {
  /**
   * Whether to clean up keys, snapshots, and forks created by each test.
   * Defaults to true. Set false to leave state behind for inspection.
   */
  cleanup?: boolean;
}

/**
 * Test-storage handle returned by `setupTestStorage`. Behaves like a
 * `Storage<Raw>` — every key-taking method auto-prefixes the key, and
 * every key-returning field (`download`/`head`/`list` results) has the
 * prefix stripped — plus two helpers:
 *
 *  - `prefix` — the raw per-test marker (use for `path.join` assertions
 *    or anywhere you need the literal prefix string).
 *  - `forkName(suffix)` — produces a unique fork name scoped to this test.
 */
export type TestStorage<Raw = unknown> = Storage<Raw> & {
  readonly prefix: string;
  forkName(suffix: string): string;
};

interface Baseline {
  snapshotIds: Set<string>;
  forkNames: Set<string>;
}

const bodyText = (item: { body: Uint8Array }): string =>
  new TextDecoder().decode(item.body);

/**
 * Wrap a `ReadOnlyAdapter` so reads auto-prefix the path and returned
 * `path` fields are stripped back to the unprefixed form.
 */
function prefixedReadOnly(
  base: ReadOnlyAdapter,
  getPrefix: () => string
): ReadOnlyAdapter {
  const k = (p: string): string => `${getPrefix()}/${p}`;
  const strip = (p: string): string => {
    const pfx = `${getPrefix()}/`;
    return p.startsWith(pfx) ? p.slice(pfx.length) : p;
  };
  return {
    download: async (path, opts) => {
      const item = await base.download(k(path), opts);
      return { ...item, path: strip(item.path) };
    },
    head: async (path, opts) => {
      const meta = await base.head(k(path), opts);
      return { ...meta, path: strip(meta.path) };
    },
    list: async (opts) => {
      const fullPrefix =
        opts?.prefix !== undefined ? k(opts.prefix) : `${getPrefix()}/`;
      const result = await base.list({ ...opts, prefix: fullPrefix });
      return {
        ...result,
        items: result.items.map((it) => ({ ...it, path: strip(it.path) })),
      };
    },
    url: (path, opts) => base.url(k(path), opts),
  };
}

/**
 * Wrap an `Adapter` so all key-taking methods auto-prefix and key-returning
 * fields are stripped. Snapshots' read-only adapters and forks' full
 * adapters are recursively wrapped with the same prefix.
 */
function prefixedAdapter<Raw>(
  base: Adapter<Raw>,
  getPrefix: () => string
): Adapter<Raw> {
  const k = (p: string): string => `${getPrefix()}/${p}`;
  const strip = (p: string): string => {
    const pfx = `${getPrefix()}/`;
    return p.startsWith(pfx) ? p.slice(pfx.length) : p;
  };
  const ro = prefixedReadOnly(base, getPrefix);
  return {
    name: base.name,
    raw: base.raw,
    download: ro.download,
    head: ro.head,
    list: ro.list,
    url: ro.url,
    upload: async (path, body, opts) => {
      const meta = await base.upload(k(path), body, opts);
      return { ...meta, path: strip(meta.path) };
    },
    delete: (path, opts) => base.delete(k(path), opts),
    copy: (from, to, opts) => base.copy(k(from), k(to), opts),
    move: (from, to, opts) => base.move(k(from), k(to), opts),
    uploadUrl: (path, opts) => base.uploadUrl(k(path), opts),
    snapshots: {
      create: (opts) => base.snapshots.create(opts),
      list: () => base.snapshots.list(),
      head: (id, opts) => base.snapshots.head(id, opts),
      delete: (id, opts) => base.snapshots.delete(id, opts),
      get: (id) => prefixedReadOnly(base.snapshots.get(id), getPrefix),
    },
    forks: {
      create: (opts) => base.forks.create(opts),
      list: () => base.forks.list(),
      head: (name, opts) => base.forks.head(name, opts),
      delete: (name, opts) => base.forks.delete(name, opts),
      get: (name) => prefixedAdapter(base.forks.get(name), getPrefix),
      merge: (name, opts) => base.forks.merge(name, opts),
      rebase: (name, opts) => base.forks.rebase(name, opts),
      diff: async (name, opts) => {
        // The underlying diff returns paths from the raw adapter's
        // listings, which include this test's prefix. Strip it so
        // tests can assert against the user-supplied names.
        const result = await base.forks.diff(name, opts);
        return {
          added: result.added.map(strip),
          modified: result.modified.map(strip),
          deleted: result.deleted.map(strip),
        };
      },
    },
  };
}

/**
 * Wire per-test isolation onto a Storage built from `adapter`. Returns a
 * `TestStorage` — a Storage that auto-prefixes keys with a fresh per-test
 * marker, plus `prefix` and `forkName(suffix)` helpers. Registers the
 * required vitest hooks (`beforeAll`/`beforeEach`/`afterEach`) so it must
 * be called inside a `describe` block.
 *
 * Cleanup is diff-based: capture the snapshot/fork state at setup, delete
 * anything new at teardown. Keys are scoped via the prefix so they're
 * deleted by listing under it.
 *
 *     describe('my-adapter', () => {
 *       const ctx = setupTestStorage(myAdapter);
 *
 *       it('works', async () => {
 *         await ctx.upload('photo.jpg', 'x');     // writes <prefix>/photo.jpg
 *         await ctx.list();                       // scoped to <prefix>/
 *         await ctx.forks.create({ name: ctx.forkName('exp') });
 *       });
 *     });
 */
export function setupTestStorage<Raw = unknown>(
  adapter: Adapter<Raw> | (() => Adapter<Raw>),
  opts?: SetupTestStorageOptions
): TestStorage<Raw> {
  const shouldCleanup = opts?.cleanup ?? true;
  let storage: Storage<Raw>;
  let currentPrefix = '';
  let forkCounter = 0;
  let baseline: Baseline = { snapshotIds: new Set(), forkNames: new Set() };

  beforeAll(() => {
    const base = typeof adapter === 'function' ? adapter() : adapter;
    const wrapped = prefixedAdapter(base, () => currentPrefix);
    storage = new Storage<Raw>({ adapter: wrapped });
  });

  beforeEach(async () => {
    currentPrefix = `t${Math.random().toString(36).slice(2, 8)}`;
    forkCounter = 0;
    const [snapshots, forks] = await Promise.all([
      storage.snapshots.list(),
      storage.forks.list(),
    ]);
    baseline = {
      snapshotIds: new Set(snapshots.map((s) => s.id)),
      forkNames: new Set(forks.map((f) => f.name)),
    };
  });

  afterEach(async () => {
    if (!shouldCleanup) return;
    // Keys with our prefix. The wrapped storage auto-strips the prefix
    // from list results; storage.delete re-prefixes, so the round-trip
    // through `it.path` works without manual prefix handling.
    try {
      let cursor: string | undefined;
      do {
        const page = await storage.list({
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
    // Forks this test created. Walk each new fork's snapshots and delete
    // them first — on copy-based adapters those are sibling buckets/folders
    // of the fork itself, so deleting only the fork would orphan them.
    try {
      const forks = await storage.forks.list();
      for (const f of forks) {
        if (!baseline.forkNames.has(f.name)) {
          try {
            const fork = storage.forks.get(f.name);
            const forkSnaps = await fork.snapshots.list();
            for (const s of forkSnaps) {
              await fork.snapshots.delete(s.id).catch(() => {});
            }
          } catch {
            /* swallow */
          }
          await storage.forks.delete(f.name).catch(() => {});
        }
      }
    } catch {
      /* swallow */
    }
    // Snapshots this test created.
    try {
      const snapshots = await storage.snapshots.list();
      for (const s of snapshots) {
        if (!baseline.snapshotIds.has(s.id)) {
          await storage.snapshots.delete(s.id).catch(() => {});
        }
      }
    } catch {
      /* swallow */
    }
  });

  // Proxy: delegates to `storage` (built in beforeAll), with `prefix` and
  // `forkName` injected. Methods are bound to the storage so class methods
  // using `this.#adapter` (private field) still work correctly.
  return new Proxy({} as TestStorage<Raw>, {
    get(_target, prop) {
      if (prop === 'prefix') return currentPrefix;
      if (prop === 'forkName') {
        return (suffix: string): string =>
          `f${++forkCounter}-${currentPrefix}-${suffix}`;
      }
      const value = Reflect.get(storage, prop, storage);
      return typeof value === 'function' ? value.bind(storage) : value;
    },
  });
}

/**
 * Cross-adapter behavioral test suite. Wire it up from an adapter's tests:
 *
 *     storageAdapterTestSuite({
 *       name: 'my-adapter',
 *       adapter: myAdapter({ ...config }),
 *     });
 *
 * Tests describe behavior visible to consumers (uploads round-trip, forks
 * see seeded content, AbortSignal short-circuits ops). How an adapter
 * achieves that — sidecar files, sibling buckets, native snapshot API —
 * is implementation, and belongs in the adapter's own test file.
 *
 * No capability gating: if an adapter can't honor a test, the test fails
 * and the gap is visible.
 */
export function storageAdapterTestSuite<Raw = unknown>(
  opts: StorageAdapterTestSuiteOptions<Raw>
): void {
  const d = opts.skip ? describe.skip : describe;

  const caps = opts.capabilities ?? {};
  const hasUserMetadata = caps.userMetadata !== false;
  const hasContentType = caps.contentType !== false;
  const hasPresignedUploads = caps.presignedUploads !== false;
  const hasFetchableSignedUrls = caps.fetchableSignedUrls !== false;
  const tMs = opts.testTimeoutMs;

  const describeOpts = tMs !== undefined ? { timeout: tMs } : {};
  // Snapshot/fork describes below have their own 30s baseline for
  // cloud adapters; honor a higher `testTimeoutMs` when the caller
  // asks for one (slow WebDAV / SFTP / FTP servers need longer).
  const snapshotForkTimeoutMs = Math.max(30_000, tMs ?? 0);
  d(opts.name, describeOpts, () => {
    // Cleanup walks every leftover key + snapshot/fork, and slow
    // backends shouldn't lose tests to vitest's 10s afterEach
    // default. Reuse the same `testTimeoutMs` value rather than
    // surfacing a parallel `hookTimeoutMs` option.
    if (tMs !== undefined) {
      vi.setConfig({ hookTimeout: tMs });
    }
    const ctx = setupTestStorage(opts.adapter, {
      ...(opts.cleanup !== undefined ? { cleanup: opts.cleanup } : {}),
    });

    describe('upload, download, head', () => {
      it('round-trips a string body', async () => {
        await ctx.upload('hello.txt', 'hello, world');
        const item = await ctx.download('hello.txt');
        expect(bodyText(item)).toBe('hello, world');
        expect(item.size).toBe(12);
      });

      const contentTypeIt = hasContentType ? it : it.skip;
      contentTypeIt(
        hasContentType
          ? 'preserves contentType'
          : 'preserves contentType (skipped: backend has no Content-Type field)',
        async () => {
          await ctx.upload('photo.jpg', 'bytes', {
            contentType: 'image/jpeg',
          });
          const meta = await ctx.head('photo.jpg');
          expect(meta.contentType).toBe('image/jpeg');
        }
      );

      const metadataIt = hasUserMetadata ? it : it.skip;
      metadataIt(
        hasUserMetadata
          ? 'preserves user metadata'
          : 'preserves user metadata (skipped: backend has no metadata field)',
        async () => {
          await ctx.upload('photo.jpg', 'bytes', {
            contentType: 'image/jpeg',
            metadata: { author: 'alice' },
          });
          const meta = await ctx.head('photo.jpg');
          expect(meta.metadata?.author).toBe('alice');
        }
      );

      it('throws NotFound for missing keys', async () => {
        await expect(ctx.download('missing.jpg')).rejects.toMatchObject({
          code: 'NotFound',
        });
        await expect(ctx.head('missing.jpg')).rejects.toMatchObject({
          code: 'NotFound',
        });
      });
    });

    describe('byte-range reads', () => {
      // Use a 32-byte alphabet so slice boundaries are easy to eyeball
      // in test output if any of these fail.
      const ALPHABET = 'abcdefghijklmnopqrstuvwxyz012345';

      it('reads a middle slice', async () => {
        await ctx.upload('alphabet.txt', ALPHABET);
        const item = await ctx.download('alphabet.txt', {
          range: { offset: 5, length: 10 },
        });
        expect(bodyText(item)).toBe('fghijklmno');
        expect(item.size).toBe(10);
      });

      it('reads from offset 0', async () => {
        await ctx.upload('alphabet.txt', ALPHABET);
        const item = await ctx.download('alphabet.txt', {
          range: { offset: 0, length: 4 },
        });
        expect(bodyText(item)).toBe('abcd');
        expect(item.size).toBe(4);
      });

      it('returns what exists when length runs past EOF', async () => {
        // 32-byte body, request 100 starting at byte 28 → only 4 left.
        await ctx.upload('alphabet.txt', ALPHABET);
        const item = await ctx.download('alphabet.txt', {
          range: { offset: 28, length: 100 },
        });
        expect(bodyText(item)).toBe('2345');
        expect(item.size).toBe(4);
      });

      it('range works with `as: bytes`', async () => {
        await ctx.upload('alphabet.txt', ALPHABET);
        const bytes = await ctx.download('alphabet.txt', {
          as: 'bytes',
          range: { offset: 10, length: 5 },
        });
        expect(new TextDecoder().decode(bytes)).toBe('klmno');
      });

      it('rejects negative offset with InvalidArgument', async () => {
        await ctx.upload('alphabet.txt', ALPHABET);
        await expect(
          ctx.download('alphabet.txt', { range: { offset: -1, length: 4 } })
        ).rejects.toMatchObject({ code: 'InvalidArgument' });
      });

      it('rejects zero length with InvalidArgument', async () => {
        await ctx.upload('alphabet.txt', ALPHABET);
        await expect(
          ctx.download('alphabet.txt', { range: { offset: 0, length: 0 } })
        ).rejects.toMatchObject({ code: 'InvalidArgument' });
      });
    });

    describe('list, delete, copy, move', () => {
      it('deletes a key', async () => {
        await ctx.upload('photo.jpg', 'bytes');
        await ctx.delete('photo.jpg');
        await expect(ctx.head('photo.jpg')).rejects.toMatchObject({
          code: 'NotFound',
        });
      });

      it('filters by prefix and paginates with a cursor', async () => {
        for (let i = 0; i < 5; i++) {
          await ctx.upload(`photos/${i}.jpg`, String(i));
        }
        await ctx.upload('videos/v.mp4', 'v');

        const filtered = await ctx.list({ prefix: 'photos/' });
        expect(filtered.items.length).toBe(5);

        const page1 = await ctx.list({ prefix: 'photos/', limit: 2 });
        expect(page1.items.length).toBeLessThanOrEqual(2);
        expect(page1.cursor).toBeDefined();

        const cursor = page1.cursor;
        if (cursor === undefined) throw new Error('cursor not set');
        const page2 = await ctx.list({
          prefix: 'photos/',
          limit: 2,
          cursor,
        });
        expect(page2.items.length).toBeLessThanOrEqual(2);
        expect(page2.items[0]?.path).not.toBe(page1.items[0]?.path);
      });

      it('walks the full prefix across pages without skipping items', async () => {
        // Regression for adapters that over-fetch by one to mask the
        // internal-manifest filter: when the manifest isn't on the
        // page, the over-fetched item gets dropped but the cursor
        // advances past it. Walk a full prefix with a small page size
        // and assert the union matches the uploaded set exactly.
        const expected = new Set<string>();
        for (let i = 0; i < 6; i++) {
          const key = `walk/${i}.txt`;
          await ctx.upload(key, String(i));
          expected.add(key);
        }

        const seen = new Set<string>();
        let cursor: string | undefined;
        do {
          const page = await ctx.list({
            prefix: 'walk/',
            limit: 2,
            ...(cursor !== undefined ? { cursor } : {}),
          });
          for (const item of page.items) {
            expect(seen.has(item.path)).toBe(false);
            seen.add(item.path);
          }
          cursor = page.cursor;
        } while (cursor !== undefined);

        expect(seen).toEqual(expected);
      });

      it('copies and moves keys', async () => {
        await ctx.upload('src.jpg', 'data', { contentType: 'image/jpeg' });
        await ctx.copy('src.jpg', 'dst.jpg');
        if (hasContentType) {
          expect((await ctx.head('dst.jpg')).contentType).toBe('image/jpeg');
        }

        await ctx.move('dst.jpg', 'final.jpg');
        await expect(ctx.head('dst.jpg')).rejects.toMatchObject({
          code: 'NotFound',
        });
        if (hasContentType) {
          expect((await ctx.head('final.jpg')).contentType).toBe('image/jpeg');
        }
      });

      it('handles path separators in keys', async () => {
        await ctx.upload('photos/2024/a.jpg', 'a');
        await ctx.copy('photos/2024/a.jpg', 'archive/2024/a.jpg');
        expect(bodyText(await ctx.download('archive/2024/a.jpg'))).toBe('a');

        await ctx.move('archive/2024/a.jpg', 'archive/2024/b.jpg');
        await expect(ctx.head('archive/2024/a.jpg')).rejects.toMatchObject({
          code: 'NotFound',
        });
      });

      it('handles keys with special characters', async () => {
        await ctx.upload('photos/holiday (2024) ☀️.jpg', 'sun');
        await ctx.copy(
          'photos/holiday (2024) ☀️.jpg',
          'archive/holiday (2024) ☀️.jpg'
        );
        expect(
          bodyText(await ctx.download('archive/holiday (2024) ☀️.jpg'))
        ).toBe('sun');
      });
    });

    describe('url and uploadUrl', () => {
      it('url returns a string for an existing key', async () => {
        await ctx.upload('photo.jpg', 'x');
        const url = await ctx.url('photo.jpg');
        expect(typeof url).toBe('string');
        expect(url.length).toBeGreaterThan(0);
      });

      const uploadUrlIt = hasPresignedUploads ? it : it.skip;
      uploadUrlIt(
        hasPresignedUploads
          ? 'uploadUrl returns a PUT URL by default'
          : 'uploadUrl returns a PUT URL by default (skipped: backend has no presigned uploads)',
        async () => {
          const signed = await ctx.uploadUrl('new.jpg', { expiresIn: 300 });
          expect(signed.method).toBe('PUT');
          expect(typeof signed.url).toBe('string');
          expect(signed.url.length).toBeGreaterThan(0);
        }
      );

      uploadUrlIt(
        hasPresignedUploads
          ? 'uploadUrl accepts maxSize and returns either POST or PUT'
          : 'uploadUrl accepts maxSize (skipped: backend has no presigned uploads)',
        async () => {
          // Backends with POST-policy support (s3/r2/minio, tigris) return
          // `method: 'POST'` with form `fields`. Backends without (Azure
          // SAS, file://) silently degrade to a `method: 'PUT'` URL — the
          // size cap can't be enforced at the URL level on those. The
          // compat matrix documents which adapters actually enforce.
          const signed = await ctx.uploadUrl('new.jpg', {
            expiresIn: 300,
            maxSize: 5 * 1024 * 1024,
            contentType: 'image/jpeg',
          });
          expect(['PUT', 'POST']).toContain(signed.method);
          expect(typeof signed.url).toBe('string');
          expect(signed.url.length).toBeGreaterThan(0);
          if (signed.method === 'POST') {
            expect(Object.keys(signed.fields).length).toBeGreaterThan(0);
            expect(signed.fields.key).toBeDefined();
          }
        }
      );

      // Adapters that return HTTP-fetchable signed URLs (every cloud
      // backend) are exercised end-to-end here. fs opts out via
      // `capabilities.fetchableSignedUrls: false` (`url()` returns `file://`).
      if (hasFetchableSignedUrls) {
        it('signed GET URL returns the object content', async () => {
          await ctx.upload('signed.txt', 'signed-content');
          const url = await ctx.url('signed.txt', { expiresIn: 300 });
          expect(url).toMatch(/^https?:\/\//);
          const res = await fetch(url);
          expect(res.status).toBe(200);
          expect(await res.text()).toBe('signed-content');
        });
      }

      if (hasFetchableSignedUrls && hasPresignedUploads) {
        it('signed PUT URL works for upload', async () => {
          const signed = await ctx.uploadUrl('uploaded.bin', {
            expiresIn: 300,
          });
          expect(signed.method).toBe('PUT');
          expect(signed.url).toMatch(/^https?:\/\//);
          const res = await fetch(signed.url, {
            method: 'PUT',
            body: 'uploaded-content',
            // `headers` is the adapter's contract for "the client must
            // send these on the PUT" — e.g. Azure's `x-ms-blob-type`.
            // Most adapters omit it.
            ...(signed.method === 'PUT' && signed.headers
              ? { headers: signed.headers }
              : {}),
          });
          expect(res.ok).toBe(true);
          const item = await ctx.download('uploaded.bin');
          expect(bodyText(item)).toBe('uploaded-content');
        });
      }
    });

    // Snapshot/fork creation involves new bucket/container creation on
    // copy-based cloud adapters (s3, r2, azure, gcs). GCS in particular
    // takes 5-15s per bucket plus propagation delay. Bump the per-test
    // timeout for the whole block so cloud runs don't flake.
    describe('snapshots', { timeout: snapshotForkTimeoutMs }, () => {
      it('snapshot reads stay frozen after live writes', async () => {
        await ctx.upload('s.txt', 'before');
        const info = await ctx.snapshots.create({ name: 'baseline' });
        expect(info.id).toBeTruthy();

        await ctx.upload('s.txt', 'after');

        const reader = ctx.snapshots.get(info.id);
        expect(bodyText(await reader.download('s.txt'))).toBe('before');
        expect(bodyText(await ctx.download('s.txt'))).toBe('after');
      });

      it('snapshots can be listed, inspected, and deleted', async () => {
        await ctx.upload('a.txt', 'a');
        const info = await ctx.snapshots.create({ name: 'one' });

        const after = await ctx.snapshots.list();
        expect(after.find((s) => s.id === info.id)).toBeDefined();
        expect((await ctx.snapshots.head(info.id)).id).toBe(info.id);

        await ctx.snapshots.delete(info.id);
        const final = await ctx.snapshots.list();
        expect(final.find((s) => s.id === info.id)).toBeUndefined();
      });

      it('snapshot reader url() points at the snapshot, not the live bucket', async () => {
        await ctx.upload('snapurl.txt', 'snapshot-bytes');
        const info = await ctx.snapshots.create();

        // Mutate live so we can prove the URL points at the snapshot bytes.
        await ctx.upload('snapurl.txt', 'live-bytes');

        const reader = ctx.snapshots.get(info.id);
        const url = await reader.url('snapurl.txt', { expiresIn: 300 });
        expect(typeof url).toBe('string');

        // The byte-fetch end-to-end check is gated on
        // `fetchableSignedUrls`. fs returns `file://` (Node's fetch
        // refuses); github can return a URL that only resolves on
        // public repos, so private test repos opt out the same way.
        // `'snapshot reads stay frozen after live writes'` already
        // proves the SDK reads snapshot bytes via the reader.
        if (
          hasFetchableSignedUrls &&
          (url.startsWith('http://') || url.startsWith('https://'))
        ) {
          const res = await fetch(url);
          expect(res.status).toBe(200);
          expect(await res.text()).toBe('snapshot-bytes');
        }
      });
    });

    describe('forks', { timeout: snapshotForkTimeoutMs }, () => {
      it('a fork seeded from a snapshot starts at the snapshot state', async () => {
        await ctx.upload('photo.jpg', 'original');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('exp');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        const fork = ctx.forks.get(name);
        expect(bodyText(await fork.download('photo.jpg'))).toBe('original');

        await fork.upload('photo.jpg', 'modified');
        expect(bodyText(await fork.download('photo.jpg'))).toBe('modified');
        // Parent unchanged.
        expect(bodyText(await ctx.download('photo.jpg'))).toBe('original');
      });

      it('a fork without fromSnapshot starts at live parent state', async () => {
        await ctx.upload('a.jpg', 'live');
        const name = ctx.forkName('live');
        await ctx.forks.create({ name });

        const fork = ctx.forks.get(name);
        expect(bodyText(await fork.download('a.jpg'))).toBe('live');

        // Adapters that auto-snapshot under the hood (Tigris) surface the
        // internal snapshot id on `fromSnapshot` even when the caller
        // didn't pass one. Verify the fork is registered, not the shape
        // of `fromSnapshot`.
        const info = await ctx.forks.head(name);
        expect(info.name).toBe(name);
      });

      it('forks.create with an existing name throws Conflict', async () => {
        await ctx.upload('a.jpg', 'a');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('twin');
        await ctx.forks.create({ name, fromSnapshot: snap.id });
        await expect(
          ctx.forks.create({ name, fromSnapshot: snap.id })
        ).rejects.toMatchObject({ code: 'Conflict' });
      });

      it('forks.create with an unknown fromSnapshot fails (no silent success)', async () => {
        // The original failure mode this pins down was Vercel silently
        // creating an empty fork when `fromSnapshot` didn't exist.
        // Different adapters surface this as different codes — some
        // explicit `NotFound`, some `Provider` from the underlying
        // backend's NoSuchBucket / similar — so the contract is
        // "throws *something*", not a specific code. Anything is
        // better than the empty-fork-with-no-record case.
        await expect(
          ctx.forks.create({
            name: ctx.forkName('orphan'),
            fromSnapshot: 'does-not-exist',
          })
        ).rejects.toBeInstanceOf(StorageError);
      });

      it('forks can be listed, inspected, and deleted', async () => {
        await ctx.upload('a.jpg', 'a');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('ls');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        const all = await ctx.forks.list();
        expect(all.find((f) => f.name === name)).toBeDefined();
        expect((await ctx.forks.head(name)).fromSnapshot).toBe(snap.id);

        await ctx.forks.delete(name);
        const after = await ctx.forks.list();
        expect(after.find((f) => f.name === name)).toBeUndefined();
      });

      it('forks.head throws NotFound for an unknown name', async () => {
        await expect(
          ctx.forks.head('definitely-not-a-fork')
        ).rejects.toMatchObject({ code: 'NotFound' });
      });

      it('a fork can be snapshotted independently of its parent', async () => {
        await ctx.upload('a.jpg', 'a');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('child');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        const fork = ctx.forks.get(name);
        await fork.upload('b.jpg', 'b');
        const childSnap = await fork.snapshots.create({ name: 'child-snap' });

        const childSnaps = await fork.snapshots.list();
        expect(childSnaps.find((s) => s.id === childSnap.id)).toBeDefined();

        // Clean nested snapshot up so dispose can remove the fork.
        await fork.snapshots.delete(childSnap.id);
      });
    });

    describe('forks.merge / forks.rebase', {
      timeout: snapshotForkTimeoutMs,
    }, () => {
      it('merge pulls a fork-only file back into the parent', async () => {
        await ctx.upload('a.txt', 'a-original');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('merge-add');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        const fork = ctx.forks.get(name);
        await fork.upload('b.txt', 'b-from-fork');

        const result = await ctx.forks.merge?.(name);
        expect(result.id).toBeTruthy();

        // b.txt now lives on the parent.
        expect(bodyText(await ctx.download('b.txt'))).toBe('b-from-fork');
        // Parent's own file is untouched.
        expect(bodyText(await ctx.download('a.txt'))).toBe('a-original');

        await ctx.snapshots.delete(result.id);
      });

      it('merge propagates a fork-side delete to the parent', async () => {
        await ctx.upload('keep.txt', 'still here');
        await ctx.upload('drop.txt', 'will be removed');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('merge-del');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        const fork = ctx.forks.get(name);
        await fork.delete('drop.txt');

        const result = await ctx.forks.merge?.(name);

        expect(bodyText(await ctx.download('keep.txt'))).toBe('still here');
        await expect(ctx.download('drop.txt')).rejects.toMatchObject({
          code: 'NotFound',
        });

        await ctx.snapshots.delete(result.id);
      });

      it('merge leaves parent-side additions alone', async () => {
        await ctx.upload('shared.txt', 'shared');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('merge-keep');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        // Add a file to the parent AFTER the fork was created. It's not
        // in the fork's base, not in the fork-current — but it should
        // survive the merge.
        await ctx.upload('parent-only.txt', 'parent owns this');

        const fork = ctx.forks.get(name);
        await fork.upload('fork-only.txt', 'fork owns this');

        const result = await ctx.forks.merge?.(name);

        expect(bodyText(await ctx.download('parent-only.txt'))).toBe(
          'parent owns this'
        );
        expect(bodyText(await ctx.download('fork-only.txt'))).toBe(
          'fork owns this'
        );
        expect(bodyText(await ctx.download('shared.txt'))).toBe('shared');

        await ctx.snapshots.delete(result.id);
      });

      it('rebase pulls parent-side additions into the fork', async () => {
        await ctx.upload('base.txt', 'base');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('rebase-add');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        // Parent gets a new file post-fork-create.
        await ctx.upload('parent-new.txt', 'arrived after fork');

        const result = await ctx.forks.rebase?.(name);
        expect(result.id).toBeTruthy();

        const fork = ctx.forks.get(name);
        expect(bodyText(await fork.download('parent-new.txt'))).toBe(
          'arrived after fork'
        );

        // Use the fork's own snapshot namespace for cleanup.
        await fork.snapshots.delete(result.id);
      });

      it('merge respects a parent-side delete when the fork left the path alone', async () => {
        // Parent deletes a file the fork never touched. The fork still
        // has it (carried over from base) but merge must not resurrect
        // it on parent.
        await ctx.upload('untouched.txt', 'in base');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('mg-keep');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        await ctx.delete('untouched.txt');

        const result = await ctx.forks.merge?.(name);
        expect(result).toBeDefined();
        if (!result) return;

        await expect(ctx.download('untouched.txt')).rejects.toMatchObject({
          code: 'NotFound',
        });

        await ctx.snapshots.delete(result.id);
      });

      it('rebase respects a fork-side delete when the parent left the path alone', async () => {
        // `forkName(suffix)` produces `<test-prefix>-<suffix>`, which
        // becomes the fork bucket's name. The post-op snapshot of a
        // rebase tacks `-snapshot-<25 digits>` onto that to make a
        // sibling bucket — S3 / Azure cap names at 63 chars, so the
        // suffix has to stay short. See
        // `project_bucket_name_length_constraint.md` in the auto-memory.
        await ctx.upload('untouched.txt', 'in base');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('rb-keep');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        const fork = ctx.forks.get(name);
        await fork.delete('untouched.txt');

        const result = await ctx.forks.rebase?.(name);
        expect(result).toBeDefined();
        if (!result) return;

        await expect(fork.download('untouched.txt')).rejects.toMatchObject({
          code: 'NotFound',
        });

        await fork.snapshots.delete(result.id);
      });

      it('merge handles a deleted fork base snapshot without destroying the parent', async () => {
        await ctx.upload('x.txt', 'x');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('merge-base-gone');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        // Delete the base snapshot out from under the fork. A naive
        // polyfill would compute the diff against an empty base and
        // reclassify everything as `added`, silently overwriting the
        // parent. The contract: either throw NotFound (polyfill path)
        // or succeed safely (native path that derives the merge base
        // from history, like github).
        try {
          await ctx.snapshots.delete(snap.id);
        } catch {
          // Adapters with native referential integrity (e.g. tigris)
          // refuse to delete a snapshot that's the base of an existing
          // fork. The orphaned-base scenario is unreachable on those
          // backends — nothing to assert.
          return;
        }

        try {
          const result = await ctx.forks.merge(name);
          // Native impl succeeded without the snapshot tag — verify the
          // parent's content is intact (not destroyed by an empty-base
          // miscompute). Then clean up the post-op snapshot.
          expect(bodyText(await ctx.download('x.txt'))).toBe('x');
          await ctx.snapshots.delete(result.id);
        } catch (e) {
          expect(e).toMatchObject({ code: 'NotFound' });
        }
      });

      it('diff (ahead) reports what merge would apply to parent', async () => {
        await ctx.upload('shared.txt', 'shared');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('diff-ahead');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        const fork = ctx.forks.get(name);
        await fork.upload('fork-only.txt', 'fork new');

        const ahead = await ctx.forks.diff?.(name); // default direction = 'ahead'
        expect(ahead).toBeDefined();
        if (!ahead) return;
        expect(ahead.added).toContain('fork-only.txt');
      });

      it('diff (behind) reports what rebase would apply to the fork', async () => {
        await ctx.upload('shared.txt', 'shared');
        await ctx.upload('parent-will-delete.txt', 'goodbye');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('diff-behind');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        await ctx.upload('parent-only.txt', 'parent new');
        await ctx.delete('parent-will-delete.txt');

        const behind = await ctx.forks.diff?.(name, { direction: 'behind' });
        expect(behind).toBeDefined();
        if (!behind) return;
        expect(behind.added).toContain('parent-only.txt');
        expect(behind.deleted).toContain('parent-will-delete.txt');
      });

      it('rebase propagates a parent-side delete to the fork', async () => {
        await ctx.upload('keep.txt', 'still here');
        await ctx.upload('drop.txt', 'parent will delete');
        const snap = await ctx.snapshots.create();
        const name = ctx.forkName('rebase-del');
        await ctx.forks.create({ name, fromSnapshot: snap.id });

        await ctx.delete('drop.txt');

        const result = await ctx.forks.rebase?.(name);

        const fork = ctx.forks.get(name);
        expect(bodyText(await fork.download('keep.txt'))).toBe('still here');
        await expect(fork.download('drop.txt')).rejects.toMatchObject({
          code: 'NotFound',
        });

        await fork.snapshots.delete(result.id);
      });
    });

    describe('AbortSignal', () => {
      it('upload throws Aborted with an already-aborted signal', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        await expect(
          ctx.upload('x.txt', 'data', { signal: ctrl.signal })
        ).rejects.toMatchObject({ code: 'Aborted' });
      });

      it('download throws Aborted with an already-aborted signal', async () => {
        await ctx.upload('y.txt', 'data');
        const ctrl = new AbortController();
        ctrl.abort();
        await expect(
          ctx.download('y.txt', { signal: ctrl.signal })
        ).rejects.toMatchObject({ code: 'Aborted' });
      });

      it('list throws Aborted with an already-aborted signal', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        await expect(ctx.list({ signal: ctrl.signal })).rejects.toMatchObject({
          code: 'Aborted',
        });
      });

      it('snapshots.create throws Aborted with an already-aborted signal', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        await expect(
          ctx.snapshots.create({ signal: ctrl.signal })
        ).rejects.toMatchObject({ code: 'Aborted' });
      });

      it('forks.create throws Aborted with an already-aborted signal', async () => {
        const ctrl = new AbortController();
        ctrl.abort();
        await expect(
          ctx.forks.create({
            name: ctx.forkName('doomed'),
            signal: ctrl.signal,
          })
        ).rejects.toMatchObject({ code: 'Aborted' });
      });
    });
  });
}
