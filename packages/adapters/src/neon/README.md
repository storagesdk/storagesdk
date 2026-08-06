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
    endpoint: process.env.NEON_STORAGE_ENDPOINT!,
    accessKeyId: process.env.NEON_TOKEN_ID!,
    secretAccessKey: process.env.NEON_S3_SECRET_ACCESS_KEY!,
  }),
});
```

## Configuration

```ts
neon({
  bucket: string;             // existing Neon Object Storage bucket
  endpoint: string;           // branch S3 storage endpoint, not the Console API URL
  accessKeyId: string;        // Neon credential token_id
  secretAccessKey: string;    // Neon credential s3_secret_access_key
  region?: string;            // defaults to us-east-2
})
```

Neon Object Storage is currently available in `us-east-2` during the beta.
Each database branch has an isolated storage namespace, so use the S3 endpoint
for the branch you want to access. Create the bucket and Neon credential in
the Neon Console or API before constructing the adapter.

The adapter uses path-style S3 requests and disables optional request
checksums when they are not required, which keeps presigned PUT URLs
compatible with Neon Object Storage.

## Environment variables

The runtime adapter registry accepts these variables:

```sh
NEON_BUCKET=photos
NEON_ENDPOINT=https://<branch-s3-endpoint>
NEON_ACCESS_KEY_ID=<credential-token_id>
NEON_SECRET_ACCESS_KEY=<credential-s3_secret_access_key>
NEON_REGION=us-east-2
```

`NEON_ENDPOINT`, `NEON_ACCESS_KEY_ID`, and `NEON_SECRET_ACCESS_KEY` also
support the corresponding AWS/S3 environment fallbacks used by the registry.
