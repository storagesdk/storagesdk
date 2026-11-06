# @storagesdk/adapters/neon

[Neon Object Storage](https://neon.com/docs/storage/overview) adapter for
storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { neon } from '@storagesdk/adapters/neon';

const storage = new Storage({
  adapter: neon({
    bucket: 'photos',
    endpoint: process.env.AWS_ENDPOINT_URL_S3!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  }),
});
```

## Configuration

```ts
neon({
  bucket: string;             // bucket the adapter operates on (must already exist)
  endpoint: string;           // branch S3 endpoint
  accessKeyId: string;        // Neon credential token_id
  secretAccessKey: string;    // Neon credential s3_secret_access_key
  region?: string;            // defaults to the region in the endpoint
})
```

`neon env pull` writes the branch endpoint and a storage credential to
`.env.local` as `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`. Create the bucket before
constructing the adapter, with `neon buckets create <name>` or any S3 client.

Neon only supports path-style requests, so the adapter sets
`forcePathStyle: true`. It also computes request checksums only when
required, which keeps presigned PUT URLs working.

## Environment variables

The runtime adapter registry accepts these variables. All but `NEON_BUCKET`
fall back to the `AWS_*` names above.

```sh
NEON_BUCKET=photos
NEON_ENDPOINT=https://<branch-id>.storage.c-<N>.<region>.aws.neon.tech
NEON_ACCESS_KEY_ID=<credential-token_id>
NEON_SECRET_ACCESS_KEY=<credential-s3_secret_access_key>
NEON_REGION=us-east-2
```

## Notes

- Snapshots and forks are emulated as sibling buckets on the same branch via
  `CopyObject` (S3-standard). They are separate from Neon branches.
- `storage.raw` is the underlying `@aws-sdk/client-s3` `S3Client` for any S3
  operation the adapter doesn't surface.
