# s3-snapshot-restore

Take a snapshot of an S3 bucket, mutate live, read the frozen view, restore from the snapshot.

## Prerequisites

```sh
docker compose up -d minio
```

The example defaults to MinIO on `localhost:9000`. Point at AWS S3, R2, etc. via `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` env vars.

## Run

```sh
pnpm install
pnpm --filter @storagesdk/examples s3-snapshot-restore
```

## What the script does

1. **Baseline.** Upload two files.
2. **`storage.snapshots.create({ name })`** — creates a sibling bucket (`<bucket>-snapshot-<25 digits>`) and copies every object server-side via `CopyObject`.
3. **Mutate** the live storage so it diverges from the snapshot.
4. **`storage.snapshots.get(id)`** — `ReadOnlyStorage` rooted at the snapshot bucket. Reads return the frozen state.
5. **Restore** by copying snapshot entries back into the live bucket.
6. **`storage.snapshots.delete(id)`** — empties and deletes the snapshot bucket.

## Bucket-name length note

S3 caps bucket names at 63 chars. The snapshot id is `<parent>-snapshot-<25 digits>` (35 chars overhead), so the parent bucket name should be **≤ 28 chars** for snapshots to work.
