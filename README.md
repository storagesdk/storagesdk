# storagesdk

[![npm version](https://img.shields.io/npm/v/@storagesdk/core?label=%40storagesdk%2Fcore)](https://www.npmjs.com/package/@storagesdk/core)
[![CI](https://github.com/storagesdk/storagesdk/actions/workflows/ci.yml/badge.svg)](https://github.com/storagesdk/storagesdk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@storagesdk/core)](./LICENSE)

A multi-provider SDK for object storage. One API across S3, Cloudflare R2, MinIO, Tigris, and local filesystems — with **snapshots** and **forks** as core operations alongside upload, download, list, copy, move, delete, and signed URLs.

```sh
npm install @storagesdk/core @storagesdk/adapters
```

```ts
import { Storage } from '@storagesdk/core';
import { s3 } from '@storagesdk/adapters/s3';

const storage = new Storage({
  adapter: s3({
    bucket: 'photos',
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });
const url = await storage.url('hello.txt', { expiresIn: 300 });

const snap = await storage.snapshots.create({ name: 'pre-migration' });
await storage.forks.create({ name: 'photos-exp', fromSnapshot: snap.id });
const fork = storage.forks.get('photos-exp');
await fork.upload('hello.txt', 'mutated in fork only');
```

## What you get

- **Snapshots and forks as primitives.** Take a snapshot of a bucket, get a read-only handle, fork from it as a writable branch. Native APIs where available (Tigris); sibling buckets/folders otherwise.
- **Typed escape hatch.** `storage.raw` is typed to the underlying SDK (e.g. `S3Client` on the S3 adapter) for backend-specific operations storagesdk doesn't surface.
- **ESM-only, Node 20+.** Plain `tsc` build, no bundler.

## Adapters

| Adapter | Subpath | Backend |
| --- | --- | --- |
| Filesystem | `@storagesdk/adapters/fs` | Local `node:fs/promises`. For development and tests. |
| S3 | `@storagesdk/adapters/s3` | Amazon S3 and any S3-compatible backend (DigitalOcean Spaces, Backblaze B2, etc.). |
| R2 | `@storagesdk/adapters/r2` | [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/). |
| MinIO | `@storagesdk/adapters/minio` | [MinIO](https://min.io/). |
| Tigris | `@storagesdk/adapters/tigris` | [Tigris](https://www.tigrisdata.com/) — snapshots and forks are first-class via Tigris's native APIs. |

Each adapter has its own README with config details, escape-hatch examples, and any backend-specific notes. See `packages/adapters/src/<adapter>/README.md`.

## API

```ts
class Storage<Raw = unknown> {
  constructor(opts: { adapter: Adapter<Raw> });

  readonly raw: Raw;
  readonly snapshots: { create, list, head, delete, get };
  readonly forks:     { create, list, head, delete, get };

  upload(path: string, body: BodyInput, opts?: UploadOptions): Promise<StorageItemMeta>;

  // download — single signature returns full StorageItem; overloads return typed bodies
  download(path: string, opts?: { signal? }):                            Promise<StorageItem>;
  download(path: string, opts: { as: 'stream', signal? }):               Promise<ReadableStream<Uint8Array>>;
  download(path: string, opts: { as: 'text',   signal? }):               Promise<string>;
  download(path: string, opts: { as: 'bytes',  signal? }):               Promise<Uint8Array>;
  download(path: string, opts: { as: 'blob',   signal? }):               Promise<Blob>;
  download(path: string, opts: { as: 'json',   signal? }):               Promise<unknown>;

  head(path: string, opts?: { signal? }):                                Promise<StorageItemMeta>;
  list(opts?: ListOptions):                                              Promise<ListResult>;
  delete(path: string, opts?: { signal? }):                              Promise<void>;
  copy(from: string, to: string, opts?: { signal? }):                    Promise<void>;
  move(from: string, to: string, opts?: { signal? }):                    Promise<void>;
  url(path: string, opts?: UrlOptions):                                  Promise<string>;
  uploadUrl(path: string, opts?: UploadUrlOptions):                      Promise<UploadUrlResult>;
}
```

### `snapshots` and `forks`

```ts
storage.snapshots.create(opts?: { name?, signal? }):         Promise<SnapshotInfo>;
storage.snapshots.list():                                    Promise<SnapshotInfo[]>;
storage.snapshots.head(id: string, opts?: { signal? }):      Promise<SnapshotInfo>;
storage.snapshots.delete(id: string, opts?: { signal? }):    Promise<void>;
storage.snapshots.get(id: string):                           ReadOnlyStorage; // .download, .head, .list, .url

storage.forks.create(opts: { name, fromSnapshot?, signal? }): Promise<ForkInfo>;
storage.forks.list():                                         Promise<ForkInfo[]>;
storage.forks.head(name: string, opts?: { signal? }):         Promise<ForkInfo>;
storage.forks.delete(name: string, opts?: { signal? }):       Promise<void>;
storage.forks.get(name: string):                              Storage<Raw>;    // full read/write
```

### `uploadUrl` — PUT vs POST

```ts
// PUT: default. Returns a signed URL the client uploads to with PUT.
storage.uploadUrl('photo.jpg', { expiresIn: 300, contentType: 'image/jpeg' });
// → { method: 'PUT', url, headers? }

// POST: triggered by `maxSize` or `minSize`. Returns a presigned POST URL +
// form fields the browser submits as multipart/form-data. Enforces size and
// content-type bounds server-side.
storage.uploadUrl('photo.jpg', { expiresIn: 300, maxSize: 5_000_000, contentType: 'image/jpeg' });
// → { method: 'POST', url, fields }
```

### Errors

Every operation throws `StorageError`. The `code` is a typed union:

```ts
type StorageErrorCode =
  | 'NotFound'         // missing key, missing snapshot/fork
  | 'NotSupported'     // adapter doesn't implement this op
  | 'Conflict'         // duplicate fork name, etc.
  | 'Unauthorized'     // 401/403 from the backend
  | 'InvalidArgument'  // bad path, sidecar-suffix collision, etc.
  | 'Aborted'          // caller's AbortSignal fired
  | 'Provider';        // unmapped backend error (cause attached)
```

## Common patterns

### Snapshots — read frozen state after live writes

```ts
await storage.upload('photo.jpg', 'before');
const snap = await storage.snapshots.create({ name: 'baseline' });
await storage.upload('photo.jpg', 'after');

const reader = storage.snapshots.get(snap.id);
await reader.download('photo.jpg', { as: 'text' });   // 'before'
await storage.download('photo.jpg', { as: 'text' });  // 'after'
```

### Forks — branch and mutate

```ts
const snap = await storage.snapshots.create();
await storage.forks.create({ name: 'experiment', fromSnapshot: snap.id });

const fork = storage.forks.get('experiment');
await fork.upload('config.json', JSON.stringify({ flag: true }));
// parent unchanged; fork has its own writable view
```

`forks.create` also accepts no `fromSnapshot` — the fork starts at the parent's live state at creation time.

### Signed URLs

```ts
await storage.url('photo.jpg', { expiresIn: 300 });          // 5-min GET URL
await storage.uploadUrl('new.jpg', { expiresIn: 300 });      // PUT URL + method
```

### Streaming download

```ts
const stream = await storage.download('large.mp4', { as: 'stream' });
// Web ReadableStream<Uint8Array>
```

### AbortSignal

```ts
const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 5000);

await storage.upload('big.bin', body, { signal: ctrl.signal });
// throws StorageError({ code: 'Aborted' }) if signal fires
```

### Escape hatch

```ts
import type { S3Client } from '@aws-sdk/client-s3';

const storage = new Storage({ adapter: s3({ bucket: 'photos' }) });
//    ↑ Storage<S3Client>, no cast needed

storage.raw.send(new SomePowerUserCommand({ /* ... */ }));
```

## Examples

Runnable examples live under [`examples/`](./examples). Each picks the adapter at runtime via `EXAMPLE_ADAPTER`; out of the box they run against a local filesystem so you can try them without any setup:

```sh
pnpm install
pnpm --filter @storagesdk/examples quickstart
pnpm --filter @storagesdk/examples snapshots
pnpm --filter @storagesdk/examples forks
```

## Authoring adapters

`@storagesdk/adapters` is *one* set of backends; the SDK is designed for third-party adapters too.

```sh
npm install @storagesdk/core
```

```ts
import {
  defineAdapter,
  type Adapter,
  StorageError,
} from '@storagesdk/core/adapter';

export function myAdapter(config: MyConfig): Adapter {
  return defineAdapter({
    name: 'my-backend',
    raw: /* your client */,
    async upload(path, body, opts) { /* ... */ },
    async download(path, opts) { /* ... */ },
    async head(path, opts) { /* ... */ },
    async list(opts) { /* ... */ },
    async delete(path, opts) { /* ... */ },
    async copy(from, to, opts) { /* ... */ },
    async move(from, to, opts) { /* ... */ },
    async url(path, opts) { /* ... */ },
    async uploadUrl(path, opts) { /* ... */ },
    snapshots: { /* create, list, head, delete, get */ },
    forks:     { /* create, list, head, delete, get */ },
  });
}
```

`@storagesdk/core/adapter` is the adapter-authoring entry. It exposes:

- `defineAdapter` — wraps your implementation with path normalization (leading slashes stripped, empty paths throw) and recursive wrapping for `snapshots.get` / `forks.get` returns.
- `Adapter`, `ReadOnlyAdapter`, `AdapterSnapshots`, `AdapterForks` — the contract types.
- `Manifest` helpers (`emptyManifest`, `readManifest`, `writeManifest`, `nextSnapshotId`, `isInternalKey`, `MANIFEST_PATH`) for copy-based adapters that store snapshot/fork lineage as a sibling location.
- `checkSignal`, `isAbortError`, `bridgeSignalToController` — abort-handling helpers (Web `AbortSignal` → SDK `AbortController` bridge with listener cleanup).
- `toWebStream`, `readStreamToBytes` — stream utilities.

### Verifying your adapter

Drop in the conformance test suite:

```sh
npm install --save-dev vitest @storagesdk/adapters
```

```ts
// my-adapter.test.ts
import { storageAdapterTestSuite } from '@storagesdk/adapters/test-suite';
import { myAdapter } from './my-adapter.js';

storageAdapterTestSuite({
  name: 'my-adapter',
  adapter: () => myAdapter({ /* config */ }),
});
```

The suite runs the cross-adapter behavioral tests (upload round-trip, NotFound on missing keys, snapshots/forks contract, AbortSignal short-circuit, etc.) against your adapter. Tests it fails are gaps you need to close.

## Contributing

See [`AGENTS.md`](./AGENTS.md) for development setup, gates (lint / typecheck / build / test), and the design decisions that aren't up for re-litigation.

## License

[Apache 2.0](./LICENSE).
