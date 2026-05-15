# snapshot-restore

Take a snapshot before a risky change, read the snapshot to inspect the old state, then restore from it.

## Run it from this repo

```sh
pnpm install
pnpm dev
```

## Run it standalone

Copy this folder out, then in your own project:

```sh
npm install @storagesdk/core @storagesdk/adapters
npm run dev
```

## What the script does

1. **Baseline.** Upload two files.
2. **`storage.snapshots.create({ name })`** — point-in-time read-only view. Returns a `SnapshotInfo` whose `id` is also the snapshot's storage location.
3. **Mutate** the live storage so it diverges from the snapshot.
4. **`storage.snapshots.get(id)`** — `ReadOnlyStorage` rooted at the snapshot. Same overloaded `download` as `Storage`.
5. **Restore** by copying snapshot entries back into live storage. The SDK doesn't ship a one-liner for restore on purpose — you can pick which keys to restore, or do it streaming, etc.
6. **`storage.snapshots.delete(id)`** — clean up the snapshot location.
