# @storagesdk/adapters/gcs

[Google Cloud Storage](https://cloud.google.com/storage) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @google-cloud/storage
```

```ts
import { Storage } from '@storagesdk/core';
import { gcs } from '@storagesdk/adapters/gcs';

const storage = new Storage({
  adapter: gcs({
    bucket: 'photos',
    projectId: process.env.GCS_PROJECT_ID!,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS!,
  }),
});
```

`bucket` is a GCS bucket. It must already exist (use `gcloud storage buckets create` or the Console).

## Configuration

```ts
gcs({
  bucket: string;            // GCS bucket the adapter operates on
  projectId: string;
  credentials?: { client_email: string; private_key: string };
  keyFilename?: string;      // path to a service-account JSON key file
  apiEndpoint?: string;      // override for fake-gcs-server emulation
})
```

### Credentials

Pass one of:

- `credentials: { client_email, private_key }` — inline.
- `keyFilename: '/path/to/key.json'` — service-account JSON key file.
- Omit both — uses [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) (`GOOGLE_APPLICATION_CREDENTIALS` env var, `gcloud auth application-default login`, GCE/GKE metadata server).

## Snapshots and forks

Each snapshot/fork creates a **sibling GCS bucket** populated by server-side copy. Manifest sits as a `.storagesdk.metadata.json` object at the bucket root; `list()` filters it out.

```ts
const snap = await storage.snapshots.create({ name: 'baseline' });
// snap.id is e.g. 'photos-snapshot-1748000000000123456789012'

const reader = storage.snapshots.get(snap.id);
await reader.download('photo.jpg');

await storage.forks.create({ name: 'photos-exp', fromSnapshot: snap.id });
const fork = storage.forks.get('photos-exp');
```

**GCS bucket names are globally unique across all of GCS.** The 25-digit snapshot-id suffix makes collisions effectively impossible for snapshots. Fork names are user-provided — pick something unlikely to collide globally (e.g. prefix with your org or project).

## Signed URLs

`url()` and `uploadUrl()` return v4-signed URLs. Default expiry is 1 hour.

```ts
await storage.url('photo.jpg', { expiresIn: 300 });
await storage.uploadUrl('new.jpg', { expiresIn: 300, contentType: 'image/jpeg' });
```

### POST policies

`uploadUrl({ maxSize, contentType })` returns a v4 POST policy when size constraints are set:

```ts
const { method, url, fields } = await storage.uploadUrl('photo.jpg', {
  expiresIn: 300,
  maxSize: 5 * 1024 * 1024,
  contentType: 'image/jpeg',
});
// method === 'POST'; submit url + fields + file as multipart/form-data
```

## Escape hatch

```ts
import type { Storage as GcsStorage } from '@google-cloud/storage';

const storage = new Storage({ adapter: gcs({ /* ... */ }) });
//    ↑ inferred as Storage<GcsStorage>

await storage.raw.bucket('photos').setLabels({ env: 'prod' });
```
