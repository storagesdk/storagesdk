# @storagesdk/adapters/bunny-s3

Adapter for [Bunny Storage](https://docs.bunny.net/storage/s3) over its S3-compatible API.

```sh
npm install @storagesdk/core @storagesdk/adapters @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner @aws-sdk/s3-presigned-post
```

```ts
import { Storage } from '@storagesdk/core';
import { bunnyS3 } from '@storagesdk/adapters/bunny-s3';

const storage = new Storage({
  adapter: bunnyS3({
    zone: 'my-storage-zone',
    bucket: 'photos',
    accessKey: process.env.BUNNY_S3_ACCESS_KEY!,
    region: 'de',
  }),
});
```

The storage zone must have been created with **S3 compatibility** turned on. It can't be enabled on an existing zone; for those, use [`@storagesdk/adapters/bunny`](../bunny/README.md), which talks to the Edge Storage HTTP API and works on any zone.

## Configuration

```ts
bunnyS3({
  zone: string;        // storage zone name; also the S3 bucket and access key id
  bucket: string;      // logical bucket, becomes a key prefix inside the zone
  accessKey: string;   // storage-zone password, used as the S3 secret access key
  region?: string;     // defaults to 'de'; picks the endpoint and signing region
  endpoint?: string;   // override; defaults to https://<region>-s3.storage.bunnycdn.com
})
```

Find the zone name and password under the zone's **Access** tab in the Bunny dashboard. The read-only password works too, for read-only use.

Regions with an S3 endpoint: `de`, `uk`, `ny`, `la`, `sg`, `se`, `jh`, `syd`.

The adapter sets `forcePathStyle: true` and `requestChecksumCalculation: 'WHEN_REQUIRED'`.

## How `zone` and `bucket` map

On Bunny's S3 API the storage zone is the bucket, and its credentials are scoped to that one zone. The adapter maps each storagesdk `bucket` to a **key prefix** within the zone (`<bucket>/<key>`), so several logical buckets can share a zone.

This is the same layout the `bunny` adapter uses, so both adapters can work on the same zone.

## Snapshots and forks

Each snapshot and fork is a sibling key prefix in the same zone, seeded with server-side `CopyObject`. Snapshots live at `<bucket>-snapshot-<id>/` and forks at `<forkName>/`, each with a `.storagesdk.metadata.json` manifest.

The S3 adapter's sibling-bucket layout doesn't apply here, because a zone's credentials can't create another zone.

A fork's name is its key prefix, and it shares the zone with every other logical bucket. `forks.create` throws `Conflict` when that prefix already holds objects, and `forks.delete` / `snapshots.delete` only remove prefixes this bucket created.

## Environment variables

The runtime adapter registry accepts these variables:

```sh
BUNNY_S3_ZONE=my-storage-zone
BUNNY_S3_BUCKET=photos
BUNNY_S3_ACCESS_KEY=<storage-zone-password>
BUNNY_S3_REGION=de
BUNNY_S3_ENDPOINT=https://de-s3.storage.bunnycdn.com
```

The first three are required.

## Notes

- Bunny's S3 API is in public preview.
- Object metadata set through S3 is cleared when the object is overwritten through the Edge Storage HTTP API. Metadata keys containing underscores are dropped by Bunny.
- `list()` hides the manifest, so a page that contains it comes back one item short.
- `storage.raw` is the underlying `@aws-sdk/client-s3` `S3Client`, pointed at the zone, for any S3 operation the adapter doesn't surface.
