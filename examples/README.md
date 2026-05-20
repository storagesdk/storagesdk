# storagesdk examples

Runnable examples for each feature of [storagesdk](https://github.com/tigrisdata/storagesdk). All examples live under a single `@storagesdk/examples` workspace package and share a single shared `adapter.ts` helper — the examples themselves are pure feature demos, the adapter is picked at runtime via env vars.

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

## Picking an adapter

`EXAMPLE_ADAPTER` chooses which backend the example talks to. Defaults to `fs`. The per-adapter env vars use the same `EXAMPLE_*` namespace so they don't change between examples.

```sh
# Filesystem (default) — no env needed, uses a fresh tmpdir per run.
pnpm --filter @storagesdk/examples quickstart

# S3 (AWS, MinIO, R2, Spaces, etc.) — bucket must already exist.
EXAMPLE_ADAPTER=s3 \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_REGION=us-east-1 \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart

# MinIO locally: add EXAMPLE_ENDPOINT and EXAMPLE_FORCE_PATH_STYLE.
docker compose up -d minio
EXAMPLE_ADAPTER=s3 \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_ENDPOINT=http://localhost:9000 \
EXAMPLE_ACCESS_KEY_ID=minioadmin \
EXAMPLE_SECRET_ACCESS_KEY=minioadmin \
EXAMPLE_FORCE_PATH_STYLE=true \
pnpm --filter @storagesdk/examples quickstart

# Tigris — bucket must already exist. EXAMPLE_ENDPOINT is optional; the
# Tigris client defaults to its production endpoint when unset.
EXAMPLE_ADAPTER=tigris \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples quickstart
```

### Env vars

| Var | `fs` | `s3` | `tigris` | Notes |
| --- | --- | --- | --- | --- |
| `EXAMPLE_ADAPTER` | (default) | ✓ | ✓ | One of `fs`, `s3`, `tigris`. |
| `EXAMPLE_BUCKET` | — | required | required | Bucket / location name; must already exist for cloud adapters. |
| `EXAMPLE_ENDPOINT` | — | optional | optional | S3-compatible endpoint URL. Tigris defaults to its production endpoint when unset. |
| `EXAMPLE_REGION` | — | optional | — | AWS region. |
| `EXAMPLE_ACCESS_KEY_ID` | — | required | required | |
| `EXAMPLE_SECRET_ACCESS_KEY` | — | required | required | |
| `EXAMPLE_FORCE_PATH_STYLE` | — | optional | optional | Set to `'true'` for MinIO and most non-AWS S3-compatibles. |

## Copying an example out

The examples share a single `package.json` to keep the repo tidy. When you copy one out:

1. Copy the example folder (`quickstart/`, etc.) and `adapter.ts` to your project.
2. Install the deps that the example imports — typically `@storagesdk/core` + `@storagesdk/adapters`.
3. Run with `tsx index.ts` or compile + run.
