# forks

Demonstrates `storage.forks` by running three pricing experiments side-by-side. The parent has a single `pricing.json`; each fork rewrites *that same file* with its own variant, so the divergence between forks shows up immediately when you read the file back.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples forks
```

Defaults to the filesystem adapter. See the [top-level examples README](../README.md#picking-an-adapter) for running against S3 or Tigris via `EXAMPLE_ADAPTER`.

## What the script does

1. Upload `pricing.json` to the parent (basic plan, $9.99).
2. **`storage.forks.create({ name })`** — three times, using branch-style names (`pricing-cheap`, `pricing-premium`, `pricing-free`, each with a per-run suffix). `fromSnapshot` is omitted, so each fork seeds directly from the parent's live state — copy-based adapters (FS, S3) just copy the source; Tigris forks the bucket natively.
3. In parallel, each fork rewrites `pricing.json` with its own variant (`$4.99`, `$19.99`, `$0`).
4. **`storage.forks.list()`** — enumerate forks. On Tigris this currently throws `NotSupported` pending an upstream `listBuckets({ sourceBucketName })` filter; the example catches that and falls back to the names it just created.
5. Read `pricing.json` across the parent and each fork to show the four divergent values side-by-side.
6. **`storage.forks.delete(name)`** — clean up all three forks.
