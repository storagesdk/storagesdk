# @storagesdk/adapters

## 0.4.0

### Minor Changes

- 76aa0de: New `@storagesdk/adapters/fly` — branded alias of the Tigris adapter for Fly.io's managed Tigris buckets. Same `Adapter<TigrisRaw>` contract, same snapshot/fork semantics; the alias exists so Fly users can import a name that matches their platform.

  ```ts
  import { fly } from "@storagesdk/adapters/fly";
  const storage = new Storage({
    adapter: fly({ bucket, accessKeyId, secretAccessKey, endpoint }),
  });
  ```

- 76aa0de: New `@storagesdk/adapters/railway` — branded alias of the Tigris adapter for [Railway Buckets](https://docs.railway.com/storage-buckets). Same `Adapter<TigrisRaw>` contract, same snapshot/fork semantics; the alias exists so Railway users can import a name that matches their platform.

  ```ts
  import { railway } from "@storagesdk/adapters/railway";
  const storage = new Storage({
    adapter: railway({ bucket, accessKeyId, secretAccessKey, endpoint }),
  });
  ```

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

- ea4a8c7: New `@storagesdk/adapters/vercel` adapter for [Vercel Blob](https://vercel.com/docs/vercel-blob).

  ```ts
  import { vercel } from "@storagesdk/adapters/vercel";
  const storage = new Storage({ adapter: vercel({ bucket: "photos" }) });
  ```

  Vercel Blob has no native bucket concept, so the adapter maps each storagesdk `bucket` to a pathname prefix within the Vercel Blob store. Snapshots and forks follow the sibling-prefix convention from the filesystem adapter; cross-prefix population uses Vercel's server-side `copy`.

  **Compat notes:**
  - `metadata` on `upload` is silently dropped — Vercel Blob has no user-metadata field.
  - `minSize` on `uploadUrl` is silently dropped — Vercel signed PUT URLs enforce a max size via `maximumSizeInBytes` but have no lower bound.

  Also adds a `metadata?: boolean` option to the `@storagesdk/adapters/test-suite` conformance suite (defaults to `true`). Adapters whose backend has no user-metadata concept opt out by setting it to `false`.

### Patch Changes

- a4c5437: Documentation only — no API or runtime changes.
  - Reorder the adapter table in the `@storagesdk/adapters` README.
  - Rename the `@storagesdk/adapters/fly` label from "Fly.io Tigris" to "Fly.io" in the package README and the adapter's own README/JSDoc.
  - Use "provider" instead of "backend" in the `@storagesdk/adapters` README and simplify the S3 description.
  - `@storagesdk/adapters/tigris` README: remove a stale "POST policies on `uploadUrl` — only PUT presigning today" note (the adapter has been forwarding `maxSize` / `minSize` to `@tigrisdata/storage` and returning the POST form when the SDK switches to it).

- 365ef28: ### `forks.create({ fromSnapshot })` — bogus-id contract relaxed

  The conformance test `forks.create with an unknown fromSnapshot` previously required `code: 'NotFound'`. To uphold that, every copy-based adapter pre-checked the snapshot id against its parent manifest (or via a native list call) before invoking the backend. That round-trip is fine for manifest-backed adapters but can mean an O(snapshots) scan on backends with native, unbounded snapshot lists.

  The conformance test now asserts the call throws a `StorageError` — no specific code. The actual failure mode that matters is "no silent success with an empty fork"; whether the error code is `NotFound`, `Provider`, or anything else is a less useful invariant to pin down at the contract level. Backends that map their copy-source-missing error to `NotFound` (e.g. AWS S3 surfacing `NoSuchBucket`) keep doing so; backends that surface it as something more generic do that.

  The explicit pre-checks in s3, gcs, azure, and tigris are removed. The only adapter that still pre-checks is the one whose backend would otherwise silently succeed with an empty fork — keep that one targeted, drop the others.

  No behavior change for callers passing a valid snapshot id. Callers branching on `code === 'NotFound'` for a bogus id will now see whatever code the underlying backend produces; refine adapter-side if you need that level of precision.

  ### `tigris` adapter

  Picks up two `get` options from `@tigrisdata/storage@^3.11.0`:
  - `range: { start, end }` — native byte-range reads. Drops the slice-the-full-body fallback the adapter was using since byte-range support shipped.
  - `includeMetadata: true` — returns `{ body, metadata }` so the same response carries `etag`, `modified`, `contentType`, and `userMetadata`. Previously the adapter's `download` returned `etag: ""` because the SDK didn't surface it; now it matches every other adapter.

  Peer dependency on `@tigrisdata/storage` bumps `^3.10.0` → `^3.11.0`.

- Updated dependencies [698c6cd]
  - @storagesdk/core@0.4.0

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

### Patch Changes

- Updated dependencies [0abe871]
  - @storagesdk/core@0.3.0

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

### Patch Changes

- Updated dependencies [ac02e27]
  - @storagesdk/core@0.2.0

## 0.1.1

### Patch Changes

- 230009f: Re-license from MIT to Apache-2.0. The Apache 2.0 license is permissive like MIT but adds an explicit patent grant from contributors to users, which is the more common default for libraries that may interact with patented techniques (e.g. cloud provider SDKs). Copyright remains attributed to `Tigris Data, Inc.`

  Downstream impact: if your project has a license allowlist, ensure `Apache-2.0` is permitted before upgrading.

- Updated dependencies [230009f]
  - @storagesdk/core@0.1.1

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

### Patch Changes

- Updated dependencies [bb22fc0]
  - @storagesdk/core@0.1.0
