# @storagesdk/adapters

Backend adapters for [storagesdk](https://github.com/storagesdk/storagesdk). Import the adapter you need via a subpath; the others are tree-shaken out.

```sh
npm install @storagesdk/core @storagesdk/adapters
```

Each provider's SDK is an optional peer dependency. Install only the SDKs for adapters you actually import — see each adapter's README for the exact install line.

## Available adapters

| Adapter | Subpath | Backend |
| --- | --- | --- |
| Tigris | [`@storagesdk/adapters/tigris`](./src/tigris/README.md) | [Tigris](https://www.tigrisdata.com/) — snapshots and forks are first-class via Tigris's native APIs. |
| S3 | [`@storagesdk/adapters/s3`](./src/s3/README.md) | Amazon S3 and any S3-compatible provider. |
| R2 | [`@storagesdk/adapters/r2`](./src/r2/README.md) | [Cloudflare R2](https://www.cloudflare.com/developer-platform/products/r2/). |
| GCS | [`@storagesdk/adapters/gcs`](./src/gcs/README.md) | [Google Cloud Storage](https://cloud.google.com/storage). |
| Azure Blob | [`@storagesdk/adapters/azure`](./src/azure/README.md) | [Azure Blob Storage](https://azure.microsoft.com/products/storage/blobs). |
| Vercel Blob | [`@storagesdk/adapters/vercel`](./src/vercel/README.md) | [Vercel Blob](https://vercel.com/docs/vercel-blob). |
| MinIO | [`@storagesdk/adapters/minio`](./src/minio/README.md) | [MinIO](https://min.io/). |
| GitHub | [`@storagesdk/adapters/github`](./src/github/README.md) | [GitHub](https://github.com) repository — snapshots are tags, forks are branches, native git refs all the way down. |
| Freestyle | [`@storagesdk/adapters/freestyle`](./src/freestyle/README.md) | [Freestyle Git](https://www.freestyle.sh/docs/git) repository — snapshots and forks are git branches. |
| WebDAV | [`@storagesdk/adapters/webdav`](./src/webdav/README.md) | Any WebDAV server — Nextcloud, ownCloud, Apache mod_dav, nginx-dav, NAS, pCloud, mailbox.org, kDrive. Snapshots/forks via native server-side `COPY`. |
| Fly.io | [`@storagesdk/adapters/fly`](./src/fly/README.md) | Fly-managed Tigris buckets — branded alias of the Tigris adapter. |
| Railway | [`@storagesdk/adapters/railway`](./src/railway/README.md) | [Railway Buckets](https://docs.railway.com/storage-buckets) — branded alias of the Tigris adapter. |
| Filesystem | [`@storagesdk/adapters/fs`](./src/fs/README.md) | Local `node:fs/promises`. For development and tests. |

For the full, up-to-date list see **[storagesdk.dev/adapters](https://storagesdk.dev/adapters)**.

## Runtime adapter selection

For CLIs, scripts, and anywhere the adapter is picked from a string at runtime, the package's root export ships a small registry: enumerate every shipped adapter, introspect its env-var spec, build the adapter.

```ts
import {
  ADAPTERS,
  type AdapterName,
  type AdapterEnvVar,
  buildAdapter,
  getAdapterEnvVars,
} from '@storagesdk/adapters';

// Enumerate
ADAPTERS
// → readonly ['fs', 's3', 'r2', 'minio', 'tigris', 'azure', 'gcs',
//             'vercel', 'github', 'freestyle', 'webdav', 'backblaze', 'spaces',
//             'wasabi', 'supabase', 'linode', 'fly', 'railway']

// What env vars does this adapter read?
getAdapterEnvVars('tigris')
// → [{ name: 'TIGRIS_BUCKET', required: true }, ...]

// Read env config + dynamically import the factory + construct.
const adapter = await buildAdapter('tigris');
const storage = new Storage({ adapter });
```

Each adapter reads `<NAME>_*` env vars matching its config shape, with backend-native fallbacks where they exist (S3 falls back to `AWS_*`, GCS to `GOOGLE_CLOUD_PROJECT` / `GOOGLE_APPLICATION_CREDENTIALS`, Vercel Blob to `BLOB_READ_WRITE_TOKEN`, Azure to `AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_KEY`).

`buildAdapter` is async because it `import()`s only the adapter you request — peer-SDK code (`@aws-sdk/client-s3`, `@azure/storage-blob`, etc.) stays out of the static bundle until needed. `ADAPTERS` and `getAdapterEnvVars` are sync.

Library consumers using a single adapter via the subpath import (`@storagesdk/adapters/tigris`) are unaffected — the registry is purely additive for runtime-driven use cases.

See [storagesdk.dev/adapters](https://storagesdk.dev/adapters) for the full env-var reference.

## Snapshots and forks

Every adapter implements `snapshots` and `forks` against the same contract. Backends that don't offer native primitives use a sibling-bucket / sibling-container convention (server-side copy + a per-bucket manifest); Tigris uses its native snapshot/fork APIs.

See each adapter's README for the specifics — naming convention, what the manifest contains, and what's enforced server-side vs in the SDK.

## Conformance suite

`@storagesdk/adapters/test-suite` exports the cross-adapter behavioral suite (upload round-trip, NotFound semantics, snapshot/fork contract, AbortSignal short-circuit, etc.). Drop it into your own adapter's test file to verify you're spec-compliant. See the top-level README's "Authoring adapters" section for details.
