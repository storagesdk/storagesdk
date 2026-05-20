# snapshots

Demonstrates `storage.snapshots` end to end: upload, snapshot, upload more, snapshot again, then list and read each snapshot to show they're frozen point-in-time views of the parent.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples snapshots
```

Defaults to the filesystem adapter. See the [top-level examples README](../README.md#picking-an-adapter) for running against S3 or Tigris via `EXAMPLE_ADAPTER`.

## What the script does

Walks a tiny app through four releases. Each release **adds a new file** so the file list at each snapshot differs from the next — the graph reads top-to-bottom like a release log.

1. **v0.1.0** — upload `README.md`, then `snapshots.create({ name: 'v0.1.0' })`.
2. **v0.2.0** — add `auth.ts`, snapshot.
3. **v0.3.0** — add `billing.ts`, snapshot.
4. **v1.0.0** — add `CHANGELOG.md`, snapshot.
5. **HEAD (live)** — add `analytics.ts` (in development, not snapshotted).
6. **`storage.snapshots.list()`** — enumerate the four snapshots.
7. Walk `HEAD` and each snapshot via `storage.snapshots.get(id).list()` and print a git-log-style graph showing which files existed at each release.
8. **`storage.snapshots.delete(id)`** — clean up each snapshot. Tigris treats snapshots as point-in-time *references* rather than separate copies, so its `snapshots.delete` throws `NotSupported`; the example catches that and continues.
