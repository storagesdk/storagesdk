---
"@storagesdk/core": minor
"@storagesdk/adapters": minor
---

Initial public release.

### `@storagesdk/core`
- `Storage` class with overloaded `download(as: 'stream' | 'text' | 'bytes' | 'blob' | 'json')`.
- `StorageError` with typed codes: `NotFound | NotSupported | Conflict | Unauthorized | InvalidArgument | Aborted | Provider`.
- `snapshots` and `forks` as core namespaces (`storage.snapshots.create`, `forks.get(name)`, etc.).
- `Raw` generic — `storage.raw` is typed to the underlying SDK on adapters that opt in.
- `AbortSignal` threaded through every public op.
- `@storagesdk/core/adapter` — author entry exposing `defineAdapter`, contract types, `Manifest` helpers, abort utilities, and stream helpers.

### `@storagesdk/adapters`
- `@storagesdk/adapters/fs` — filesystem (development and tests).
- `@storagesdk/adapters/s3` — Amazon S3 and S3-compatible backends. Multipart upload, signed URLs, sibling-bucket snapshots/forks.
- `@storagesdk/adapters/r2` — Cloudflare R2.
- `@storagesdk/adapters/minio` — MinIO.
- `@storagesdk/adapters/tigris` — Tigris (native snapshots and forks via `@tigrisdata/storage` 3.8.1+).
- `@storagesdk/adapters/test-suite` — cross-adapter conformance suite for third-party adapter authors.
