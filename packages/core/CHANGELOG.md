# @storagesdk/core

## 0.4.1

### Patch Changes

- 701ff70: New `@storagesdk/adapters/github` adapter for [GitHub](https://github.com) repositories. Object operations go through the Contents API; snapshots and forks are first-class git refs — every snapshot is a tag, every fork is a branch.

  ```ts
  import { github } from "@storagesdk/adapters/github";

  const storage = new Storage({
    adapter: github({
      owner: "storagesdk",
      repo: "agent-artifacts",
      // branch defaults to the repo's default branch
      // token defaults to process.env.GITHUB_TOKEN
    }),
  });

  // Snapshot = tag. Tag name is the snapshot id.
  const snap = await storage.snapshots.create({ name: "pre-migration" });

  // Fork = branch, optionally seeded from a tag.
  await storage.forks.create({ name: "experiment", fromSnapshot: snap.id });
  const fork = storage.forks.get("experiment");
  await fork.upload("config.json", JSON.stringify({ flag: true }));
  ```

  `storage.raw` is the underlying `Octokit` instance — reach for it when you need an API the adapter doesn't surface.

  **v1 limits:**
  - Files ≤ 1 MB only (Contents API cap). Larger files throw `InvalidArgument`; native large-file support via the Git Data API is on the roadmap.
  - `uploadUrl()` throws `NotSupported` (GitHub has no presigned upload URLs).
  - User metadata and `contentType` are dropped — git tracks file content + path, not arbitrary metadata.
  - Every write op creates a commit; default message is `"storagesdk: <op> <path>"`, overridable via the `commitMessage` config field.

  **`@storagesdk/core` patch:** re-export `DownloadOptions` from the public entry alongside the other options types.

## 0.4.0

### Minor Changes

- 698c6cd: `download` now accepts an optional `range` to fetch a byte slice instead of the full object.

  ```ts
  const item = await storage.download("video.mp4", {
    range: { offset: 0, length: 65_536 },
  });
  item.size; // 65536 (slice length, not full-object size)
  ```

  Same shape for the typed-body overloads:

  ```ts
  const bytes = await storage.download("big.bin", {
    as: "bytes",
    range: { offset: 4096, length: 1024 },
  });
  ```

  **Mapping per adapter:**
  - s3, r2, minio: `Range: bytes=N-M` on `GetObjectCommand`.
  - azure: `BlobClient.download(offset, count)` (native two-arg signature).
  - gcs: `createReadStream({ start, end })`.
  - vercel: `Range` header passed through `get`'s `headers` option.
  - tigris: slice-fallback (`@tigrisdata/storage`'s `get` doesn't expose range yet — egress is full object, slice is in-process). Will swap to native when the SDK adds it.
  - fs: in-memory slice of the full read.

  **Contract:**
  - `range.offset` must be `>= 0`, `range.length` must be `> 0`. Validated in `defineAdapter` and surfaced as `InvalidArgument`.
  - `range` past EOF returns whatever bytes exist — no error. Matches HTTP `Range` semantics.
  - `StorageItem.size` is the slice length, not the full-object size.

  The `ReadOnlyAdapter.download` signature changed: `opts?` is now `DownloadOptions` (`{ signal?, range? }`) instead of the inline `{ signal? }`. Third-party adapters that implement the interface continue to compile (method-param bivariance) but should accept and pass through `range` to honor the contract — the conformance suite has six new tests that exercise it.

## 0.3.0

### Minor Changes

- 0abe871: Two new adapters under `@storagesdk/adapters`.

  ### `@storagesdk/adapters/azure`

  Azure Blob Storage. Maps a container to a storagesdk bucket; snapshots and forks use the sibling-container convention (server-side `Copy Blob`). Auth via account name + key. `maxSize`/`minSize` on `uploadUrl` are silently dropped — Azure SAS has no `content-length-range` equivalent.

  ```ts
  import { azure } from "@storagesdk/adapters/azure";
  const storage = new Storage({
    adapter: azure({ bucket, accountName, accountKey }),
  });
  ```

  ### `@storagesdk/adapters/gcs`

  Google Cloud Storage. Snapshots and forks via sibling-bucket copy. Auth via service-account credentials (inline JSON, key file path, or Application Default Credentials). Supports v4 POST policies on `uploadUrl` for browser-direct uploads.

  ```ts
  import { gcs } from "@storagesdk/adapters/gcs";
  const storage = new Storage({
    adapter: gcs({ bucket, projectId, keyFilename }),
  });
  ```

  ### Other changes
  - **fs**: `uploadUrl` no longer throws `NotSupported` when `maxSize`/`minSize` is set — silently degrades to a PUT URL. Option-level constraints that a backend can't enforce now degrade across the board; the per-adapter README documents what's enforced.
  - **examples**: `EXAMPLE_ADAPTER=azure|gcs` wired alongside the existing options.
  - **docs**: top-level README adapter table and `AGENTS.md` running-tests section now cover the two new adapters.

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
