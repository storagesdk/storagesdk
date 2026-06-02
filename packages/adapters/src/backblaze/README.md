# @storagesdk/adapters/backblaze

[Backblaze B2 Cloud Storage](https://www.backblaze.com/b2/cloud-storage.html) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { backblaze } from '@storagesdk/adapters/backblaze';

const storage = new Storage({
  adapter: backblaze({
    bucket: 'photos',
    region: 'us-west-004',
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  }),
});
```

## Configuration

```ts
backblaze({
  bucket: string;            // bucket the adapter operates on (must already exist)
  region: string;            // e.g. 'us-west-004', 'eu-central-003'
  accessKeyId: string;       // Backblaze Application Key ID
  secretAccessKey: string;   // Backblaze Application Key
  endpoint?: string;         // override; defaults to `https://s3.<region>.backblazeb2.com`
})
```

Create an Application Key in the Backblaze console → **Application Keys** → **Add a New Application Key**. Scope it to the bucket(s) you intend to use; the Application Key value is shown only once at creation.

## Escape hatch

```ts
const storage = new Storage({ adapter: backblaze({ /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```
