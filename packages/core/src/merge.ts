import type { Adapter, ReadOnlyAdapter } from './adapter.js';
import { StorageError } from './errors.js';
import { isInternalKey } from './manifest.js';
import type {
  DiffOptions,
  ForkDiff,
  MergeOptions,
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
 * One direction of the three-way diff. `source` is what a hypothetical
 * apply would be reading from, `dest` is what it would mutate, `base`
 * is the common ancestor used to tell adds from "the other side just
 * has it".
 *
 * Classification, per path:
 * - in base, not in source → source deleted it → `deleted` (if also
 *   absent from dest, no-op happens on apply, but we still report it as
 *   a delete intent for the diff)
 * - in source, not in dest → source added it → `added`
 * - in source, in dest, source mtime strictly newer → `modified`
 * - everything else → no-op (not surfaced)
 * - missing `lastModified` on a path where it matters → throws
 *   `NotSupported`
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
    const sourceMtime = sourceMeta.lastModified;
    const destMtime = destMeta.lastModified;
    if (!sourceMtime || !destMtime) {
      throw new StorageError({
        code: 'NotSupported',
        message:
          'merge / rebase / diff require lastModified on every file; this adapter does not surface it',
      });
    }
    if (sourceMtime.getTime() > destMtime.getTime()) {
      modified.push(path);
    }
    // equal or older → skip
  }

  return { added, modified, deleted };
}

/**
 * Apply one direction of the three-way diff: walk the three sides, run
 * the per-path classifier, then mutate `dest` accordingly. After the
 * mutations land, snapshot the dest's new state and return that
 * `SnapshotInfo`. Used by both `defaultMerge` (dest = parent) and
 * `defaultRebase` (dest = fork). The post-op snapshot has no caller-
 * supplied name — `opts.snapshot` on `MergeOptions` is the *source* id,
 * not a label for the result.
 */
async function applyDiff(
  source: ReadOnlyAdapter,
  base: ReadOnlyAdapter,
  dest: Adapter,
  opts: MergeOptions | undefined
): Promise<SnapshotInfo> {
  const signal = opts?.signal;
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
 */
function getBase(parent: Adapter, fromSnapshot: string | undefined) {
  if (!fromSnapshot) {
    throw new StorageError({
      code: 'InvalidArgument',
      message:
        'fork has no fromSnapshot; merge / rebase / diff need a base for the three-way diff. Re-create the fork through Storage.forks.create()',
    });
  }
  return parent.snapshots.get(fromSnapshot);
}

/**
 * Naive three-way merge: pull the fork's files into the parent. Walks
 * fork-base, fork-current (or `opts.snapshot` of the fork) and
 * parent-current; deletes propagate; modifications use newest
 * `lastModified` wins; ties skip. Returns a `SnapshotInfo` of the
 * parent's post-merge state. Throws `NotSupported` if the adapter
 * can't surface `lastModified`.
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
  const forkInfo = await parent.forks.head(
    forkName,
    opts?.signal ? { signal: opts.signal } : undefined
  );
  const fork = parent.forks.get(forkName);
  // `opts.snapshot` (when set) is an id from the fork's own snapshot
  // namespace — merge that frozen view instead of fork-current.
  const source: ReadOnlyAdapter = opts?.snapshot
    ? fork.snapshots.get(opts.snapshot)
    : fork;
  const base = getBase(parent, forkInfo.fromSnapshot);
  return applyDiff(source, base, parent, opts);
}

/**
 * Naive three-way rebase: pull the parent's files into the fork. Same
 * diff shape as `defaultMerge` with source/dest swapped — fork is the
 * destination, parent is the source. The post-op snapshot is taken on
 * the fork. `opts.snapshot` (when set) is an id from the parent's own
 * snapshot namespace — rebase that frozen view onto the fork instead
 * of parent-current.
 */
export async function defaultRebase(
  parent: Adapter,
  forkName: string,
  opts?: MergeOptions
): Promise<SnapshotInfo> {
  const forkInfo = await parent.forks.head(
    forkName,
    opts?.signal ? { signal: opts.signal } : undefined
  );
  const dest = parent.forks.get(forkName);
  const source: ReadOnlyAdapter = opts?.snapshot
    ? parent.snapshots.get(opts.snapshot)
    : parent;
  const base = getBase(parent, forkInfo.fromSnapshot);
  return applyDiff(source, base, dest, opts);
}

/**
 * One-direction three-way diff of a fork against its base.
 *
 * - `opts.direction = 'ahead'` (default) returns what `forks.merge`
 *   would apply to the parent: fork = source, parent = destination.
 * - `opts.direction = 'behind'` returns what `forks.rebase` would
 *   apply to the fork: parent = source, fork = destination.
 *
 * `opts.snapshot` swaps in a frozen source view (a fork-snapshot for
 * `'ahead'`, a parent-snapshot for `'behind'`) — mirrors how
 * `MergeOptions.snapshot` works on merge / rebase.
 *
 * Same `NotSupported` story as merge / rebase — adapters that don't
 * surface `lastModified` from `head` throw from here too.
 */
export async function defaultDiff(
  parent: Adapter,
  forkName: string,
  opts?: DiffOptions
): Promise<ForkDiff> {
  const signal = opts?.signal;
  const direction = opts?.direction ?? 'ahead';
  const forkInfo = await parent.forks.head(
    forkName,
    signal ? { signal } : undefined
  );
  const fork = parent.forks.get(forkName);
  const base = getBase(parent, forkInfo.fromSnapshot);

  let source: ReadOnlyAdapter;
  let dest: ReadOnlyAdapter;
  if (direction === 'ahead') {
    source = opts?.snapshot ? fork.snapshots.get(opts.snapshot) : fork;
    dest = parent;
  } else {
    source = opts?.snapshot ? parent.snapshots.get(opts.snapshot) : parent;
    dest = fork;
  }

  const [sourceMap, destMap, baseMap] = await Promise.all([
    snapshotPaths(source, signal),
    snapshotPaths(dest, signal),
    snapshotPaths(base, signal),
  ]);

  return computeDiff(sourceMap, destMap, baseMap);
}
