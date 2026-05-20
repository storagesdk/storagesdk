# fork-experiment

Fork your storage to try a risky change in isolation, then throw it away — or promote it.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples fork-experiment
```

Defaults to the filesystem adapter. See the [top-level examples README](../README.md#picking-an-adapter) for running against S3 or Tigris via `EXAMPLE_ADAPTER`.

## What the script does

1. **Baseline.** Upload one file to the main location.
2. **`storage.snapshots.create()`** — forks have to be seeded from a snapshot, not from the live keyspace.
3. **`storage.forks.create({ name, fromSnapshot })`** — the SDK materializes a new writable location seeded from the snapshot. `forks.create` throws `Conflict` if the name is already taken. The example uses a timestamped fork name so it's safe to run repeatedly across all adapters (bucket names need to be unique on cloud backends).
4. **`storage.forks.get(name)`** — returns a full read/write `Storage` rooted at the fork.
5. **Mutate the fork.** The main location is untouched.
6. **`storage.forks.delete(name)`** — throw away the experiment.

To **promote** a fork instead, list its entries and copy them back into the main location, then delete the fork. The SDK doesn't ship a promote helper — promotion strategies vary (full replace, merge, partial migration).
