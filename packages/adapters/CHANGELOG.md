# @storagesdk/adapters

## 0.9.0

### Minor Changes

- 01a7309: Add the Mesa adapter for repository-backed storage.

## 0.8.0

### Minor Changes

- fe9ceea: Add the Archil adapter for Archil disks via Archil's S3-compatible API.
- 06b28f9: Add the Code Storage adapter for repository-backed storage.

## 0.7.1

### Patch Changes

- c30e8da: fs: stream uploads to a temp file and atomically rename into place instead of buffering the whole body in memory, so large files and `ReadableStream` bodies no longer risk OOMing the process

## 0.7.0

### Minor Changes

- 43f4665: New root export on `@storagesdk/adapters` for runtime-driven adapter selection. Useful for CLIs, configuration-loaded code, and any place where the adapter is picked from a string at runtime.

  ```ts
  import {
    ADAPTERS,
    type AdapterName,
    type AdapterEnvVar,
    buildAdapter,
    getAdapterEnvVars,
  } from "@storagesdk/adapters";

  // Enumerate
  ADAPTERS;
  // readonly ['fs', 's3', 'r2', 'minio', 'tigris', 'azure', 'gcs', 'vercel',
  //           'github', 'webdav', 'backblaze', 'spaces', 'wasabi', 'supabase',
  //           'linode', 'fly', 'railway'] as const

  // Introspect (for CLI help, error messages, docs generation)
  getAdapterEnvVars("tigris");
  // → [
  //   { name: 'TIGRIS_BUCKET', required: true },
  //   { name: 'TIGRIS_ACCESS_KEY_ID', required: true },
  //   { name: 'TIGRIS_SECRET_ACCESS_KEY', required: true },
  //   { name: 'TIGRIS_ENDPOINT', required: false },
  //   { name: 'TIGRIS_FORCE_PATH_STYLE', required: false },
  // ]

  // Build (async — dynamic-import the factory + read env + construct)
  await buildAdapter("tigris");
  // → Adapter, ready for `new Storage({ adapter })`
  ```

  Five exports — three functions/constants, two types. Deliberately small surface.

  ## Env-var convention

  Each adapter reads `<ADAPTER>_*` env vars matching its config shape. Where the backend has a de-facto standard env-var convention (AWS, GCS, Vercel Blob, Azure), those are accepted as fallbacks:

  | Adapter          | Vars                                                                                                                                                             |
  | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `fs`             | `FS_ROOT`, `FS_FOLDER`                                                                                                                                           |
  | `s3`             | `S3_BUCKET`, `S3_ACCESS_KEY_ID?`, `S3_SECRET_ACCESS_KEY?`, `S3_REGION?`, `S3_ENDPOINT?`, `S3_FORCE_PATH_STYLE?` (falls back to `AWS_*`)                          |
  | `r2`             | `R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT?`                                                                         |
  | `minio`          | `MINIO_BUCKET`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_REGION?`, `MINIO_FORCE_PATH_STYLE?`                                   |
  | `tigris`         | `TIGRIS_BUCKET`, `TIGRIS_ACCESS_KEY_ID`, `TIGRIS_SECRET_ACCESS_KEY`, `TIGRIS_ENDPOINT?`, `TIGRIS_FORCE_PATH_STYLE?`                                              |
  | `azure`          | `AZURE_BUCKET`, `AZURE_ACCOUNT_NAME` (falls back to `AZURE_STORAGE_ACCOUNT`), `AZURE_ACCOUNT_KEY` (falls back to `AZURE_STORAGE_KEY`), `AZURE_ENDPOINT?`         |
  | `gcs`            | `GCS_BUCKET`, `GCS_PROJECT_ID` (falls back to `GOOGLE_CLOUD_PROJECT`), `GCS_KEY_FILENAME?` (falls back to `GOOGLE_APPLICATION_CREDENTIALS`), `GCS_API_ENDPOINT?` |
  | `vercel`         | `VERCEL_BLOB_BUCKET`, `VERCEL_BLOB_TOKEN?` (falls back to `BLOB_READ_WRITE_TOKEN`), `VERCEL_BLOB_ACCESS?`                                                        |
  | `github`         | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN?`, `GITHUB_BRANCH?`, `GITHUB_BASE_URL?`                                                                             |
  | `webdav`         | `WEBDAV_URL`, `WEBDAV_ROOT`, `WEBDAV_FOLDER`, `WEBDAV_USERNAME?`, `WEBDAV_PASSWORD?`, `WEBDAV_TOKEN?`, `WEBDAV_AUTH_TYPE?`                                       |
  | `backblaze`      | `B2_BUCKET`, `B2_REGION`, `B2_ACCESS_KEY_ID`, `B2_SECRET_ACCESS_KEY`, `B2_ENDPOINT?`                                                                             |
  | `spaces`         | `SPACES_BUCKET`, `SPACES_REGION`, `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_ENDPOINT?`                                                         |
  | `wasabi`         | `WASABI_BUCKET`, `WASABI_REGION`, `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_ENDPOINT?`                                                         |
  | `supabase`       | `SUPABASE_BUCKET`, `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_KEY_ID`, `SUPABASE_SECRET_ACCESS_KEY`, `SUPABASE_REGION?`, `SUPABASE_ENDPOINT?`                      |
  | `linode`         | `LINODE_BUCKET`, `LINODE_REGION`, `LINODE_ACCESS_KEY_ID`, `LINODE_SECRET_ACCESS_KEY`, `LINODE_ENDPOINT?`                                                         |
  | `fly`, `railway` | reuse `TIGRIS_*` — they're branded aliases of the Tigris adapter                                                                                                 |

  ## Why async `buildAdapter`

  Adapter implementations pull in heavy peer-SDK code (`@aws-sdk/client-s3`, `@azure/storage-blob`, etc.). Using a dynamic import keeps the static bundle to just the lightweight metadata; the actual factory + SDK only load when an adapter is requested. CLI consumers `await` once at startup; library consumers get bundle savings on code-split runtimes (Cloudflare Workers, Vercel Edge).

  `ADAPTERS` and `getAdapterEnvVars` are synchronous — they only deal with constants and static data.

  ## Existing subpath imports stay unchanged

  `import { tigris } from '@storagesdk/adapters/tigris'` still works exactly as before — tree-shakeable, only the one peer dep needed. The new root export is purely additive for runtime-driven use cases.

