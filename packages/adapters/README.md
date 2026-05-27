# @storagesdk/adapters

Backend adapters for [storagesdk](https://github.com/storagesdk/storagesdk). Import the adapter you need via a subpath; the others are tree-shaken out.

```sh
npm install @storagesdk/core @storagesdk/adapters
```

Each backend's SDK is an optional peer dependency. Install only the SDKs for adapters you actually import — see each adapter's README for the exact install line.

## Available adapters

| Adapter | Subpath | Backend |
| --- | --- | --- |
| Filesystem | [`@storagesdk/adapters/fs`](./src/fs/README.md) | Local `node:fs/promises`. For development and tests. |
| S3 | [`@storagesdk/adapters/s3`](./src/s3/README.md) | Amazon S3 and any S3-compatible backend (DigitalOcean Spaces, Backblaze B2, etc.). |
| R2 | [`@storagesdk/adapters/r2`](./src/r2/README.md) | [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/). |
| MinIO | [`@storagesdk/adapters/minio`](./src/minio/README.md) | [MinIO](https://min.io/). |
| Azure Blob | [`@storagesdk/adapters/azure`](./src/azure/README.md) | [Azure Blob Storage](https://azure.microsoft.com/products/storage/blobs). |
| GCS | [`@storagesdk/adapters/gcs`](./src/gcs/README.md) | [Google Cloud Storage](https://cloud.google.com/storage). |
| Tigris | [`@storagesdk/adapters/tigris`](./src/tigris/README.md) | [Tigris](https://www.tigrisdata.com/) — snapshots and forks are first-class via Tigris's native APIs. |

## Snapshots and forks

Every adapter implements `snapshots` and `forks` against the same contract. Backends that don't offer native primitives use a sibling-bucket / sibling-container convention (server-side copy + a per-bucket manifest); Tigris uses its native snapshot/fork APIs.

See each adapter's README for the specifics — naming convention, what the manifest contains, and what's enforced server-side vs in the SDK.

## Conformance suite

`@storagesdk/adapters/test-suite` exports the cross-adapter behavioral suite (upload round-trip, NotFound semantics, snapshot/fork contract, AbortSignal short-circuit, etc.). Drop it into your own adapter's test file to verify you're spec-compliant. See the top-level README's "Authoring adapters" section for details.
