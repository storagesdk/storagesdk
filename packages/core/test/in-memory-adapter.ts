/**
 * Reference adapter used by the core test suite. Stores objects, snapshots,
 * and forks in plain `Map`s. Forks are themselves full in-memory adapters, so
 * nested snapshot/fork operations work without any special-casing.
 *
 * Adapter authors can read this file as a worked example — every method on
 * `Adapter`, `AdapterSnapshots`, and `AdapterForks` is implemented here.
 */

import { defineAdapter } from '../src/adapter.js';
import { StorageError } from '../src/errors.js';
import type {
  Adapter,
  BodyInput,
  ForkInfo,
  ListResult,
  ReadOnlyAdapter,
  SnapshotInfo,
  StorageItem,
  StorageItemMeta,
} from '../src/index.js';

/** A stored object as the adapter sees it internally. */
interface Entry {
  body: Uint8Array;
  contentType: string;
  etag: string;
  lastModified: Date;
  metadata?: Readonly<Record<string, string>>;
}

interface SnapshotData {
  info: SnapshotInfo;
  entries: Map<string, Entry>;
}

interface ForkRecord {
  info: ForkInfo;
  impl: Adapter;
}

interface AdapterState {
  entries: Map<string, Entry>;
  snapshots: Map<string, SnapshotData>;
  forks: Map<string, ForkRecord>;
}

// Module-level so two adapters created in the same millisecond don't collide.
let snapshotCounter = 0;
function nextSnapshotId(): string {
  snapshotCounter += 1;
  return `snap-${Date.now()}-${snapshotCounter}`;
}

/** Cheap deterministic hash for synthetic etags. Not cryptographic. */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Drain any supported `BodyInput` shape into a `Uint8Array`. */
async function bodyToBytes(body: BodyInput): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
      total += result.value.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
  throw new StorageError({
    code: 'InvalidArgument',
    message: 'unsupported body type',
  });
}

function makeMeta(path: string, entry: Entry): StorageItemMeta {
  const base = {
    path,
    size: entry.body.byteLength,
    contentType: entry.contentType,
    etag: entry.etag,
    lastModified: entry.lastModified,
  };
  // Omit `metadata` entirely when absent — never set it to `undefined`, since
  // tests use strict equality on the result object.
  if (entry.metadata !== undefined) {
    return { ...base, metadata: entry.metadata };
  }
  return base;
}

function makeItem(path: string, entry: Entry): StorageItem {
  return { ...makeMeta(path, entry), body: new Uint8Array(entry.body) };
}

function notFound(message: string): StorageError {
  return new StorageError({ code: 'NotFound', message });
}

function listEntries(
  entries: Map<string, Entry>,
  opts?: { prefix?: string; limit?: number; cursor?: string }
): ListResult {
  const prefix = opts?.prefix ?? '';
  const limit = opts?.limit ?? 100;
  const cursor = opts?.cursor ?? '';

  const matching = Array.from(entries.entries())
    .filter(([p]) => p.startsWith(prefix) && p > cursor)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const page = matching.slice(0, limit);
  const items = page.map(([p, e]) => makeMeta(p, e));
  const hasMore = matching.length > limit;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? last[0] : undefined;

  return nextCursor !== undefined ? { items, cursor: nextCursor } : { items };
}

/**
 * A `ReadOnlyAdapter` bound to the entries captured at snapshot time. The
 * entries map is owned by the snapshot, so writes to the live adapter don't
 * affect what this reader sees.
 */
function snapshotReader(
  id: string,
  entries: Map<string, Entry>
): ReadOnlyAdapter {
  return {
    async download(path) {
      const entry = entries.get(path);
      if (!entry) throw notFound(`${path} not found in snapshot ${id}`);
      return makeItem(path, entry);
    },
    async head(path) {
      const entry = entries.get(path);
      if (!entry) throw notFound(`${path} not found in snapshot ${id}`);
      return makeMeta(path, entry);
    },
    async list(opts) {
      return listEntries(entries, opts);
    },
    async url(path) {
      if (!entries.has(path))
        throw notFound(`${path} not found in snapshot ${id}`);
      return `mem://${path}?snapshot=${id}`;
    },
  };
}

/**
 * Returned by `snapshots.get` for unknown ids: every method throws `NotFound`
 * on first call. `get` is synchronous, so deferring the error keeps its
 * signature simple — callers see the failure when they actually read.
 */
function emptyReader(message: string): ReadOnlyAdapter {
  const err = () => notFound(message);
  return {
    async download() {
      throw err();
    },
    async head() {
      throw err();
    },
    async list() {
      throw err();
    },
    async url() {
      throw err();
    },
  };
}

/**
 * Build a raw (un-wrapped) adapter bound to a particular state object. Kept
 * separate from `inMemoryAdapter` so `forks.create` can stand up a fresh impl
 * without going through `defineAdapter` again — `forks.get` returns this raw
 * impl, and the outer `defineAdapter`'s `forks.get` recursion wraps it exactly
 * once. This is the pattern real cloud adapters should follow when forks
 * share a parent client.
 */
