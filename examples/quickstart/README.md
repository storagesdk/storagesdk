# quickstart

The five-minute tour: construct a `Storage`, upload, list, download, get a URL, delete.

## Run it from this repo

```sh
pnpm install
pnpm dev
```

## Run it standalone

Copy this folder out, then in your own project:

```sh
npm install @storagesdk/core @storagesdk/adapters
npm run dev
```

The example uses the FS adapter against a fresh directory under `os.tmpdir()`. To use a different backend, swap the import and adapter config — the rest of the code stays the same.

```ts
// FS (this example)
import { fs } from '@storagesdk/adapters/fs';
new Storage({ adapter: fs({ root: '/var/data', folder: 'photos' }) });

// S3 (future)
import { s3 } from '@storagesdk/adapters/s3';
new Storage({ adapter: s3({ bucket: 'photos' }) });
```
