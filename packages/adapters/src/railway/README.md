# @storagesdk/adapters/railway

Railway Buckets adapter for storagesdk.

This is a branded alias of the Tigris adapter because Railway Buckets run on Tigris. Behavior, snapshot/fork support, and `storage.raw` are the same as `@storagesdk/adapters/tigris`.

```sh
npm install @storagesdk/core @storagesdk/adapters @tigrisdata/storage
```

```ts
import { Storage } from '@storagesdk/core';
import { railway } from '@storagesdk/adapters/railway';

const storage = new Storage({
  adapter: railway({
    bucket: process.env.BUCKET!,
    accessKeyId: process.env.ACCESS_KEY_ID!,
    secretAccessKey: process.env.SECRET_ACCESS_KEY!,
    endpoint: process.env.ENDPOINT,
  }),
});
```

## Configuration

```ts
railway({
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
})
```

For full semantics and caveats, see [`@storagesdk/adapters/tigris`](../tigris/README.md).
