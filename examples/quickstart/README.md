# quickstart

The five-minute tour: construct a `Storage`, upload, list, download, get a URL, delete.

## Run

From the repo root:

```sh
pnpm install
pnpm --filter @storagesdk/examples quickstart
```

The example uses the FS adapter against a fresh directory under `os.tmpdir()`. To use a different backend, swap the import and adapter config in `index.ts` — the rest of the code stays the same.

```ts
// FS (this example)
import { fs } from '@storagesdk/adapters/fs';
new Storage({ adapter: fs({ root: '/var/data', folder: 'photos' }) });

// S3
import { s3 } from '@storagesdk/adapters/s3';
new Storage({ adapter: s3({ bucket: 'photos', /* ... */ }) });
```
