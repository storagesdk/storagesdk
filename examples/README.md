# storagesdk examples

Runnable examples for each feature of [storagesdk](https://github.com/tigrisdata/storagesdk). Each one is an isolated workspace package — copy it out to your own project and it'll work standalone.

All examples use `@storagesdk/adapters/fs` so they run without any cloud credentials. To use a different backend, swap the adapter import in `src/index.ts`; the rest of the code stays the same.

## From this repo

```sh
cd examples/quickstart
pnpm install
pnpm dev
```

## Standalone

Copy any example folder out, then:

```sh
npm install @storagesdk/core @storagesdk/adapters
npm run dev
```

## Examples

| Folder | What it demonstrates |
| --- | --- |
| [`quickstart`](./quickstart) | Construct a `Storage`, upload, list, download, get a URL, delete. |
| [`snapshot-restore`](./snapshot-restore) | Take a snapshot before a risky change, read it back, restore from it. |
| [`fork-experiment`](./fork-experiment) | Fork from a snapshot, mutate the fork in isolation, throw it away or promote. |
