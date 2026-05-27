# @storagesdk/adapters/r2

[Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { r2 } from '@storagesdk/adapters/r2';

const storage = new Storage({
  adapter: r2({
    bucket: 'photos',
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  }),
});
```

## Configuration

```ts
r2({
  bucket: string;            // bucket the adapter operates on (must already exist)
  accountId: string;         // Cloudflare account ID
  accessKeyId: string;       // R2 API token credentials
  secretAccessKey: string;
  endpoint?: string;         // override; defaults to `https://<accountId>.r2.cloudflarestorage.com`
})
```

Find your account ID and create API tokens in the Cloudflare dashboard → **R2** → **Manage R2 API Tokens**. Scope the token to the bucket(s) you intend to use.

### Jurisdiction-specific endpoints

R2 offers EU and FedRAMP High jurisdictions. Override `endpoint`:

```ts
r2({
  bucket: 'photos',
  accountId: '<id>',
  accessKeyId, secretAccessKey,
  endpoint: `https://<accountId>.eu.r2.cloudflarestorage.com`,
});
```

## R2 notes

- **Bucket tagging isn't supported on R2.** Snapshot and fork lineage falls back to a `.storagesdk.metadata.json` object at the bucket root. The adapter filters that key out of `list()` results; in fallback mode a page that would have contained the manifest can come back with N-1 items.
- **`ListObjectVersions` isn't supported on R2.** `snapshots.delete` / `forks.delete` fall back to `ListObjectsV2` for cleanup automatically.

## Escape hatch

```ts
const storage = new Storage({ adapter: r2({ /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```
