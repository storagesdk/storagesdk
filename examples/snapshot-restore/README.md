# snapshot-restore

Take a snapshot before a risky change, read the snapshot to inspect the old state, then restore from it.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples snapshot-restore
```

## What the script does

1. **Baseline.** Upload two files.
2. **`storage.snapshots.create({ name })`** — point-in-time read-only view. Returns a `SnapshotInfo` whose `id` is also the snapshot's storage location.
3. **Mutate** the live storage so it diverges from the snapshot.
4. **`storage.snapshots.get(id)`** — `ReadOnlyStorage` rooted at the snapshot. Same overloaded `download` as `Storage`.
5. **Restore** by copying snapshot entries back into live storage. The SDK doesn't ship a one-liner for restore on purpose — you can pick which keys to restore, or do it streaming, etc.
6. **`storage.snapshots.delete(id)`** — clean up the snapshot location.
