# @storagesdk/core

One API across object storage providers, with fork and snapshot built in.

```sh
npm install @storagesdk/core @storagesdk/adapters
```

`@storagesdk/core` is the consumer API. Pair it with an adapter from [`@storagesdk/adapters`](../adapters/README.md).

## Quickstart

```ts
import { Storage } from '@storagesdk/core';
import { fs } from '@storagesdk/adapters/fs';

const storage = new Storage({
  adapter: fs({ root: '/var/data', folder: 'photos' }),
});

await storage.upload('beach.jpg', blob, { contentType: 'image/jpeg' });
const item = await storage.download('beach.jpg');
```

## Object operations

```ts
await storage.upload(path, body, opts?);         // returns StorageItemMeta
await storage.download(path);                     // returns StorageItem (metadata + body)
await storage.head(path);                         // returns StorageItemMeta
await storage.list({ prefix?, limit?, cursor? }); // returns { items: StorageItemMeta[], cursor? }
await storage.delete(path);
await storage.copy(from, to);
await storage.move(from, to);
await storage.url(path, { expiresIn? });          // returns string
await storage.uploadUrl(path, opts?);             // returns { method: 'PUT' | 'POST', url, ... }
```

`body` accepts `Uint8Array`, `ArrayBuffer`, `string`, `Blob`, or `ReadableStream`.

### Typed downloads with `as`

`download()` is overloaded. The default returns the full `StorageItem`. Pass `as` to get a typed body:

```ts
await storage.download(path);                     // StorageItem
await storage.download(path, { as: 'stream' });   // ReadableStream<Uint8Array>
await storage.download(path, { as: 'text' });     // string
await storage.download(path, { as: 'bytes' });    // Uint8Array
await storage.download(path, { as: 'blob' });     // Blob
await storage.download(path, { as: 'json' });     // unknown — cast at the callsite
```

Streams are always Web `ReadableStream` regardless of runtime (browser, Node 20+, Workers, Deno, Bun). If you need a Node `Readable`, convert at the callsite with `Readable.fromWeb()`.

## Snapshots

Read-only views of the storage at a point in time.

```ts
const info = await storage.snapshots.create({ name: 'pre-migration' });
await storage.snapshots.list();          // SnapshotInfo[]
await storage.snapshots.head(info.id);   // SnapshotInfo
await storage.snapshots.delete(info.id);

const reader = storage.snapshots.get(info.id); // ReadOnlyStorage
await reader.download('beach.jpg', { as: 'text' });
```

## Forks

Writable storage seeded from a snapshot.

```ts
const fork = await storage.forks.create({ name: 'photos-exp', fromSnapshot: info.id });
await storage.forks.list();            // ForkInfo[]
await storage.forks.head('photos-exp');// ForkInfo
await storage.forks.delete('photos-exp');

const exp = storage.forks.get('photos-exp'); // Storage — full read/write
await exp.upload('new.jpg', blob);
```

## Errors

Every method throws `StorageError` with a normalized `code` and the original error attached as `cause`.

```ts
import { StorageError } from '@storagesdk/core';

try {
  await storage.download('missing.jpg');
} catch (e) {
  if (e instanceof StorageError && e.code === 'NotFound') {
    /* handle */
  }
  throw e;
}
```

Codes: `NotFound`, `NotSupported`, `Conflict`, `Unauthorized`, `InvalidArgument`, `Provider`.

## Escape hatch

Every adapter exposes its underlying native client (or whatever state it wants to surface) through `storage.raw`. The type of `raw` is carried through from the adapter — adapters that declare `Adapter<S3Client>` give you `storage.raw` typed as `S3Client` with no cast.

```ts
import { Storage } from '@storagesdk/core';
import { s3 } from '@storagesdk/adapters/s3';

const storage = new Storage({ adapter: s3({ bucket: 'photos', /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({/* ... */}));
//      ↑ typed as S3Client
```

For adapters that don't narrow `raw`, the type defaults to `unknown` — you cast at the callsite if you want to use it.

`storage.forks.get(name)` carries the same `raw` type, so escape-hatch access works the same on forks.

> Status: pre-release. See [`docs/RFC.md`](../../docs/RFC.md) and [`docs/PLAN.md`](../../docs/PLAN.md) at the repo root.
