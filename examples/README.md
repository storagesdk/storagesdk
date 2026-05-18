# storagesdk examples

Runnable examples for each feature of [storagesdk](https://github.com/tigrisdata/storagesdk). All examples live under a single `@storagesdk/examples` workspace package so there's one set of dependencies to manage. Each example is a folder with one `index.ts` and a `README.md` you can copy out to your own project (bring your own `package.json`).

## Run an example

From the repo root:

```sh
pnpm install
pnpm --filter @storagesdk/examples <example-name>
```

Or, from the `examples/` directory:

```sh
cd examples
pnpm <example-name>
```

## Examples

### Filesystem adapter (no setup required)

| Folder | What it demonstrates |
| --- | --- |
| [`quickstart`](./quickstart) | Construct a `Storage`, upload, list, download, get a URL, delete. |
| [`snapshot-restore`](./snapshot-restore) | Take a snapshot before a risky change, read it back, restore from it. |
| [`fork-experiment`](./fork-experiment) | Fork from a snapshot, mutate the fork in isolation, throw it away or promote. |

### S3 adapter (requires MinIO or any S3-compatible backend)

Start MinIO locally first:

```sh
docker compose up -d minio
```

| Folder | What it demonstrates |
| --- | --- |
| [`s3-quickstart`](./s3-quickstart) | Same as `quickstart`, against the S3 adapter via MinIO. |
| [`s3-snapshot-restore`](./s3-snapshot-restore) | Same as `snapshot-restore`, with snapshot buckets created via `CreateBucket`. |
| [`s3-fork-experiment`](./s3-fork-experiment) | Same as `fork-experiment`, with the fork in a real sibling bucket. |

Each S3 example reads `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` env vars so you can point them at AWS S3, Cloudflare R2, DigitalOcean Spaces, etc. without code changes.

## Copying an example out

The examples share a single `package.json` to keep the repo tidy. When you copy one out:

1. Copy the example folder (`quickstart/`, `s3-quickstart/`, etc.) to your project.
2. Install the deps that the example imports — typically `@storagesdk/core` + `@storagesdk/adapters`, plus `@aws-sdk/client-s3` for the s3 examples.
3. Run with `tsx index.ts` or compile + run.
