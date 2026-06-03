---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/bunny` adapter for [Bunny Storage](https://docs.bunny.net/reference/storage-api).

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
