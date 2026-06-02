# storagesdk examples

Runnable examples for each feature of [storagesdk](https://github.com/storagesdk/storagesdk). All examples live under a single `@storagesdk/examples` workspace package and share a single shared `adapter.ts` helper — the examples themselves are pure feature demos, the adapter is picked at runtime via env vars.

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

## Picking an adapter

`EXAMPLE_ADAPTER` chooses which provider the example talks to. Defaults to `fs`. The per-adapter env vars use the same `EXAMPLE_*` namespace so they don't change between examples.

```sh
# Tigris — bucket must already exist. EXAMPLE_ENDPOINT is optional; the
# Tigris client defaults to its production endpoint when unset.
EXAMPLE_ADAPTER=tigris \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# S3 (and any S3-compatible provider) — bucket must already exist.
EXAMPLE_ADAPTER=s3 \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_REGION=us-east-1 \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Cloudflare R2 — bucket must already exist.
EXAMPLE_ADAPTER=r2 \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_ACCOUNT_ID=... \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# MinIO locally — bucket must already exist.
docker compose up -d minio
EXAMPLE_ADAPTER=minio \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_ENDPOINT=http://localhost:9000 \
EXAMPLE_ACCESS_KEY_ID=minioadmin \
EXAMPLE_SECRET_ACCESS_KEY=minioadmin \
pnpm --filter @storagesdk/examples quickstart

# GitHub — token reads from GITHUB_TOKEN. Snapshots are tags, forks
# are branches; use a throwaway test repo, each run mutates the
# working branch.
EXAMPLE_ADAPTER=github \
EXAMPLE_OWNER=storagesdk \
EXAMPLE_REPO=sdk-test-fixture \
GITHUB_TOKEN=ghp_... \
pnpm --filter @storagesdk/examples quickstart

# WebDAV — `docker compose up webdav` runs a local Apache mod_dav
# container on port 8080 with user/pass credentials. Any WebDAV server
# (Nextcloud, ownCloud, Box, self-hosted Apache/nginx) plugs in here.
EXAMPLE_ADAPTER=webdav \
EXAMPLE_URL=http://localhost:8080 \
EXAMPLE_USERNAME=user \
EXAMPLE_PASSWORD=pass \
EXAMPLE_ROOT=/storagesdk \
EXAMPLE_FOLDER=demo \
pnpm --filter @storagesdk/examples quickstart

# Backblaze B2 — bucket must already exist.
EXAMPLE_ADAPTER=backblaze \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_REGION=us-west-004 \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# DigitalOcean Spaces — Space must already exist.
EXAMPLE_ADAPTER=spaces \
EXAMPLE_BUCKET=my-space \
EXAMPLE_REGION=nyc3 \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# Filesystem (default) — no env needed, uses a fresh tmpdir per run.
pnpm --filter @storagesdk/examples quickstart
```

### Env vars

| Var | `tigris` | `s3` | `r2` | `minio` | `fs` | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `EXAMPLE_ADAPTER` | ✓ | ✓ | ✓ | ✓ | (default) | One of `tigris`, `s3`, `r2`, `minio`, `fs`. |
| `EXAMPLE_BUCKET` | required | required | required | required | — | Bucket / location name; must already exist for cloud adapters. |
| `EXAMPLE_ENDPOINT` | optional | optional | optional | **required** | — | S3-compatible endpoint URL. Tigris defaults to its production endpoint; R2 builds it from `EXAMPLE_ACCOUNT_ID`. |
| `EXAMPLE_REGION` | — | optional | — | optional | — | AWS region. |
| `EXAMPLE_ACCESS_KEY_ID` | required | required | required | required | — | |
| `EXAMPLE_SECRET_ACCESS_KEY` | required | required | required | required | — | |
| `EXAMPLE_FORCE_PATH_STYLE` | optional | optional | — | (on by default) | — | Set to `'true'` for path-style addressing. |
| `EXAMPLE_ACCOUNT_ID` | — | — | required | — | — | Cloudflare account ID; used to build the R2 endpoint. |

## Copying an example out

The examples share a single `package.json` to keep the repo tidy. When you copy one out:

1. Copy the example folder (`quickstart/`, etc.) and `adapter.ts` to your project.
2. Install the deps that the example imports — typically `@storagesdk/core` + `@storagesdk/adapters`.
3. Run with `tsx index.ts` or compile + run.
