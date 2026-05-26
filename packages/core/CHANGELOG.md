# @storagesdk/core

## 0.2.0

### Minor Changes

- ac02e27: `uploadUrl` now supports S3-style POST policies for browser-direct uploads. Passing `maxSize` or `minSize` switches the returned shape from a presigned PUT URL to a presigned POST URL + form fields the browser submits as `multipart/form-data`.

  ```ts
  const signed = await storage.uploadUrl("photo.jpg", {
    expiresIn: 300,
    maxSize: 5 * 1024 * 1024,
    contentType: "image/jpeg",
  });
  // signed.method === 'POST'
  // signed.url + signed.fields go straight into a FormData submission
  ```

  - **s3**: implemented via `@aws-sdk/s3-presigned-post` (new optional peer dep). R2 and MinIO inherit POST automatically.
  - **tigris**: switched to `@tigrisdata/storage`'s new `getSignedUploadUrl` (SDK 3.9.0+). Bumps `@tigrisdata/storage` peer to `^3.9.0`.
  - **fs**: throws `StorageError({ code: 'NotSupported' })` when `maxSize`/`minSize` is set — `file://` URLs aren't enforceable upload policies.

  Existing PUT behavior is unchanged when no size constraints are passed.

  New example: `examples/browser-upload/` walks through the full server-mints-URL → browser-POSTs-file → server-verifies flow.

## 0.1.1

### Patch Changes

- 230009f: Re-license from MIT to Apache-2.0. The Apache 2.0 license is permissive like MIT but adds an explicit patent grant from contributors to users, which is the more common default for libraries that may interact with patented techniques (e.g. cloud provider SDKs). Copyright remains attributed to `Tigris Data, Inc.`

  Downstream impact: if your project has a license allowlist, ensure `Apache-2.0` is permitted before upgrading.

## 0.1.0

### Minor Changes

- bb22fc0: Initial public release.

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
