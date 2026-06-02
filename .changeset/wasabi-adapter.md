---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/wasabi` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Wasabi Hot Cloud Storage](https://wasabi.com/cloud-storage). Endpoint is built from `region` (e.g. `us-east-1` → `https://s3.us-east-1.wasabisys.com`); override via `endpoint`.

```ts
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

Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.
