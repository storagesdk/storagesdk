# s3-quickstart

The five-minute tour against the S3 adapter: construct a `Storage`, upload, list, download, get a signed URL, delete.

## Prerequisites

A running S3-compatible backend. The example defaults to local MinIO:

```sh
docker compose up -d minio
```

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples s3-quickstart
```

## Pointing at a different backend

Override the defaults via env vars:

```sh
# AWS S3
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com \
S3_REGION=us-east-1 \
S3_ACCESS_KEY_ID=... \
S3_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples s3-quickstart

# Cloudflare R2
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
S3_REGION=auto \
S3_ACCESS_KEY_ID=... \
S3_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples s3-quickstart
```

The adapter code stays identical across backends — only the construction config changes.
