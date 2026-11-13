---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/bunny` and `@storagesdk/adapters/bunny-s3` adapters for [Bunny Storage](https://docs.bunny.net/storage). `bunny` talks to the Edge Storage HTTP API and works on any storage zone; `bunny-s3` talks to the S3-compatible API and needs a zone created with S3 compatibility turned on.

```ts
import { Storage } from "@storagesdk/core";
import { bunny } from "@storagesdk/adapters/bunny";

const storage = new Storage({
  adapter: bunny({
    zone: "my-storage-zone",
    bucket: "demo",
    accessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
    region: "de",
    pullZone: "my-zone.b-cdn.net", // for public url()
  }),
});

const snap = await storage.snapshots.create({ name: "baseline" });
await storage.forks.create({ name: "experiment", fromSnapshot: snap.id });
```

**Notes:**

- No dependency — implemented directly against the Edge Storage HTTP API with `fetch`. `accessKey` is the storage-zone _password_ (falls back to `BUNNY_STORAGE_ACCESS_KEY`), not the account API key.
- A storage zone is one flat namespace, so each storagesdk `bucket` maps to a key prefix. Snapshots live at `<bucket>-snapshot-<id>/` and forks at `<forkName>/`, each with a `.storagesdk.metadata.json` manifest — the sibling-prefix convention shared with the Vercel Blob adapter.
- `head` uses Bunny's `DESCRIBE` request for per-object metadata; `list` walks directory levels.
- No server-side copy on Bunny, so `copy`/`move` and snapshot/fork seeding stream bytes through the client (O(bytes)).
- `opts.metadata` on `upload` is silently dropped — Bunny has no user-metadata field. Conformance flips `userMetadata: false`.
- `uploadUrl()` throws `NotSupported` (no presigned uploads). `url()` returns the public Pull Zone CDN URL when `pullZone` is set, otherwise the auth-required storage URL.
- `storage.raw` exposes the resolved `{ endpoint, zone, accessKey, pullZone }` for direct Edge Storage requests.
- `forks.merge`, `forks.rebase`, and `forks.diff` use the SDK defaults on both adapters.

```ts
import { bunnyS3 } from "@storagesdk/adapters/bunny-s3";

const storage = new Storage({
  adapter: bunnyS3({
    zone: "my-s3-storage-zone",
    bucket: "demo",
    accessKey: process.env.BUNNY_S3_ACCESS_KEY,
    region: "de",
  }),
});
```

**`bunny-s3` notes:**

- Object operations delegate to the S3 adapter, so user metadata, presigned `url()` / `uploadUrl()`, multipart uploads, and server-side copy all work. `storage.raw` is the `S3Client`. Needs the same `@aws-sdk/*` peer dependencies as the S3 adapter.
- The zone name is the S3 bucket and access key id; `accessKey` (the storage-zone password) is the secret access key.
- Same zone layout as `bunny`: each `bucket` is a key prefix, with snapshots at `<bucket>-snapshot-<id>/` and forks at `<forkName>/`. A zone's credentials can't create another zone, so the S3 adapter's sibling-bucket layout doesn't apply. Snapshot and fork seeding uses server-side `CopyObject`.
- Both adapters are in the runtime registry as `bunny` (`BUNNY_STORAGE_*`, `BUNNY_PULL_ZONE`) and `bunny-s3` (`BUNNY_S3_*`).
