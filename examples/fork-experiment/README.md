# fork-experiment

Fork your storage to try a risky change in isolation, then throw it away — or promote it.

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

1. **Baseline.** Upload one file to the main location.
2. **`storage.snapshots.create()`** — forks have to be seeded from a snapshot, not from the live keyspace.
3. **`storage.forks.create({ name, fromSnapshot })`** — the SDK materializes a new writable location seeded from the snapshot. `forks.create` throws `Conflict` if the name is already taken.
4. **`storage.forks.get(name)`** — returns a full read/write `Storage` rooted at the fork.
5. **Mutate the fork.** The main location is untouched.
6. **`storage.forks.delete(name)`** — throw away the experiment.

To **promote** a fork instead, list its entries and copy them back into the main location, then delete the fork. The SDK doesn't ship a promote helper — promotion strategies vary (full replace, merge, partial migration).
