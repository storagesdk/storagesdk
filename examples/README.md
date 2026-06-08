# storagesdk examples

Runnable examples for each feature of [storagesdk](https://github.com/storagesdk/storagesdk). All examples live under a single `@storagesdk/examples` workspace package and share a single shared `adapter.ts` helper — the examples themselves are pure feature demos, the adapter is picked at runtime via `EXAMPLE_ADAPTER` and adapter-native env vars (`TIGRIS_BUCKET`, `S3_BUCKET`, etc.).

## Run an example

From the repo root:

```sh
pnpm install
pnpm --filter @storagesdk/examples <example-name>
```

Out of the box, examples run against the local filesystem (`os.tmpdir()`) — no setup required:

```sh
pnpm --filter @storagesdk/examples quickstart
```

## Examples

| Folder | What it demonstrates |
| --- | --- |
| [`quickstart`](./quickstart) | Construct a `Storage`, upload, list, download, get a URL, delete. |
| [`snapshots`](./snapshots) | Capture multiple snapshots, list them, and print a git-log-style graph showing the keys at each point in time. |
| [`forks`](./forks) | Spin up multiple forks of the live parent in parallel, mutate them independently, list them, show the divergence side-by-side. |
| [`browser-upload`](./browser-upload) | End-to-end POST-policy flow — Node server mints a presigned POST URL via storagesdk, browser submits the file directly to the storage provider. Requires a non-fs adapter and bucket CORS. |
| [`agent-with-snapshots`](./agent-with-snapshots) | Vercel AI SDK agent that snapshots before editing — demonstrates `@storagesdk/ai/vercel`. Set `ANTHROPIC_API_KEY` to run live; without it the script prints the tool roster. |
| [`adapters`](./adapters) | Discovery — prints every adapter shipped in `@storagesdk/adapters` with its required/optional env vars (and backend-native fallbacks) and URL scheme. |

## Picking an adapter

`EXAMPLE_ADAPTER` selects which provider the example talks to (defaults to `fs`). The actual configuration comes from adapter-native env vars matching each adapter's config shape — the same vars you'd use in a CLI, MCP server, or any other consumer of `@storagesdk/adapters`'s runtime registry.

Run the `adapters` example any time to see the full list with required/optional flags:

```sh
pnpm --filter @storagesdk/examples adapters
```

```sh
# Tigris — bucket must already exist.
EXAMPLE_ADAPTER=tigris \
TIGRIS_BUCKET=my-bucket \
TIGRIS_ACCESS_KEY_ID=... \
TIGRIS_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# S3 (and any S3-compatible provider) — bucket must already exist.
# Credentials fall back to AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY,
# region falls back to AWS_REGION.
EXAMPLE_ADAPTER=s3 \
S3_BUCKET=my-bucket \
S3_REGION=us-east-1 \
S3_ACCESS_KEY_ID=... \
S3_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Cloudflare R2 — bucket must already exist.
EXAMPLE_ADAPTER=r2 \
R2_BUCKET=my-bucket \
R2_ACCOUNT_ID=... \
R2_ACCESS_KEY_ID=... \
R2_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# MinIO locally — bucket must already exist.
docker compose up -d minio
EXAMPLE_ADAPTER=minio \
MINIO_BUCKET=my-bucket \
MINIO_ENDPOINT=http://localhost:9000 \
MINIO_ACCESS_KEY_ID=minioadmin \
MINIO_SECRET_ACCESS_KEY=minioadmin \
pnpm --filter @storagesdk/examples quickstart

# GCS — service-account JSON key file. Project ID falls back to
# GOOGLE_CLOUD_PROJECT; key file falls back to GOOGLE_APPLICATION_CREDENTIALS.
EXAMPLE_ADAPTER=gcs \
GCS_BUCKET=my-bucket \
GCS_PROJECT_ID=my-project \
GCS_KEY_FILENAME=/path/to/key.json \
pnpm --filter @storagesdk/examples quickstart

# Azure Blob. Account name/key fall back to AZURE_STORAGE_ACCOUNT /
# AZURE_STORAGE_KEY.
EXAMPLE_ADAPTER=azure \
AZURE_BUCKET=my-container \
AZURE_ACCOUNT_NAME=mystorageaccount \
AZURE_ACCOUNT_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Vercel Blob. Token falls back to BLOB_READ_WRITE_TOKEN (Vercel SDK
# convention).
EXAMPLE_ADAPTER=vercel \
VERCEL_BLOB_BUCKET=my-prefix \
VERCEL_BLOB_TOKEN=vercel_blob_rw_... \
pnpm --filter @storagesdk/examples quickstart

# GitHub — snapshots are tags, forks are branches. Use a throwaway test
# repo; each run mutates the working branch.
EXAMPLE_ADAPTER=github \
GITHUB_OWNER=storagesdk \
GITHUB_REPO=sdk-test-fixture \
GITHUB_TOKEN=ghp_... \
pnpm --filter @storagesdk/examples quickstart

# WebDAV — `docker compose up webdav` runs a local Apache mod_dav
# container on port 8080. Any WebDAV server (Nextcloud, ownCloud,
# self-hosted Apache/nginx) plugs in here.
EXAMPLE_ADAPTER=webdav \
WEBDAV_URL=http://localhost:8080 \
WEBDAV_ROOT=/storagesdk \
WEBDAV_FOLDER=demo \
WEBDAV_USERNAME=user \
WEBDAV_PASSWORD=pass \
pnpm --filter @storagesdk/examples quickstart

# Backblaze B2 — bucket must already exist.
EXAMPLE_ADAPTER=backblaze \
B2_BUCKET=my-bucket \
B2_REGION=us-west-004 \
B2_ACCESS_KEY_ID=... \
B2_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# DigitalOcean Spaces — Space must already exist.
EXAMPLE_ADAPTER=spaces \
SPACES_BUCKET=my-space \
SPACES_REGION=nyc3 \
SPACES_ACCESS_KEY_ID=... \
SPACES_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Wasabi — bucket must already exist.
EXAMPLE_ADAPTER=wasabi \
WASABI_BUCKET=my-bucket \
WASABI_REGION=us-east-1 \
WASABI_ACCESS_KEY_ID=... \
WASABI_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Supabase Storage — generate S3 credentials in the project dashboard.
EXAMPLE_ADAPTER=supabase \
SUPABASE_BUCKET=my-bucket \
SUPABASE_PROJECT_REF=abcdefghijklmnop \
SUPABASE_ACCESS_KEY_ID=... \
SUPABASE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Linode Object Storage — bucket must already exist.
EXAMPLE_ADAPTER=linode \
LINODE_BUCKET=my-bucket \
LINODE_REGION=us-east-1 \
LINODE_ACCESS_KEY_ID=... \
LINODE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Filesystem (default) — no env needed, uses a fresh tmpdir per run.
pnpm --filter @storagesdk/examples quickstart
```

For the full list of env vars per adapter, run [`pnpm --filter @storagesdk/examples adapters`](./adapters) or see [`@storagesdk/adapters`'s runtime selection docs](https://storagesdk.dev/adapters/registry).

## Copying an example out

The examples share a single `package.json` to keep the repo tidy. When you copy one out:

1. Copy the example folder (`quickstart/`, etc.) and `adapter.ts` to your project.
2. Install the deps that the example imports — typically `@storagesdk/core` + `@storagesdk/adapters`.
3. Run with `tsx index.ts` or compile + run.
