---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/spaces` adapter — thin wrapper over `@storagesdk/adapters/s3` for [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces). Endpoint is built from `region` (e.g. `nyc3` → `https://nyc3.digitaloceanspaces.com`); override via `endpoint`.

```ts
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

Snapshots and forks are sibling Spaces via `CopyObject`, same as the rest of the S3-compatible family.
