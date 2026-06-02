# @storagesdk/adapters/spaces

[DigitalOcean Spaces](https://www.digitalocean.com/products/spaces) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { spaces } from '@storagesdk/adapters/spaces';

const storage = new Storage({
  adapter: spaces({
    bucket: 'photos',
    region: 'nyc3',
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  }),
});
```

## Configuration

```ts
spaces({
  bucket: string;            // Space the adapter operates on (must already exist)
  region: string;            // e.g. 'nyc3', 'ams3', 'sgp1', 'sfo3', 'fra1', 'syd1', 'blr1'
  accessKeyId: string;       // Spaces access key
  secretAccessKey: string;   // Spaces secret
  endpoint?: string;         // override; defaults to `https://<region>.digitaloceanspaces.com`
})
```

Create a Spaces key in the DigitalOcean dashboard → **API** → **Spaces Keys**. The secret is shown only once.

## Escape hatch

```ts
const storage = new Storage({ adapter: spaces({ /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```
