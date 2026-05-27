# @storagesdk/adapters/azure

[Azure Blob Storage](https://azure.microsoft.com/products/storage/blobs) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @azure/storage-blob
```

```ts
import { Storage } from '@storagesdk/core';
import { azure } from '@storagesdk/adapters/azure';

const storage = new Storage({
  adapter: azure({
    bucket: 'photos',
    accountName: process.env.AZURE_ACCOUNT_NAME!,
    accountKey: process.env.AZURE_ACCOUNT_KEY!,
  }),
});
```

`bucket` is an Azure container. It must already exist (use the Azure portal or `az storage container create`).

## Configuration

```ts
azure({
  bucket: string;        // container the adapter operates on
  accountName: string;
  accountKey: string;
  endpoint?: string;     // override; defaults to https://<accountName>.blob.core.windows.net
})
```

For non-public Azure clouds (Azure US Gov, China) or local emulation with [Azurite](https://github.com/Azure/Azurite), pass `endpoint` directly.

### Other credential modes

The flat config takes account name + account key. For Entra ID (DefaultAzureCredential), SAS tokens, or connection strings, construct a `BlobServiceClient` yourself and call the adapter functions via `storage.raw`.

## Snapshots and forks

Each snapshot/fork creates a **sibling container** populated by server-side `Copy Blob` operations (no SAS needed for same-account copy). Manifest lives at `.storagesdk.metadata.json` inside each container; `list()` filters it out.

```ts
const snap = await storage.snapshots.create({ name: 'baseline' });
// snap.id is e.g. 'photos-snapshot-1748000000000123456789012'

const reader = storage.snapshots.get(snap.id);
await reader.download('photo.jpg');

await storage.forks.create({ name: 'photos-exp', fromSnapshot: snap.id });
const fork = storage.forks.get('photos-exp'); // full read/write Storage
```

## Signed URLs

`url()` and `uploadUrl()` return SAS-signed URLs scoped to a single blob. Default expiry is 1 hour.

```ts
await storage.url('photo.jpg', { expiresIn: 300 });
await storage.uploadUrl('new.jpg', { expiresIn: 300, contentType: 'image/jpeg' });
```

## What's not enforced

- **`maxSize` / `minSize` on `uploadUrl`.** Azure SAS doesn't have an `content-length-range` equivalent — the options are accepted silently but not enforced at the URL level. Validate uploads server-side if you need a hard cap.
- **`onProgress` on `download`.** Not yet wired through.

## Escape hatch

```ts
import type { BlobServiceClient } from '@azure/storage-blob';

const storage = new Storage({ adapter: azure({ /* ... */ }) });
//    ↑ inferred as Storage<BlobServiceClient>

storage.raw
  .getContainerClient('photos')
  .setMetadata({ /* container-level metadata */ });
```
