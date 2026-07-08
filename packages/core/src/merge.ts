import type { Adapter, ReadOnlyAdapter } from './adapter.js';
import { StorageError } from './errors.js';
import { isInternalKey } from './manifest.js';
import type {
  DiffOptions,
  ForkDiff,
  MergeOptions,
  RebaseOptions,
  SnapshotInfo,
  StorageItemMeta,
} from './types.js';

/**
 * Walk an adapter's full path listing, page by page. Yields one
 * `StorageItemMeta` per object. Filters out manifest internal keys so
 * callers don't have to. Adapters with a recursive `list()` semantic
 * (S3 family, GCS, Azure, Vercel, …) get the natural flat enumeration
 * here; FS and the others surface the same shape via their own list
 * impls. `signal` short-circuits the walk.
 */
async function* walkAll(
  adapter: ReadOnlyAdapter,
  signal?: AbortSignal
): AsyncGenerator<StorageItemMeta> {
  let cursor: string | undefined;
  do {
    const page = await adapter.list({
      ...(cursor !== undefined ? { cursor } : {}),
      ...(signal ? { signal } : {}),
    });
    for (const item of page.items) {
      if (isInternalKey(item.path)) continue;
      yield item;
    }
    cursor = page.cursor;
  } while (cursor !== undefined);
}

/**
 * Read every entry into an in-memory map keyed by path. Used by the
 * three-way diff — we need the full set of paths from each side before
 * we can decide what to write/delete. For huge buckets this is real
 * memory; future optimization could stream-diff once sorted, but
 * keeping it simple here.
 */
async function snapshotPaths(
  adapter: ReadOnlyAdapter,
  signal?: AbortSignal
): Promise<Map<string, StorageItemMeta>> {
  const byPath = new Map<string, StorageItemMeta>();
  for await (const item of walkAll(adapter, signal)) {
    byPath.set(item.path, item);
  }
  return byPath;
}

/**
 * Three-way diff used by the mutating side (`applyDiff`, for merge and
 * rebase). Not surfaced to callers as the diff preview — that's the
 * simpler two-way `computeTwoWayDiff` above `defaultDiff`. `source` is
 * what a hypothetical apply would be reading from, `dest` is what it
 * would mutate, `base` is the common ancestor used to tell adds from
 * "the other side just has it".
 *
 * Classification, per path:
 * - in base, not in source → source deleted it → `deleted` (if also
 *   absent from dest, no-op happens on apply, but we still report it as
 *   a delete intent for the diff)
 * - in source, not in dest → source added it → `added`
 * - in source, in dest → three signals resolve overlap:
 *   1. `source.etag === dest.etag` → identical bytes, skip
 *   2. `source.etag === base.etag` → source unchanged since base
 *      (content-etag adapters like git / S3), skip so parent-only
 *      edits aren't clobbered
 *   3. Both `lastModified` are meaningful (non-epoch) AND source is
 *      not strictly newer than dest → skip. Covers mtime-derived
 *      etags (FS's `size-mtimeMs` changes on every copy even for
 *      identical bytes) and true conflicts where parent's edit is
 *      later than fork's.
 *   4. Otherwise → `modified` (naive source-wins).
 * - both `etag` and `lastModified` missing on a path where it matters
 *   → throws `NotSupported`
 */
function computeDiff(
  sourceMap: Map<string, StorageItemMeta>,
  destMap: Map<string, StorageItemMeta>,
  baseMap: Map<string, StorageItemMeta>
): ForkDiff {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  // Candidates: paths the source can tell us anything new about. A
  // pure dest-only path that's not in base or source is something the
  // dest gained on its own — leave it alone.
  const candidates = new Set<string>();
  for (const k of sourceMap.keys()) candidates.add(k);
  for (const k of baseMap.keys()) candidates.add(k);

  for (const path of candidates) {
    const inSource = sourceMap.has(path);
    const inBase = baseMap.has(path);
    const inDest = destMap.has(path);

    if (inBase && !inSource) {
      if (inDest) deleted.push(path);
      continue;
    }
    if (!inSource) continue;

    if (!inDest) {
      // If the path was in base, dest deliberately deleted it — respect
      // that delete; don't resurrect the file. Only treat it as `added`
      // when source brought a genuinely new path (not in base).
      // Symmetric with the (inBase && !inSource) branch above: deletes
      // win over modifications in the naive strategy.
      if (inBase) continue;
      added.push(path);
      continue;
    }

    const sourceMeta = sourceMap.get(path);
    const destMeta = destMap.get(path);
    if (!sourceMeta || !destMeta) continue;

    // Primary discriminators: content etag then lastModified. Three
    // ways to conclude "source didn't change" (and so shouldn't
    // clobber the dest):
    //  - identical etags → identical bytes
    //  - source etag equals base etag → source unchanged since base
    //    (content-hash adapters: git blob SHAs, S3 content etags)
    //  - both mtimes meaningful AND source not strictly newer → covers
    //    mtime-derived etags (FS's `size-mtimeMs` changes on every
    //    copy) and "both edited, parent later" conflicts
    // If none of those fire, we treat it as `modified` — source-wins,
    // matching the locked naive strategy.
    const sourceEtag = sourceMeta.etag;
    const destEtag = destMeta.etag;
    const sourceMtime = sourceMeta.lastModified;
    const destMtime = destMeta.lastModified;
    const hasMtime =
      sourceMtime !== undefined &&
      destMtime !== undefined &&
      sourceMtime.getTime() > 0 &&
      destMtime.getTime() > 0;
    if (!sourceEtag && !destEtag && !hasMtime) {
      throw new StorageError({
        code: 'NotSupported',
        message:
          'merge / rebase / diff require etag or lastModified on every file; this adapter does not surface either',
      });
    }
    if (sourceEtag && destEtag && sourceEtag === destEtag) continue;
    if (sourceEtag) {
      const baseEtag = baseMap.get(path)?.etag;
      if (baseEtag && sourceEtag === baseEtag) continue;
    }
    if (
      hasMtime &&
      sourceMtime !== undefined &&
      destMtime !== undefined &&
      sourceMtime.getTime() <= destMtime.getTime()
    )
      continue;
    modified.push(path);
  }

  return { added, modified, deleted };
}

