# quickstart

The five-minute tour: construct a `Storage`, upload, list, download, get a URL, delete.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples quickstart
```

By default the example runs against the local filesystem (no config needed). To run against a cloud adapter, set `EXAMPLE_ADAPTER` and the relevant env vars — see the [top-level examples README](../README.md#picking-an-adapter) for the full table.

```sh
# S3
EXAMPLE_ADAPTER=s3 EXAMPLE_BUCKET=my-bucket \
EXAMPLE_ACCESS_KEY_ID=... EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Tigris
EXAMPLE_ADAPTER=tigris EXAMPLE_BUCKET=my-bucket \
EXAMPLE_ACCESS_KEY_ID=... EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart
```

The example code itself doesn't change between adapters — `getAdapter()` in `../adapter.ts` handles the selection.
