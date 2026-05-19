# s3-fork-experiment

Fork an S3 bucket to try a risky change in isolation, then throw it away.

## Prerequisites

A running S3-compatible backend **and an existing bucket** (the example does not create one). Local MinIO works out of the box:

```sh
docker compose up -d minio
# create a bucket once, any way you like (mc, AWS CLI, web console, etc.)
```

`S3_BUCKET` is required. Point at AWS S3, R2, Tigris, etc. via `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` env vars.

## Run

```sh
pnpm install
S3_BUCKET=my-bucket pnpm --filter @storagesdk/examples s3-fork-experiment
```

## What the script does

1. **Baseline.** Upload one file to the main bucket.
2. **`storage.snapshots.create()`** — forks must be seeded from a snapshot, not from the live bucket.
3. **`storage.forks.create({ name, fromSnapshot })`** — creates a new bucket, copies every object from the snapshot via server-side `CopyObject`.
4. **`storage.forks.get(name)`** — returns a full read/write `Storage` rooted at the fork bucket.
5. **Mutate the fork.** The main bucket is untouched.
6. **`storage.forks.delete(name)`** — empties and deletes the fork bucket.

To **promote** a fork instead of throwing it away, list its entries and copy them back to the main bucket, then delete the fork.

## Bucket-name length note

S3 caps bucket names at 63 chars. If you later snapshot the fork, the snapshot id will be `<fork-name>-snapshot-<25 digits>` (35 chars overhead), so plan accordingly when naming forks.