## 0.6.0

### Minor Changes

- f6c729b: New `@storagesdk/adapters/backblaze` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Backblaze B2 Cloud Storage](https://www.backblaze.com/b2/cloud-storage.html). Endpoint is built from `region` (e.g. `us-west-004` → `https://s3.us-west-004.backblazeb2.com`); override via `endpoint`.

  ```ts
  import { backblaze } from "@storagesdk/adapters/backblaze";

  const storage = new Storage({
    adapter: backblaze({
      bucket: "photos",
      region: "us-west-004",
      accessKeyId: process.env.B2_KEY_ID!,
      secretAccessKey: process.env.B2_APPLICATION_KEY!,
    }),
  });
  ```

  Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.

- f6c729b: New `@storagesdk/adapters/linode` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Linode Object Storage](https://www.linode.com/products/object-storage). Endpoint is built from `region` (the cluster name; e.g. `us-east-1` → `https://us-east-1.linodeobjects.com`); override via `endpoint`.

  ```ts
  import { linode } from "@storagesdk/adapters/linode";

  const storage = new Storage({
    adapter: linode({
      bucket: "photos",
      region: "us-east-1",
      accessKeyId: process.env.LINODE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.LINODE_SECRET_ACCESS_KEY!,
    }),
  });
  ```

  Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.

- f6c729b: New `@storagesdk/adapters/spaces` adapter — thin wrapper over `@storagesdk/adapters/s3` for [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces). Endpoint is built from `region` (e.g. `nyc3` → `https://nyc3.digitaloceanspaces.com`); override via `endpoint`.

  ```ts
  import { spaces } from "@storagesdk/adapters/spaces";

  const storage = new Storage({
    adapter: spaces({
      bucket: "photos",
      region: "nyc3",
      accessKeyId: process.env.DO_SPACES_KEY!,
      secretAccessKey: process.env.DO_SPACES_SECRET!,
    }),
  });
  ```

  Snapshots and forks are sibling Spaces via `CopyObject`, same as the rest of the S3-compatible family.

- f6c729b: New `@storagesdk/adapters/supabase` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Supabase Storage](https://supabase.com/storage)'s S3-compatible endpoint. Endpoint is built from `projectRef`; `forcePathStyle: true` is required and pre-set.

  ```ts
  import { supabase } from "@storagesdk/adapters/supabase";

  const storage = new Storage({
    adapter: supabase({
      bucket: "photos",
      projectRef: "abcdefghijklmnop",
      accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,
    }),
  });
  ```

  Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.

- f6c729b: New `@storagesdk/adapters/wasabi` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Wasabi Hot Cloud Storage](https://wasabi.com/cloud-storage). Endpoint is built from `region` (e.g. `us-east-1` → `https://s3.us-east-1.wasabisys.com`); override via `endpoint`.

  ```ts
  import { wasabi } from "@storagesdk/adapters/wasabi";

  const storage = new Storage({
    adapter: wasabi({
      bucket: "photos",
      region: "us-east-1",
      accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
      secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
    }),
  });
  ```

  Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.

- 3b80b1a: New `@storagesdk/adapters/webdav` adapter for any WebDAV server — Nextcloud, ownCloud, Apache mod_dav, nginx-dav, NAS appliances (Synology, QNAP, TrueNAS), and providers that still ship WebDAV (pCloud, mailbox.org, kDrive, TransIP STACK, disroot).

  ```ts
  import { Storage } from "@storagesdk/core";
  import { webdav } from "@storagesdk/adapters/webdav";

  const storage = new Storage({
    adapter: webdav({
      baseUrl: "https://cloud.example.com/remote.php/dav/files/me",
      root: "/storagesdk",
      folder: "demo",
      username: "me",
      password: process.env.WEBDAV_PASSWORD,
    }),
  });

  // Snapshots and forks ride on a single server-side COPY with Depth: infinity.
  const snap = await storage.snapshots.create({ name: "baseline" });
  await storage.forks.create({ name: "experiment", fromSnapshot: snap.id });
  ```

  **Notes:**
  - Peer dep: `webdav` (v5.x, ESM-only).
  - The `webdav` client is stateless — every method is an independent HTTP request, so there's no connection lifecycle to manage. Auth via Basic / Digest (auto-detected) / OAuth Bearer / None.
  - Snapshots and forks are sibling collections under `root`, populated by **one** `COPY` request with `Depth: infinity` (server-side, recursive). No client-side fan-out.
  - `contentType` is honored end-to-end (PUT `Content-Type` on upload, `getcontenttype` via PROPFIND on read).
  - `opts.metadata` on `upload` is silently dropped — WebDAV's PROPPATCH dead properties exist in the spec but server support is inconsistent. Conformance flips `userMetadata: false` to match.
  - `url()` returns the plain resource URL; caller supplies auth. `uploadUrl()` throws `NotSupported`.
  - `storage.raw` is the underlying `WebDAVClient` for PROPPATCH, LOCK, or anything the adapter doesn't surface directly.

### Patch Changes

- f6c729b: README sync — the root, `@storagesdk/core`, and `@storagesdk/adapters` README tables now point at [storagesdk.dev/adapters](https://storagesdk.dev/adapters) as the canonical, up-to-date list. The static README tables are kept as a quick-glance reference for the initial set; new adapters land on the docs site rather than every README.
- Updated dependencies [ece57f6]
- Updated dependencies [3b80b1a]
- Updated dependencies [f6c729b]
  - @storagesdk/core@0.4.2

## 0.5.0

### Minor Changes

- 701ff70: Conformance suite (`@storagesdk/adapters/test-suite`) — refactor adapter capability switches into a single `capabilities` object on `StorageAdapterTestSuiteOptions` with behavior-describing names:

  ```ts
  storageAdapterTestSuite({
    name: "my-adapter",
    adapter: buildAdapter,
    capabilities: {
      userMetadata: true, // adapter preserves user `metadata`
      contentType: true, // adapter preserves `contentType`
      presignedUploads: true, // `uploadUrl()` returns a usable URL
      fetchableSignedUrls: true, // `url()` is fetchable over HTTP
    },
  });
  ```

  Every flag defaults to `true`. Set one to `false` to opt out of the corresponding assertions when the backend doesn't support that behavior.

  This replaces the flat `metadata` and `httpSignedUrls` flags. The only call sites — `fs` and `vercel` — are migrated in the same change.

  Also adds `testTimeoutMs` to override vitest's default 5s per-test timeout for backends whose per-op latency makes the default too tight (e.g. adapters that hit a remote API many times per test).

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

### Patch Changes

- Updated dependencies [701ff70]
  - @storagesdk/core@0.4.1

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
