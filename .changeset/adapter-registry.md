---
'@storagesdk/adapters': minor
---

New root export on `@storagesdk/adapters` for runtime-driven adapter selection. Useful for CLIs, configuration-loaded code, and any place where the adapter is picked from a string at runtime.

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
// readonly ['fs', 's3', 'r2', 'minio', 'tigris', 'azure', 'gcs', 'vercel',
//           'github', 'webdav', 'backblaze', 'spaces', 'wasabi', 'supabase',
//           'linode', 'fly', 'railway'] as const

// Introspect (for CLI help, error messages, docs generation)
getAdapterEnvVars('tigris')
// → [
//   { name: 'TIGRIS_BUCKET', required: true },
//   { name: 'TIGRIS_ACCESS_KEY_ID', required: true },
//   { name: 'TIGRIS_SECRET_ACCESS_KEY', required: true },
//   { name: 'TIGRIS_ENDPOINT', required: false },
//   { name: 'TIGRIS_FORCE_PATH_STYLE', required: false },
// ]

// Build (async — dynamic-import the factory + read env + construct)
await buildAdapter('tigris')
// → Adapter, ready for `new Storage({ adapter })`
```

Five exports — three functions/constants, two types. Deliberately small surface.

## Env-var convention

Each adapter reads `<ADAPTER>_*` env vars matching its config shape. Where the backend has a de-facto standard env-var convention (AWS, GCS, Vercel Blob, Azure), those are accepted as fallbacks:

| Adapter | Vars |
| --- | --- |
| `fs` | `FS_ROOT`, `FS_FOLDER` |
| `s3` | `S3_BUCKET`, `S3_ACCESS_KEY_ID?`, `S3_SECRET_ACCESS_KEY?`, `S3_REGION?`, `S3_ENDPOINT?`, `S3_FORCE_PATH_STYLE?` (falls back to `AWS_*`) |
| `r2` | `R2_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT?` |
| `minio` | `MINIO_BUCKET`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_REGION?`, `MINIO_FORCE_PATH_STYLE?` |
| `tigris` | `TIGRIS_BUCKET`, `TIGRIS_ACCESS_KEY_ID`, `TIGRIS_SECRET_ACCESS_KEY`, `TIGRIS_ENDPOINT?`, `TIGRIS_FORCE_PATH_STYLE?` |
| `azure` | `AZURE_BUCKET`, `AZURE_ACCOUNT_NAME` (falls back to `AZURE_STORAGE_ACCOUNT`), `AZURE_ACCOUNT_KEY` (falls back to `AZURE_STORAGE_KEY`), `AZURE_ENDPOINT?` |
| `gcs` | `GCS_BUCKET`, `GCS_PROJECT_ID` (falls back to `GOOGLE_CLOUD_PROJECT`), `GCS_KEY_FILENAME?` (falls back to `GOOGLE_APPLICATION_CREDENTIALS`), `GCS_API_ENDPOINT?` |
| `vercel` | `VERCEL_BLOB_BUCKET`, `VERCEL_BLOB_TOKEN?` (falls back to `BLOB_READ_WRITE_TOKEN`), `VERCEL_BLOB_ACCESS?` |
| `github` | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN?`, `GITHUB_BRANCH?`, `GITHUB_BASE_URL?` |
| `webdav` | `WEBDAV_URL`, `WEBDAV_ROOT`, `WEBDAV_FOLDER`, `WEBDAV_USERNAME?`, `WEBDAV_PASSWORD?`, `WEBDAV_TOKEN?`, `WEBDAV_AUTH_TYPE?` |
| `backblaze` | `B2_BUCKET`, `B2_REGION`, `B2_ACCESS_KEY_ID`, `B2_SECRET_ACCESS_KEY`, `B2_ENDPOINT?` |
| `spaces` | `SPACES_BUCKET`, `SPACES_REGION`, `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_ENDPOINT?` |
| `wasabi` | `WASABI_BUCKET`, `WASABI_REGION`, `WASABI_ACCESS_KEY_ID`, `WASABI_SECRET_ACCESS_KEY`, `WASABI_ENDPOINT?` |
| `supabase` | `SUPABASE_BUCKET`, `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_KEY_ID`, `SUPABASE_SECRET_ACCESS_KEY`, `SUPABASE_REGION?`, `SUPABASE_ENDPOINT?` |
| `linode` | `LINODE_BUCKET`, `LINODE_REGION`, `LINODE_ACCESS_KEY_ID`, `LINODE_SECRET_ACCESS_KEY`, `LINODE_ENDPOINT?` |
| `fly`, `railway` | reuse `TIGRIS_*` — they're branded aliases of the Tigris adapter |

## Why async `buildAdapter`

Adapter implementations pull in heavy peer-SDK code (`@aws-sdk/client-s3`, `@azure/storage-blob`, etc.). Using a dynamic import keeps the static bundle to just the lightweight metadata; the actual factory + SDK only load when an adapter is requested. CLI consumers `await` once at startup; library consumers get bundle savings on code-split runtimes (Cloudflare Workers, Vercel Edge).

`ADAPTERS` and `getAdapterEnvVars` are synchronous — they only deal with constants and static data.

## Existing subpath imports stay unchanged

`import { tigris } from '@storagesdk/adapters/tigris'` still works exactly as before — tree-shakeable, only the one peer dep needed. The new root export is purely additive for runtime-driven use cases.
