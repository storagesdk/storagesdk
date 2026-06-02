# @storagesdk/adapters/supabase

[Supabase Storage](https://supabase.com/storage) adapter for storagesdk — wraps the S3-compatible endpoint.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
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

## Configuration

```ts
supabase({
  bucket: string;            // Storage bucket (must already exist)
  projectRef: string;        // your Supabase project ref (subdomain prefix)
  accessKeyId: string;       // S3 access key (Project Settings → Storage → S3 Connection)
  secretAccessKey: string;   // S3 secret
  region?: string;           // ignored by Supabase, defaults to 'us-east-1'
  endpoint?: string;         // override; defaults to `https://<projectRef>.supabase.co/storage/v1/s3`
})
```

Generate S3 credentials in the Supabase dashboard → **Project Settings** → **Storage** → **S3 Connection** → **Generate new credentials**. The secret is shown only once.

## Notes

- `forcePathStyle: true` is baked in — Supabase's S3 endpoint requires it.

## Escape hatch

```ts
const storage = new Storage({ adapter: supabase({ /* ... */ }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```
