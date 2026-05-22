# snapshots

Demonstrates `storage.snapshots` end to end: upload, snapshot, upload more, snapshot again, then list and read each snapshot to show they're frozen point-in-time views of the parent.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples snapshots
```

Defaults to the filesystem adapter. See the [top-level examples README](../README.md#picking-an-adapter) for running against S3 or Tigris via `EXAMPLE_ADAPTER`.

## What the script does

The whole timeline runs inside a throwaway **sandbox fork** of the parent (`snap-demo-<suffix>`) so the demo never touches the parent bucket. At the end we drop every snapshot and then the fork itself, leaving no residue.

Each release **adds a new file** so the file list at each snapshot differs from the next — the graph reads top-to-bottom like a release log.

1. **`storage.forks.create({ name: 'snap-demo-<suffix>' })`** — spin up the sandbox.
2. **v0.1.0** — upload `README.md` to the sandbox, then `sandbox.snapshots.create({ name: 'v0.1.0' })`.
3. **v0.2.0** — add `auth.ts`, snapshot.
4. **v0.3.0** — add `billing.ts`, snapshot.
5. **v1.0.0** — add `CHANGELOG.md`, snapshot.
6. **HEAD (live)** — add `analytics.ts` (in development, not snapshotted).
7. **`sandbox.snapshots.list()`** — enumerate the four snapshots.
8. Walk `HEAD` and each snapshot via `sandbox.snapshots.get(id).list()` and print a git-log-style graph showing which files existed at each release.
9. **`sandbox.snapshots.delete(id)`** for each snapshot, then **`storage.forks.delete(sandboxName)`** — tear down the sandbox.