/**
 * Apply one direction of the three-way diff: walk the three sides, run
 * the per-path classifier, then mutate `dest` accordingly. After the
 * mutations land, snapshot the dest's new state and return that
 * `SnapshotInfo`. Used by both `defaultMerge` (dest = parent) and
 * `defaultRebase` (dest = fork). Only `signal` is read from `opts`;
 * source-side selection happens in the caller.
 */
async function applyDiff(
  source: ReadOnlyAdapter,
  base: ReadOnlyAdapter,
  dest: Adapter,
  opts: { signal?: AbortSignal } | undefined
): Promise<SnapshotInfo> {
  const signal = opts?.signal;
  if (signal?.aborted) throw aborted();
  const [sourceMap, baseMap, destMap] = await Promise.all([
    snapshotPaths(source, signal),
    snapshotPaths(base, signal),
    snapshotPaths(dest, signal),
  ]);

  const diff = computeDiff(sourceMap, destMap, baseMap);

  for (const path of diff.deleted) {
    if (signal?.aborted) throw aborted();
    await dest.delete(path, signal ? { signal } : undefined);
  }
  for (const path of [...diff.added, ...diff.modified]) {
    if (signal?.aborted) throw aborted();
    await copyOne(source, dest, path, signal);
  }

  return dest.snapshots.create(signal ? { signal } : undefined);
}

function aborted(): StorageError {
  return new StorageError({
    code: 'Aborted',
    message: 'operation aborted',
  });
}

/**
 * Stream a single path from `source` to `dest`, preserving the source's
 * content type. The stream variant of `download` keeps memory flat for
 * large objects; `upload` handles its own multipart decisioning.
 */
async function copyOne(
  source: ReadOnlyAdapter,
  dest: Adapter,
  path: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const item = await source.download(path, signal ? { signal } : undefined);
  await dest.upload(path, item.body, {
    ...(item.contentType !== undefined
      ? { contentType: item.contentType }
      : {}),
    ...(signal ? { signal } : {}),
  });
}

/**
 * Resolve the fork's base snapshot. Every fork created through
 * `forks.create()` (via `Storage`, which auto-snapshots when the caller
 * didn't pass `fromSnapshot`) ends up with one; if it's missing the
 * fork was created out-of-band and we have nothing to diff against.
 *
 * `snapshots.get(id)` is sync and adapter-specific on missing ids —
 * some return an empty reader, some return a reader scoped to a
 * non-existent location. Either way, computing the diff against
 * silently-empty base data gives WRONG results (everything in source
 * gets classified as "added"). Validate with `head(id)` first so the
 * caller gets a clear `NotFound` instead of a silently catastrophic
 * merge.
 */
async function getBase(
  parent: Adapter,
  fromSnapshot: string | undefined,
  signal?: AbortSignal
): Promise<ReadOnlyAdapter> {
  if (!fromSnapshot) {
    throw new StorageError({
      code: 'InvalidArgument',
      message:
        'fork has no fromSnapshot; merge / rebase / diff need a base for the three-way diff. Re-create the fork through Storage.forks.create()',
    });
  }
  await parent.snapshots.head(fromSnapshot, signal ? { signal } : undefined);
  return parent.snapshots.get(fromSnapshot);
}

/**
 * Naive three-way merge: pull the fork's files into the parent. Walks
 * fork-base, fork-current, and parent-current; deletes propagate;
 * modifications use newest `lastModified` wins; ties skip. Returns a
 * `SnapshotInfo` of the parent's post-merge state. Throws `NotSupported`
 * if the adapter can't surface `lastModified`.
 *
 * Adapters get this for free — when the impl passed to `defineAdapter`
 * doesn't supply `forks.merge`, the wrapper fills it in by calling this
 * helper on the raw impl. Adapter authors with a native merge API
 * (Tigris, GitHub) override `forks.merge` on the impl directly; this
 * helper is exported for callers who want to combine native and
 * default paths.
 */
