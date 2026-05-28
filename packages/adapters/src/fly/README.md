# @storagesdk/adapters/fly

Fly.io Tigris adapter for storagesdk.

This is a branded alias of the Tigris adapter for Fly-managed Tigris buckets. Behavior, snapshot/fork support, and `storage.raw` are the same as `@storagesdk/adapters/tigris`.

```sh
npm install @storagesdk/core @storagesdk/adapters @tigrisdata/storage
```

```ts
import { Storage } from '@storagesdk/core';
import { fly } from '@storagesdk/adapters/fly';

const storage = new Storage({
  adapter: fly({
    bucket: process.env.BUCKET!,
    accessKeyId: process.env.ACCESS_KEY_ID!,
    secretAccessKey: process.env.SECRET_ACCESS_KEY!,
    endpoint: process.env.ENDPOINT,
  }),
});
```

## Configuration

```ts
fly({
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
})
```

For full semantics and caveats, see [`@storagesdk/adapters/tigris`](../tigris/README.md).