function createImpl(state: AdapterState): Adapter {
  return {
    name: 'in-memory',
    raw: state,

    async upload(path, body, opts) {
      const bytes = await bodyToBytes(body);
      const entry: Entry = {
        body: bytes,
        contentType: opts?.contentType ?? 'application/octet-stream',
        etag: fnv1a(bytes),
        lastModified: new Date(),
        ...(opts?.metadata !== undefined
          ? { metadata: { ...opts.metadata } }
          : {}),
      };
      state.entries.set(path, entry);
      return makeMeta(path, entry);
    },

    async download(path) {
      const entry = state.entries.get(path);
      if (!entry) throw notFound(`${path} not found`);
      return makeItem(path, entry);
    },

    async head(path) {
      const entry = state.entries.get(path);
      if (!entry) throw notFound(`${path} not found`);
      return makeMeta(path, entry);
    },

    async list(opts) {
      return listEntries(state.entries, opts);
    },

    async delete(path) {
      state.entries.delete(path);
    },

    async copy(from, to) {
      const entry = state.entries.get(from);
      if (!entry) throw notFound(`${from} not found`);
      state.entries.set(to, { ...entry, lastModified: new Date() });
    },

    async move(from, to) {
      const entry = state.entries.get(from);
      if (!entry) throw notFound(`${from} not found`);
      state.entries.set(to, { ...entry, lastModified: new Date() });
      state.entries.delete(from);
    },

    async url(path) {
      if (!state.entries.has(path)) throw notFound(`${path} not found`);
      return `mem://${path}`;
    },

    async uploadUrl(path, opts) {
      const headers: Record<string, string> = {};
      if (opts?.contentType !== undefined)
        headers['content-type'] = opts.contentType;
      return Object.keys(headers).length > 0
        ? { method: 'PUT', url: `mem://${path}?upload=1`, headers }
        : { method: 'PUT', url: `mem://${path}?upload=1` };
    },

    snapshots: {
      async create(opts) {
        const id = nextSnapshotId();
        const info: SnapshotInfo = {
          id,
          createdAt: new Date(),
          ...(opts?.name !== undefined ? { name: opts.name } : {}),
        };
        // Deep-copy every byte buffer so writes to the live entries don't
        // bleed into the snapshot view. Real adapters usually delegate this
        // to the backend (S3 versioning, Tigris snapshots, btrfs, etc.).
        const entries = new Map<string, Entry>();
        for (const [p, e] of state.entries) {
          entries.set(p, { ...e, body: new Uint8Array(e.body) });
        }
        state.snapshots.set(id, { info, entries });
        return info;
      },

      async list() {
        return Array.from(state.snapshots.values()).map((s) => s.info);
      },

      async head(id) {
        const snap = state.snapshots.get(id);
        if (!snap) throw notFound(`snapshot ${id} not found`);
        return snap.info;
      },

      async delete(id) {
        state.snapshots.delete(id);
      },

      get(id) {
        const snap = state.snapshots.get(id);
        if (!snap) return emptyReader(`snapshot ${id} not found`);
        return snapshotReader(id, snap.entries);
      },
    },

    forks: {
      async create(opts) {
        const snap = state.snapshots.get(opts.fromSnapshot);
        if (!snap) throw notFound(`snapshot ${opts.fromSnapshot} not found`);
        if (state.forks.has(opts.name)) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }
        // Materialize a fresh state seeded with a deep copy of the snapshot,
        // then build a raw impl on top of it. The fork has its own independent
        // snapshots/forks maps, so nested operations behave like fresh storage.
        // We stash the raw impl (not a `defineAdapter`-wrapped adapter) so the
        // outer wrap that runs when callers do `storage.forks.get(name)` is
        // the only wrap layer.
        const cloned = new Map<string, Entry>();
        for (const [p, e] of snap.entries) {
          cloned.set(p, { ...e, body: new Uint8Array(e.body) });
        }
        const forkState: AdapterState = {
          entries: cloned,
          snapshots: new Map(),
          forks: new Map(),
        };
        const info: ForkInfo = {
          name: opts.name,
          fromSnapshot: opts.fromSnapshot,
          createdAt: new Date(),
        };
        state.forks.set(opts.name, {
          info,
          impl: createImpl(forkState),
        });
        return info;
      },

      async list() {
        return Array.from(state.forks.values()).map((f) => f.info);
      },

      async head(name) {
        const fork = state.forks.get(name);
        if (!fork) throw notFound(`fork ${name} not found`);
        return fork.info;
      },

      async delete(name) {
        state.forks.delete(name);
      },

      get(name) {
        const fork = state.forks.get(name);
        // Throw synchronously here (unlike `snapshots.get`): a writable fork
        // has no useful "empty" mode — the next write would silently land in
        // a nonexistent location. Failing early is friendlier.
        if (!fork) throw notFound(`fork ${name} not found`);
        return fork.impl;
      },
    },
  };
}

/**
 * Construct an in-memory adapter, optionally seeded with existing entries.
 * The single `defineAdapter` call lives here; everything reachable through
 * `forks.get` is built by `createImpl` and wrapped by the outer recursion.
 */
export function inMemoryAdapter(seed?: Map<string, Entry>): Adapter {
  const state: AdapterState = {
    entries: seed ?? new Map(),
    snapshots: new Map(),
    forks: new Map(),
  };
  return defineAdapter(createImpl(state));
}
