# @storagesdk/adapters/tigris

Tigris adapter for storagesdk. Snapshots and forks are first-class via Tigris's native APIs — no manifest convention, no copy-based bookkeeping.

```ts
import { Storage } from '@storagesdk/core';
import { tigris } from '@storagesdk/adapters/tigris';

const storage = new Storage({
  adapter: tigris({
    bucket: 'my-bucket',
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!,
  }),
});

await storage.upload('hello.txt', 'hi');
const item = await storage.download('hello.txt', { as: 'text' });
```

## Configuration

```ts
tigris({
  bucket: string;                  // bucket the adapter operates on (must already exist)
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;               // optional; defaults to Tigris's production endpoint
  forcePathStyle?: boolean;        // optional
})
```

Credentials are required and explicit — the adapter does not fall back to env vars or credential providers at this layer. `endpoint` is optional: omit it to use Tigris's built-in default, or override it for self-hosted / staging environments.

## Snapshots and forks

Native — no manifest sidecar, no `CopyObject` loop. The adapter wraps the corresponding `@tigrisdata/storage` functions.

- `storage.snapshots.create({ name })` → `createBucketSnapshot`
- `storage.snapshots.list()` → `listBucketSnapshots`
- `storage.snapshots.get(id)` → returns a `ReadOnlyStorage` whose reads pass `snapshotVersion: id` through to every Tigris call. No data is copied. `url()` uses `getPresignedUrl({ snapshotVersion })` so the signed URL serves the frozen snapshot bytes.
- **`storage.snapshots.delete(id)` throws `NotSupported`.** Tigris snapshots are point-in-time *references* to existing bucket state, not separate copies. There is no per-snapshot data to remove — storage cost is tied to the underlying object versions.
- `storage.forks.create({ name, fromSnapshot })` → `createBucket({ sourceBucketName, sourceBucketSnapshot })`
- `storage.forks.list()` / `storage.forks.head(name)` → `listForks(bucket)`, then map / find by name
- `storage.forks.delete(name)` → `removeBucket(name, { force: true })`
- `storage.forks.get(name)` → full read/write `Storage` rooted at the fork bucket

## Escape hatch

`storage.raw` mirrors every export of `@tigrisdata/storage` with the adapter's auth, endpoint, and bucket already injected. Call each function exactly like the standalone SDK — no need to re-import, no need to thread `config` through every call. New SDK functions show up on `storage.raw` automatically.

```ts
const storage = new Storage({ adapter: tigris({ ... }) });

// Bucket-level ops Tigris exposes but the adapter doesn't surface directly:
await storage.raw.setBucketLifecycle('my-bucket', {
  lifecycleRules: [{ expiration: { days: 30 } }],
});

await storage.raw.setBucketCors('my-bucket', {
  rules: [{ allowedOrigins: '*', allowedMethods: ['GET'] }],
});

const info = await storage.raw.getBucketInfo('my-bucket');

// You can also pass a per-call `config` to override fields for one call
// (e.g. point at a different bucket); your overrides win, the adapter's
// resolved values fill any gaps.
await storage.raw.list({ config: { bucket: 'another-bucket' } });
```

## What's not implemented

- **`etag` on responses.** Tigris's `put`/`head`/`list` don't surface ETag in their public response types. The adapter returns `etag: ''` in `StorageItemMeta`. Consumers that depend on ETag should compute one client-side or use a different adapter.
- **`AbortSignal` plumbing.** Accepted in option types but not threaded through Tigris calls yet.
- **POST policies on `uploadUrl`.** Only PUT presigning.
