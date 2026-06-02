---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/supabase` adapter — thin wrapper over `@storagesdk/adapters/s3` for [Supabase Storage](https://supabase.com/storage)'s S3-compatible endpoint. Endpoint is built from `projectRef`; `forcePathStyle: true` is required and pre-set.

```ts
import { supabase } from '@storagesdk/adapters/supabase';

const storage = new Storage({
  adapter: supabase({
    bucket: 'photos',
    projectRef: 'abcdefghijklmnop',
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,
  }),
});
```

Snapshots and forks are sibling buckets via `CopyObject`, same as the rest of the S3-compatible family.