export async function defaultMerge(
  parent: Adapter,
  forkName: string,
  opts?: MergeOptions
): Promise<SnapshotInfo> {
  const signal = opts?.signal;
  const forkInfo = await parent.forks.head(
    forkName,
    signal ? { signal } : undefined
  );
  const fork = parent.forks.get(forkName);
  const base = await getBase(parent, forkInfo.fromSnapshot, signal);
  return applyDiff(fork, base, parent, opts);
}

/**
 * Naive three-way rebase: pull the parent's files into the fork. Same
 * diff shape as `defaultMerge` with source/dest swapped — fork is the
 * destination, parent is the source. The post-op snapshot is taken on
 * the fork.
 */
export async function defaultRebase(
  parent: Adapter,
  forkName: string,
  opts?: RebaseOptions
): Promise<SnapshotInfo> {
  const signal = opts?.signal;
  const forkInfo = await parent.forks.head(
    forkName,
    signal ? { signal } : undefined
  );
  const dest = parent.forks.get(forkName);
  const base = await getBase(parent, forkInfo.fromSnapshot, signal);
  return applyDiff(parent, base, dest, opts);
}

/**
 * Report the raw two-way tree difference between fork and parent in the
 * chosen direction. Not a merge/rebase preview — merge/rebase apply a
 * source-wins-with-tiebreakers policy against the fork's base snapshot,
 * so paths reported here as `modified` may or may not be touched by an
 * actual merge (e.g., an unchanged fork against an edited parent still
 * shows up as `modified` because the tips differ, though merge would
 * skip it). Callers who need the exact set of writes should run the
 * mutating op on a throwaway snapshot fork.
 *
 * - `opts.direction = 'ahead'` (default): fork = source, parent = dest.
 * - `opts.direction = 'behind'`: parent = source, fork = dest.
 *
 * Classification per path:
 * - in source, not in dest → `added`
 * - in dest, not in source → `deleted`
 * - in both, `etag` differs (or, when either etag is missing, mtimes
 *   are meaningful and differ) → `modified`
 * - both `etag` and `lastModified` unusable on an overlapping path →
 *   throws `NotSupported`
 */
export async function defaultDiff(
  parent: Adapter,
  forkName: string,
  opts?: DiffOptions
): Promise<ForkDiff> {
  const signal = opts?.signal;
  const direction = opts?.direction ?? 'ahead';
  // `forks.head` is required so the polyfill fails cleanly (NotFound)
  // when the fork name is bogus instead of yielding an empty diff.
  await parent.forks.head(forkName, signal ? { signal } : undefined);
  const fork = parent.forks.get(forkName);

  const source: ReadOnlyAdapter = direction === 'ahead' ? fork : parent;
  const dest: ReadOnlyAdapter = direction === 'ahead' ? parent : fork;

  const [sourceMap, destMap] = await Promise.all([
    snapshotPaths(source, signal),
    snapshotPaths(dest, signal),
  ]);

  return computeTwoWayDiff(sourceMap, destMap);
}

/**
 * Two-way tree diff — what `defaultDiff` reports. Symmetric wrt the
 * source/dest role, but the caller decides which is which based on
 * `direction`. See `defaultDiff` for how "added / deleted / modified"
 * are populated per path.
 */
function computeTwoWayDiff(
  sourceMap: Map<string, StorageItemMeta>,
  destMap: Map<string, StorageItemMeta>
): ForkDiff {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const path of sourceMap.keys()) {
    if (!destMap.has(path)) {
      added.push(path);
      continue;
    }
    const sourceMeta = sourceMap.get(path);
    const destMeta = destMap.get(path);
    if (!sourceMeta || !destMeta) continue;
    if (sameContent(sourceMeta, destMeta)) continue;
    modified.push(path);
  }
  for (const path of destMap.keys()) {
    if (!sourceMap.has(path)) deleted.push(path);
  }
  return { added, modified, deleted };
}

/** True when two metas describe the same content. Etag equality is
 *  authoritative when both sides expose one; otherwise identical
 *  meaningful mtimes are the fallback. Throws `NotSupported` when
 *  neither signal is available on an overlapping path — silent
 *  false-negatives here would lie about tree state. */
function sameContent(a: StorageItemMeta, b: StorageItemMeta): boolean {
  if (a.etag && b.etag) return a.etag === b.etag;
  const am = a.lastModified;
  const bm = b.lastModified;
  const hasMtime =
    am !== undefined &&
    bm !== undefined &&
    am.getTime() > 0 &&
    bm.getTime() > 0;
  if (!a.etag && !b.etag && !hasMtime) {
    throw new StorageError({
      code: 'NotSupported',
      message:
        'diff requires etag or lastModified on every overlapping file; this adapter does not surface either',
    });
  }
  if (hasMtime && am && bm) return am.getTime() === bm.getTime();
  return false;
}
