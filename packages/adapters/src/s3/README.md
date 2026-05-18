# @storagesdk/adapters/s3

S3 adapter for [storagesdk](https://github.com/tigrisdata/storagesdk). Works against Amazon S3 and any S3-compatible backend — MinIO, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, etc.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
```

The AWS SDK packages are optional peer dependencies of `@storagesdk/adapters`. You only install them when you import from `/s3`.

```ts
import { Storage } from '@storagesdk/core';
import { s3 } from '@storagesdk/adapters/s3';

const storage = new Storage({
  adapter: s3({
    bucket: 'photos',
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  }),
});
```

## Configuration

```ts
s3({
  bucket: string;          // bucket the adapter operates on (required)
  region?: string;         // AWS region; falls back to SDK's default region resolution
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  endpoint?: string;       // override S3 endpoint URL (MinIO, R2, Spaces, etc.)
  forcePathStyle?: boolean; // required by MinIO and most S3-compatible providers
})
```

### Credentials

Pass static credentials with `{ accessKeyId, secretAccessKey, sessionToken? }`, or **omit `credentials` entirely** to use the AWS credential chain (env vars, IAM role, shared profile, EC2/ECS/EKS instance metadata, SSO).

```ts
// Static credentials
s3({ bucket: 'photos', credentials: { accessKeyId, secretAccessKey } });

// Default credential chain — for CI, IAM role on EC2/ECS/EKS, SSO, etc.
s3({ bucket: 'photos', region: 'us-east-1' });
```

### MinIO and other S3-compatible providers

```ts
s3({
  bucket: 'photos',
  region: 'us-east-1',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
});
```

Same pattern for Cloudflare R2 (`endpoint: 'https://<account>.r2.cloudflarestorage.com'`, no `forcePathStyle`), DigitalOcean Spaces, Backblaze B2, etc.

## Object metadata

`opts.contentType` and `opts.metadata` are preserved natively via S3's `Content-Type` header and `x-amz-meta-*` headers. **S3 lowercases user-metadata keys** on the server side, so `metadata: { Author: 'alice' }` becomes `metadata: { author: 'alice' }` when read back.

## Multipart upload

Pass `multipart: true` to use S3's multipart upload protocol (via `@aws-sdk/lib-storage`). Streams and large objects are uploaded in parts in parallel; the adapter reports progress via `onProgress`.

```ts
await storage.upload('large.mp4', stream, {
  multipart: true,
  partSize: 8 * 1024 * 1024,  // optional, default 5 MB
  concurrency: 4,             // optional, default 4
  onProgress: ({ loaded, total }) => console.log(`${loaded}/${total}`),
});
```

A streaming body (`ReadableStream`) always uses multipart even without `multipart: true`, because the size isn't known upfront.

## URLs

`url()` and `uploadUrl()` return presigned URLs via `@aws-sdk/s3-request-presigner`. Default expiry is 1 hour.

```ts
await storage.url('photo.jpg', { expiresIn: 300 });          // 5-minute GET URL
await storage.uploadUrl('new.jpg', { expiresIn: 300 });     // 5-minute PUT URL
```

## Snapshots and forks

> **Not implemented yet.** All `snapshots.*` and `forks.*` methods throw `StorageError({ code: 'NotSupported' })`. The follow-up PR adds sibling-bucket implementations following the [Phase 2 convention](../../../../docs/RFC.md#snapshot-and-fork-convention): each snapshot/fork is a new bucket in the same account, populated by server-side `CopyObject` per entry, with `.storagesdk.metadata.json` lineage at the root.

## Escape hatch

`s3()` returns `Adapter<S3Client>`, so `storage.raw` is typed as `S3Client` automatically — no cast needed.

```ts
const storage = new Storage({ adapter: s3({ bucket: 'photos' }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```

## What's not yet implemented

- **POST policies on `uploadUrl`.** Only PUT presigning. POST-with-`maxSize`/Conditions is a Phase 7 follow-up.
- **AbortSignal honoring.** Passed `signal` arguments aren't yet plumbed through to AWS SDK requests.
- **Snapshots and forks.** Stubbed with `NotSupported`; landing in the next PR.

## Errors

Mapped from AWS SDK errors:

| AWS error / status | `StorageError.code` |
| --- | --- |
| `NoSuchKey`, `NoSuchBucket`, `NotFound`, HTTP 404 | `NotFound` |
| `BucketAlreadyExists`, `BucketAlreadyOwnedByYou` | `Conflict` |
| `AccessDenied`, HTTP 403 | `Unauthorized` |
| Other 4xx | `InvalidArgument` |
| 5xx / unknown | `Provider` |

The original AWS error is attached as `cause`.
