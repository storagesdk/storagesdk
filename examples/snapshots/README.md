# snapshots

Demonstrates `storage.snapshots` end to end: upload, snapshot, upload more, snapshot again, then list and read each snapshot to show they're frozen point-in-time views of the parent.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples snapshots
```

Defaults to the filesystem adapter. See the [top-level examples README](../README.md#picking-an-adapter) for running against S3 or Tigris via `EXAMPLE_ADAPTER`.

## What the script does

1. Upload a baseline (`readme.md`, `config.json`).
2. **`storage.snapshots.create({ name: 'baseline' })`** — captures the current state.
3. Add a new file (`feature.ts`) and modify `config.json` on live storage.
4. **`storage.snapshots.create({ name: 'feature-added' })`** — captures the new state.
5. **`storage.snapshots.list()`** — enumerate all snapshots.
6. Walk `HEAD` (live) and each snapshot via `storage.snapshots.get(id).list()` and print a git-log-style graph showing the keys at each point in time.
7. **`storage.snapshots.delete(id)`** — clean up. Tigris treats snapshots as point-in-time *references* rather than separate copies, so its `snapshots.delete` throws `NotSupported`; the example catches that and continues.
