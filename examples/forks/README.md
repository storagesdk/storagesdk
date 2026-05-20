# forks

Demonstrates `storage.forks` end to end: spin up multiple forks of the parent's live state, mutate them in parallel, list them, and read each side-by-side to show they're independent.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples forks
```

Defaults to the filesystem adapter. See the [top-level examples README](../README.md#picking-an-adapter) for running against S3 or Tigris via `EXAMPLE_ADAPTER`.

## What the script does

1. Upload a baseline file to the parent.
2. **`storage.forks.create({ name })`** — three times, with `fromSnapshot` omitted so the fork seeds from the parent's live state directly. Copy-based adapters (FS, S3) just copy the source; Tigris forks the bucket natively.
3. Use **`storage.forks.get(name)`** on each fork and upload a different file in parallel.
4. **`storage.forks.list()`** — enumerate forks. On Tigris this currently throws `NotSupported` pending an upstream `listBuckets({ sourceBucketName })` filter; the example catches that and falls back to the names it just created.
5. Walk the parent and each fork via `download`/`list` and print a side-by-side view showing the divergent contents.
6. **`storage.forks.delete(name)`** — clean up all three forks.
