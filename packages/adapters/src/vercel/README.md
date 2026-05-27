# @storagesdk/adapters/vercel

Adapter for [Vercel Blob](https://vercel.com/docs/vercel-blob).

```sh
npm install @storagesdk/core @storagesdk/adapters @vercel/blob
```

```ts
import { Storage } from '@storagesdk/core';
import { vercel } from '@storagesdk/adapters/vercel';

const storage = new Storage({
  adapter: vercel({
    bucket: 'photos',
    // token defaults to process.env.BLOB_READ_WRITE_TOKEN
  }),
});

await storage.upload('beach.jpg', blob, { contentType: 'image/jpeg' });
const text = await storage.download('config.json', { as: 'text' });
const url = await storage.url('beach.jpg');
```

## How `bucket` maps to Vercel Blob

Vercel Blob has no native bucket concept — every blob lives in a single flat pathname namespace within a Blob store. The adapter maps each storagesdk `bucket` to a **pathname prefix** (`<bucket>/<key>`), so multiple logical buckets can coexist in one Vercel Blob store. Snapshots and forks land at sibling prefixes (`<bucket>-snapshot-<id>/` and `<forkName>/`).

If you only need one logical bucket per store, pick any short name like `app`.

## Config

```ts
interface VercelBlobConfig {
  bucket: string;
  token?: string;
  access?: 'public' | 'private';
}
```

- `bucket` — logical bucket, becomes the pathname prefix.
- `token` — Vercel Blob read-write token. Defaults to `process.env.BLOB_READ_WRITE_TOKEN`, which the Vercel runtime sets automatically. Pass explicitly when running outside Vercel or when you want to override.
- `access` — `'public'` (default) or `'private'`. Public blobs are addressable via a CDN URL with no auth; private blobs require a signed URL to read. Controls the default for new uploads and the shape of `url()` results.

## Snapshots and forks

Sibling-prefix convention — same pattern as the filesystem adapter. Each snapshot/fork is a new pathname prefix in the same store, populated by Vercel Blob's server-side `copy` per object. A `.storagesdk.metadata.json` manifest sits at the root of each prefix.

```ts
const snap = await storage.snapshots.create({ name: 'pre-migration' });
const reader = storage.snapshots.get(snap.id); // ReadOnlyStorage

await storage.forks.create({ name: 'experiment', fromSnapshot: snap.id });
const fork = storage.forks.get('experiment'); // Storage
await fork.upload('new.jpg', blob);
```

`forks.create` without `fromSnapshot` forks from the parent's live state.

## What this adapter doesn't preserve

- **Custom metadata.** Vercel Blob has no user-metadata field. `upload({ metadata })` silently drops the metadata. Use a sidecar object if you need per-blob metadata.
- **`minSize` on `uploadUrl`.** Vercel Blob's signed PUT URLs enforce a maximum size via `maximumSizeInBytes` but have no lower bound. `minSize` is silently dropped.

## Public stores and read-your-writes consistency

Vercel Blob serves public blobs through a CDN, and the CDN can briefly return stale reads (including stale 404s) right after a write. The adapter passes `useCache: false` on every `download()` to bypass the CDN — but this option is only effective for **private** stores; on public stores it's ignored. If you use the snapshot/fork machinery (which relies on a `read → mutate → write` round-trip on the manifest), use a private store. Plain `upload`/`download`/`head`/`list` work fine on either.

## Signed URLs

`uploadUrl` returns `{ method: 'PUT', url }`. Vercel's presigned URLs bake the size cap and content-type allowlist into the signature itself — there's no separate POST policy. `maxSize` and `contentType` are honored; `minSize` is dropped.

For private blobs, `url()` returns a signed GET URL via the same delegation flow. For public blobs, it returns the CDN URL directly with no signing round-trip.

## Escape hatch

`storage.raw` exposes a small frozen object — `{ token, access }` — so you can call `@vercel/blob` functions directly with the adapter's resolved configuration:

```ts
import { list } from '@vercel/blob';

const { blobs } = await list({ token: storage.raw.token, prefix: 'photos/' });
```

There's no client object to expose because Vercel Blob's SDK is function-based, not class-based.
