# @storagesdk/adapters

Backend adapters for [storagesdk](https://github.com/storagesdk/storagesdk). Import the adapter you need via a subpath; the others are tree-shaken out.

```sh
npm install @storagesdk/core @storagesdk/adapters
```

Each backend's SDK is an optional peer dependency. Install only the SDKs for adapters you actually import.

## Available adapters

- [`@storagesdk/adapters/fs`](./src/fs/README.md) — filesystem adapter. Targets `node:fs/promises`; primarily for local development and tests.
- [`@storagesdk/adapters/s3`](./src/s3/README.md) — Amazon S3 and S3-compatible backends (MinIO, R2, DigitalOcean Spaces, etc.).

> Status: pre-release. See `docs/RFC.md` and `docs/PLAN.md` at the repo root.
