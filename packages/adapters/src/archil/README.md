# @storagesdk/adapters/archil

[Archil](https://archil.com/) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { archil } from '@storagesdk/adapters/archil';

const storage = new Storage({
  adapter: archil({
    bucket: 'disk_123',
    region: 'aws-us-east-1',
    accessKeyId: process.env.ARCHIL_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.ARCHIL_S3_SECRET_ACCESS_KEY!,
  }),
});
```

## Configuration

```ts
archil({
  bucket?: string;              // Archil disk id; required unless disk is passed
  disk?: { id: string; region: string };
  region?: string;              // e.g. aws-us-east-1; required unless disk is passed
  accessKeyId: string;
  secretAccessKey: string;
  branch?: string;              // routes to <diskId>.<branch>
  publicBaseUrl?: string;       // return unsigned URLs from url()
  defaultUrlExpiresIn?: number; // default signed URL expiry, seconds
})
```

`bucket` is the Archil disk id. Passing a `disk` object lets the adapter infer `bucket` from `disk.id` and `region` from `disk.region`; the same object is preserved at `adapter.disk` for Archil-native operations.

## Environment

The runtime registry reads:

```sh
ARCHIL_BUCKET=disk_123
ARCHIL_REGION=aws-us-east-1
ARCHIL_S3_ACCESS_KEY_ID=...
ARCHIL_S3_SECRET_ACCESS_KEY=...
ARCHIL_BRANCH=feature
ARCHIL_PUBLIC_BASE_URL=https://cdn.example.com
ARCHIL_DEFAULT_URL_EXPIRES_IN=3600
```

## Archil Notes

- Regions derive to `https://s3.green.<geo>.<cloud>.prod.archil.com`, with overrides for regions that live on a different cell.
- `gcp-us-central1` currently uses `https://s3.blue.us-central1.gcp.prod.archil.com`.
- SigV4 signs with the geographic part of the region: `aws-us-east-1` signs as `us-east-1`.
- Branches route through the bucket name as `<diskId>.<branch>` and must not contain `/`.
- The adapter uses path-style S3 addressing.

## Escape Hatch

```ts
const storage = new Storage({ adapter: archil({ /* ... */ }) });
//    inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
```
