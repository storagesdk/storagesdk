# @storagesdk/adapters/linode

[Linode Object Storage](https://www.linode.com/products/object-storage) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { linode } from '@storagesdk/adapters/linode';

const storage = new Storage({
  adapter: linode({
    bucket: 'photos',
    region: 'us-east-1',
    accessKeyId: process.env.LINODE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.LINODE_SECRET_ACCESS_KEY!,
  }),
});
```

## Configuration

```ts
linode({
  bucket: string;            // bucket the adapter operates on (must already exist)
  region: string;            // cluster name, e.g. 'us-east-1', 'eu-central-1', 'ap-south-1'
  accessKeyId: string;       // Object Storage access key
  secretAccessKey: string;   // Object Storage secret
  endpoint?: string;         // override; defaults to `https://<region>.linodeobjects.com`
})
```

Create Object Storage access keys in Linode Cloud Manager → **Object Storage** → **Access Keys**. The secret is shown only once.

## Escape hatch

```ts
const storage = new Storage({ adapter: linode({ /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```
