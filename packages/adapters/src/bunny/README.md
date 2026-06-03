# @storagesdk/adapters/bunny

Adapter for [Bunny Edge Storage](https://docs.bunny.net/reference/storage-api).

```sh
npm install @storagesdk/core @storagesdk/adapters
```

No extra dependency — the adapter talks to the Edge Storage HTTP API directly with `fetch`.

```ts
import { Storage } from '@storagesdk/core';
import { bunny } from '@storagesdk/adapters/bunny';

const storage = new Storage({
  adapter: bunny({
    zone: 'my-storage-zone',
    bucket: 'photos',
    region: 'de',
    // accessKey defaults to process.env.BUNNY_STORAGE_ACCESS_KEY
    pullZone: 'my-zone.b-cdn.net', // for public url()
  }),
});

await storage.upload('beach.jpg', blob, { contentType: 'image/jpeg' });
const text = await storage.download('config.json', { as: 'text' });
const url = await storage.url('beach.jpg');
```

## How `zone` and `bucket` map

A Bunny **storage zone** is one flat key namespace, addressed by the storage-zone password. The adapter maps each storagesdk `bucket` to a **key prefix** within the zone (`<bucket>/<key>`), so multiple logical buckets can coexist in one zone and snapshots/forks can live as sibling prefixes alongside them.

If you only need one logical bucket per zone, pick any short name like `app`.

## Config

```ts
interface BunnyConfig {
  zone: string;
  bucket: string;
  accessKey?: string;
  region?: 'de' | 'uk' | 'ny' | 'la' | 'sg' | 'se' | 'br' | 'jh' | 'syd';
  endpoint?: string;
  pullZone?: string;
}
```

- `zone` — storage zone name. It's the first path segment of every request.
- `bucket` — logical bucket, becomes the key prefix.
- `accessKey` — the storage-zone **password** (read-write API key from the Bunny dashboard), **not** the account-level API key. Defaults to `process.env.BUNNY_STORAGE_ACCESS_KEY`.
- `region` — primary storage region. Defaults to `de` (Falkenstein), served from the bare `storage.bunnycdn.com` host; every other region prefixes the host with its code (e.g. `ny.storage.bunnycdn.com`).
- `endpoint` — override the storage origin entirely (e.g. a local mock). Takes precedence over `region`.
- `pullZone` — pull-zone hostname for public file URLs (see [URLs](#urls)).

## Snapshots and forks

Sibling-prefix convention — the same pattern as the Vercel Blob adapter. Each snapshot/fork is a new key prefix in the same zone, populated by copying every object. A `.storagesdk.metadata.json` manifest sits at the root of each prefix.

```ts
const snap = await storage.snapshots.create({ name: 'pre-migration' });
const reader = storage.snapshots.get(snap.id); // ReadOnlyStorage

await storage.forks.create({ name: 'experiment', fromSnapshot: snap.id });
const fork = storage.forks.get('experiment'); // Storage
await fork.upload('new.jpg', blob);
```

`forks.create` without `fromSnapshot` forks from the parent's live state.

Bunny has **no server-side copy**, so seeding a snapshot or fork streams every object's bytes through the client — cost is proportional to total bytes, not object count. The same is true of `copy` and `move`.

## What this adapter doesn't preserve

- **Custom metadata.** Bunny Edge Storage has no user-metadata field. `upload({ metadata })` silently drops the metadata. Use a sidecar object if you need per-object metadata.
- **Presigned uploads.** Bunny has no presigned upload URL. `uploadUrl()` throws `StorageError` with code `NotSupported`.

## URLs

Bunny Edge Storage has no presigned-URL concept; public reads are served by a **Pull Zone** linked to the storage zone.

- With `pullZone` set, `url()` returns the public CDN URL (`https://<pullZone>/<bucket>/<key>`), fetchable with no auth.
- Without it, `url()` falls back to the storage URL, which requires the `AccessKey` header to fetch — useful for server-side access, not for handing to a browser.

`url()` does not sign or expire the link; `expiresIn` is ignored.

## Escape hatch

`storage.raw` exposes a small frozen object with the adapter's resolved connection settings, so you can issue your own Edge Storage requests:

```ts
const { endpoint, zone, accessKey } = storage.raw;

await fetch(`${endpoint}/${zone}/photos/beach.jpg`, {
  method: 'DELETE',
  headers: { AccessKey: accessKey },
});
```

There's no client object to expose — the adapter is built directly on `fetch`.
```ts
interface BunnyRaw {
  endpoint: string;
  zone: string;
  accessKey: string;
  pullZone?: string;
}
```
