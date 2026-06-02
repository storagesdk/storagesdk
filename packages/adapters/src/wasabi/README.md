# @storagesdk/adapters/wasabi

[Wasabi Hot Cloud Storage](https://wasabi.com/cloud-storage) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { wasabi } from '@storagesdk/adapters/wasabi';

const storage = new Storage({
  adapter: wasabi({
    bucket: 'photos',
    region: 'us-east-1',
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  }),
});
```

## Configuration

```ts
wasabi({
  bucket: string;            // bucket the adapter operates on (must already exist)
  region: string;            // e.g. 'us-east-1', 'eu-central-1', 'ap-northeast-1'
  accessKeyId: string;       // Wasabi access key
  secretAccessKey: string;   // Wasabi secret
  endpoint?: string;         // override; defaults to `https://s3.<region>.wasabisys.com`
})
```

Create access keys in the Wasabi console → **Access Keys**. The secret is shown only once.

## Escape hatch

```ts
const storage = new Storage({ adapter: wasabi({ /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```
