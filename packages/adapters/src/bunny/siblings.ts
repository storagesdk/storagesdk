import {
  type Adapter,
  type AdapterForks,
  type AdapterSnapshots,
  checkSignal,
  defaultDiff,
  defaultMerge,
  defaultRebase,
  emptyManifest,
  type ForkInfo,
  type ForkOptions,
  nextSnapshotId,
  type ReadOnlyAdapter,
  readManifest,
  type SnapshotInfo,
  StorageError,
  writeManifest,
} from '@storagesdk/core/adapter';

/**
 * What the sibling-prefix snapshot/fork logic needs from a transport. Both
 * Bunny adapters (Edge Storage HTTP and S3) lay a storage zone out the same
 * way — one key prefix per logical bucket — and differ only in how bytes
 * move, so each one supplies these four operations.
 */
export interface SiblingTransport<Raw> {
  /** Adapter for the logical bucket stored under the `bucket/` prefix. */
  at(bucket: string): Adapter<Raw>;
  /**
   * Copy every object under `from/` to `to/`, skipping the manifest (the
   * destination writes its own).
   */
  copyAll(from: string, to: string, signal?: AbortSignal): Promise<void>;
  /** Remove everything under `prefix/`. Must not throw. */
  destroy(prefix: string, signal?: AbortSignal): Promise<void>;
  /** Map a transport error to a `StorageError`. */
  asStorageError(err: unknown): StorageError;
}

/**
 * Snapshots and forks for one logical bucket in a Bunny storage zone.
 * Snapshots live at `<bucket>-snapshot-<id>/`, forks at `<forkName>/`, and
 * every location carries its own `.storagesdk.metadata.json` manifest.
 */
export function siblings<Raw>(
  transport: SiblingTransport<Raw>,
  bucket: string
): { snapshots: AdapterSnapshots; forks: AdapterForks<Raw> } {
  const { at, copyAll, destroy, asStorageError } = transport;

  return {
    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const id = nextSnapshotId(bucket);
        try {
          await copyAll(bucket, id, opts?.signal);
          await writeManifest(
            at(id),
            emptyManifest({ location: bucket, snapshotId: null })
          );

          const self = at(bucket);
          const meta = await readManifest(self);
          const info: SnapshotInfo = {
            id,
            createdAt: new Date(),
            ...(opts?.name !== undefined ? { name: opts.name } : {}),
          };
          meta.snapshots.push(info);
          await writeManifest(self, meta);
          return info;
        } catch (err) {
          await destroy(id, opts?.signal);
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        return (await readManifest(at(bucket))).snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const meta = await readManifest(at(bucket));
        const found = meta.snapshots.find((s) => s.id === id);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return found;
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        const self = at(bucket);
        const meta = await readManifest(self);
        // Only remove prefixes this bucket's manifest knows about. Every
        // logical bucket in the zone is a sibling prefix, so deleting an
        // unknown id blindly could wipe unrelated data.
        if (!meta.snapshots.some((s) => s.id === id)) return;
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        await destroy(id, opts?.signal);
        await writeManifest(self, meta);
      },

      get(id): ReadOnlyAdapter {
        const snap = at(id);
        return {
          download: (p, opts) => snap.download(p, opts),
          head: (p, opts) => snap.head(p, opts),
          list: (opts) => snap.list(opts),
          url: (p, opts) => snap.url(p, opts),
        };
      },
    },

    forks: {
      async create(opts: ForkOptions): Promise<ForkInfo> {
        checkSignal(opts.signal);
        const existing = await readManifest(at(bucket));
        // A zone has no native bucket guard, so two forks with the same
        // name would write to the same prefix. Check the manifest first so
        // duplicates surface as `Conflict`.
        if (existing.forks.some((f) => f.name === opts.name)) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }
        if (
          opts.fromSnapshot !== undefined &&
          !existing.snapshots.some((s) => s.id === opts.fromSnapshot)
        ) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${opts.fromSnapshot} not found`,
          });
        }
        // The fork's prefix must be free. It could be this bucket, or
        // another logical bucket in the zone that this manifest doesn't
        // know about — seeding into it would mix the two, and the
        // rollback below would then delete it.
        const taken =
          opts.name === bucket ||
          (
            await at(opts.name).list({
              limit: 1,
              ...(opts.signal ? { signal: opts.signal } : {}),
            })
          ).items.length > 0;
        if (taken) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }
        const source = opts.fromSnapshot ?? bucket;
        try {
          await copyAll(source, opts.name, opts.signal);
          await writeManifest(
            at(opts.name),
            emptyManifest({
              location: bucket,
              snapshotId: opts.fromSnapshot ?? null,
            })
          );

          const self = at(bucket);
          const meta = await readManifest(self);
          const info: ForkInfo = {
            name: opts.name,
            createdAt: new Date(),
            ...(opts.fromSnapshot !== undefined
              ? { fromSnapshot: opts.fromSnapshot }
              : {}),
          };
          meta.forks.push(info);
          await writeManifest(self, meta);
          return info;
        } catch (err) {
          await destroy(opts.name, opts.signal);
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        return (await readManifest(at(bucket))).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const meta = await readManifest(at(bucket));
        const found = meta.forks.find((f) => f.name === name);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return found;
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        const self = at(bucket);
        const meta = await readManifest(self);
        // Same guard as `snapshots.delete`: unknown names are a no-op.
        if (!meta.forks.some((f) => f.name === name)) return;
        meta.forks = meta.forks.filter((f) => f.name !== name);
        await destroy(name, opts?.signal);
        await writeManifest(self, meta);
      },

      get(name): Adapter<Raw> {
        return at(name);
      },

      merge: (name, opts) => defaultMerge(at(bucket), name, opts),
      rebase: (name, opts) => defaultRebase(at(bucket), name, opts),
      diff: (name, opts) => defaultDiff(at(bucket), name, opts),
    },
  };
}
