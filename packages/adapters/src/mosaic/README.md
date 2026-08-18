# @storagesdk/adapters/mosaic

[Mosaic Object Storage](https://storage.mosaicos.com) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { mosaic } from '@storagesdk/adapters/mosaic';

const storage = new Storage({
  adapter: mosaic({
    bucket: 'photos',
    accessKeyId: process.env.MOSAIC_ACCESS_KEY_ID!,
    secretAccessKey: process.env.MOSAIC_SECRET_ACCESS_KEY!,
  }),
});
```

## Configuration

```ts
mosaic({
  bucket: string;            // bucket the adapter operates on (must already exist)
  accessKeyId: string;       // Mosaic S3 access key id
  secretAccessKey: string;   // secret for that access key
  region?: string;           // defaults to 'auto'; Mosaic places data itself
  endpoint?: string;         // override; defaults to https://storage.mosaicos.com
})
```

Create a key at [storage.mosaicos.com/signup](https://storage.mosaicos.com/signup/) —
signup is self-serve and returns an API key; `POST /v1/api-keys/<id>/sigv4`
mints the S3 access key id and secret this adapter takes. The secret is shown
only once. Create the bucket before constructing the adapter, with any S3
client or `PUT /<bucket>`.

Mosaic addresses buckets by path and places data itself, so the adapter sets
`forcePathStyle: true` and defaults `region` to `'auto'` — the AWS SDK requires
a region string, Mosaic ignores its value.

## Environment variables

The runtime adapter registry accepts these variables:

```sh
MOSAIC_BUCKET=photos
MOSAIC_ACCESS_KEY_ID=<access-key-id>
MOSAIC_SECRET_ACCESS_KEY=<secret-access-key>
MOSAIC_REGION=auto
MOSAIC_ENDPOINT=https://storage.mosaicos.com
```

## Notes

- Snapshots and forks are emulated as sibling buckets via `CopyObject`
  (S3-standard), so each one costs a bucket against the account's limit.
- A self-serve account allows 10 buckets, 64 MB per object and 3000 requests
  per minute; an account can be given higher limits.
- `storage.raw` is the underlying `@aws-sdk/client-s3` `S3Client` for any S3
  operation the adapter doesn't surface.
