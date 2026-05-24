# storagesdk

A vendor-neutral SDK for object storage with one API across providers (S3, R2, GCS, Azure, Tigris, filesystem). Snapshots and forks are core operations alongside upload, download, list, copy, move, delete, and signed URLs.

The design lives in [`docs/RFC.md`](docs/RFC.md). The implementation plan lives in [`docs/PLAN.md`](docs/PLAN.md). Contributor guidance lives in [`AGENTS.md`](AGENTS.md).

## Packages

- **`@storagesdk/core`** — the consumer entry. `Storage`, `StorageError`, plus the types end-user code handles.
- **`@storagesdk/core/adapter`** — the adapter-authoring entry. Adds `defineAdapter`, contract types, and `Manifest` helpers.
- **`@storagesdk/adapters`** — backend adapters. Import the one you need via a subpath:
  - `@storagesdk/adapters/fs`
  - `@storagesdk/adapters/s3`
  - `@storagesdk/adapters/tigris`
  - `@storagesdk/adapters/test-suite` — the cross-adapter conformance suite, for third-party adapter authors.

## Development

Requirements: Node 22+ and pnpm 10+.

```sh
pnpm install
pnpm check       # biome
pnpm typecheck
pnpm build
pnpm test
```

### Running the adapter tests

Tests treat the SDK like a user would: the bucket/root the adapter is pointed at must exist before the test starts, and the credentials must already have sufficient rights.

- **FS**: works out of the box (defaults to `os.tmpdir()`).
- **S3 (MinIO)**: requires a pre-existing bucket.

    ```sh
    docker compose up -d minio
    aws --endpoint-url http://localhost:9000 --no-sign-request s3 mb s3://storagesdk-test

    S3_TEST_BUCKET=storagesdk-test pnpm --filter @storagesdk/adapters test
    ```

- **Tigris**: requires a live bucket and credentials.

    ```sh
    TIGRIS_BUCKET=<your-bucket> \
    TIGRIS_ACCESS_KEY_ID=<...> \
    TIGRIS_SECRET_ACCESS_KEY=<...> \
    pnpm --filter @storagesdk/adapters test
    ```

See [`AGENTS.md`](AGENTS.md) for the full environment-variable matrix and the conformance-suite details.

## License

MIT.
