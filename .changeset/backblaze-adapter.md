---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/backblaze` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Backblaze B2 Cloud Storage](https://www.backblaze.com/b2/cloud-storage.html). Endpoint is built from `region` (e.g. `us-west-004` → `https://s3.us-west-004.backblazeb2.com`); override via `endpoint`.

```ts
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

Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.
