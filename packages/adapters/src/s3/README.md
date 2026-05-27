# @storagesdk/adapters/s3

S3 adapter for [storagesdk](https://github.com/storagesdk/storagesdk). Works against Amazon S3 and any S3-compatible backend — MinIO, Cloudflare R2, DigitalOcean Spaces, Backblaze B2, etc.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
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
  bucket: string;                  // bucket the adapter operates on (required)
  region?: string;                 // AWS region; falls back to SDK's default region resolution
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  endpoint?: string;               // override S3 endpoint URL (MinIO, R2, Spaces, etc.)
  forcePathStyle?: boolean;        // required by MinIO and most S3-compatible providers
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

Each snapshot and fork is a **new bucket** in the same AWS account / S3-compatible provider, populated by server-side `CopyObject` per entry. Lineage is tracked in a manifest stored as **bucket tags** (`storagesdk-manifest-NN`, base64-encoded JSON chunks). Tags are invisible to `ListObjectsV2`, so `list({ limit: N })` returns exactly N user items. On providers that don't support bucket tagging (e.g. Cloudflare R2 returns `NotImplemented`), the adapter falls back to storing the manifest as an object at `.storagesdk.metadata.json` and `list()` filters it from results — in fallback mode a page that would have contained the manifest can come back with N-1 items.

```ts
const snap = await storage.snapshots.create({ name: 'pre-migration' });
//    snap.id is e.g. 'photos-snapshot-1748000000000123456789012'
//                          ↑ bucket prefix + 25-digit suffix

// Fork from a specific snapshot:
await storage.forks.create({ name: 'photos-exp', fromSnapshot: snap.id });

// Fork directly from the parent's live state — no intermediate snapshot.
await storage.forks.create({ name: 'photos-live' });

const exp = storage.forks.get('photos-exp'); // full read/write Storage
```

### How creation works

Both `snapshots.create` and `forks.create` follow the same five-step recipe — they only differ in how they name the sibling bucket and what they record in the parent's manifest:

1. **Pick a sibling bucket name.** Snapshots: `nextSnapshotId(bucket)` → `<bucket>-snapshot-<25 digits>` (13-digit ms + 12-digit crypto-random). Forks: user-provided `name`.
2. **`CreateBucket`** for the sibling. Bucket-name collisions surface as `Conflict`. If anything fails *after* this step, `destroySibling` empties and deletes the half-built sibling before rethrowing — no orphans on partial failure.
3. **`copyAllObjects`** to populate it. `ListObjectsV2` enumerates source bucket entries (skipping `.storagesdk.metadata.json` if the manifest store is in object-fallback mode), then 4 parallel workers drain a shared queue. Each worker issues a single server-side `CopyObject` for objects up to S3's 5 GB single-copy limit, or a multipart `UploadPartCopy` above that. The first worker to fail aborts the others via a shared `AbortController` and the driver waits for all workers to settle before propagating the error — so the caller's cleanup can't race in-flight copies. The source is:
   - For snapshots → the parent bucket.
   - For forks with `fromSnapshot` set → the named snapshot bucket (must exist).
   - For forks with `fromSnapshot` omitted → the parent bucket.
4. **Write the child's own manifest.** `manifest.write(client, sibling, emptyManifest({ location: bucket, snapshotId }))`. The manifest store tries `PutBucketTagging` first (invisible to `ListObjectsV2`), falls back to a `.storagesdk.metadata.json` object on backends that return `NotImplemented` for tag APIs.
5. **Append to the parent's manifest.** `manifest.read(client, bucket)` → push the new `SnapshotInfo` / `ForkInfo` → `manifest.write(client, bucket, ...)`. Concurrent creates on the same parent will race this read-modify-write — serialize calls per parent until that's fixed.

`snapshots.get(id)` returns a `ReadOnlyAdapter` scoped to the sibling bucket; the read-only contract is enforced by type, not by bucket policy. `forks.get(name)` returns a full read/write `Adapter` scoped to the fork bucket.

See [`examples/snapshots`](../../../../examples/snapshots) and [`examples/forks`](../../../../examples/forks) for runnable walkthroughs.

### Bucket name length

S3 bucket names are limited to **63 characters**. The snapshot-id format is `<parent-bucket>-snapshot-<25 digits>` (35 chars overhead), so the source bucket name should be **≤ 28 characters** for snapshots to work. Fork names are user-provided; if a fork later has its own snapshot, the same budget applies to the fork name.

### Large object copies

Objects up to **5 GB** (S3's single-`CopyObject` limit) are copied with a single server-side `CopyObject`. Above 5 GB the adapter falls back to multipart copy via `UploadPartCopy`. Object-level parallelism is fixed at 4 concurrent copies. Not configurable — the threshold tracks the AWS limit, not user preference.

### Versioning-aware cleanup

`snapshots.delete` / `forks.delete` empty the target bucket before calling `DeleteBucket`. On AWS S3 and MinIO this uses `ListObjectVersions` so Versioning-enabled buckets get all versions and delete markers cleaned up. On providers that don't implement `ListObjectVersions` (e.g. Cloudflare R2 returns `NotImplemented`), the adapter falls back to `ListObjectsV2` automatically — no extra config needed.

### Conflict handling

`forks.create({ name })` and `snapshots.create()` issue `CreateBucket`. If the name collides — vanishingly unlikely for SDK-generated snapshot ids, plausible for user-chosen fork names — the call throws `StorageError({ code: 'Conflict' })`. The bucket is *not* the only line of defense; pick a unique fork name.

## Escape hatch

`s3()` returns `Adapter<S3Client>`, so `storage.raw` is typed as `S3Client` automatically — no cast needed.

```ts
const storage = new Storage({ adapter: s3({ bucket: 'photos' }) });
//    ↑ inferred as Storage<S3Client>

storage.raw.send(new SomeRawCommand({ /* ... */ }));
//      ↑ typed as S3Client
```

## What's not yet implemented

- **POST policies on `uploadUrl`.** Only PUT presigning today. POST-with-`maxSize`/Conditions support is planned.
- **Part-level parallelism in multipart copy.** Object-level parallelism is wired (4 concurrent objects); parts within a single multipart copy upload serially. Will add part-level parallelism if real-world testing shows the network underutilized.

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
