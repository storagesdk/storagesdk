---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/linode` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Linode Object Storage](https://www.linode.com/products/object-storage). Endpoint is built from `region` (the cluster name; e.g. `us-east-1` → `https://us-east-1.linodeobjects.com`); override via `endpoint`.

```ts
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

Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.
