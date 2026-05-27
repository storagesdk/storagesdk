---
"@storagesdk/core": minor
"@storagesdk/adapters": minor
---

Two new adapters under `@storagesdk/adapters`.

### `@storagesdk/adapters/azure`

Azure Blob Storage. Maps a container to a storagesdk bucket; snapshots and forks use the sibling-container convention (server-side `Copy Blob`). Auth via account name + key. `maxSize`/`minSize` on `uploadUrl` are silently dropped — Azure SAS has no `content-length-range` equivalent.

```ts
import { azure } from '@storagesdk/adapters/azure';
const storage = new Storage({ adapter: azure({ bucket, accountName, accountKey }) });
```

### `@storagesdk/adapters/gcs`

Google Cloud Storage. Snapshots and forks via sibling-bucket copy. Auth via service-account credentials (inline JSON, key file path, or Application Default Credentials). Supports v4 POST policies on `uploadUrl` for browser-direct uploads.

```ts
import { gcs } from '@storagesdk/adapters/gcs';
const storage = new Storage({ adapter: gcs({ bucket, projectId, keyFilename }) });
```

### Other changes

- **fs**: `uploadUrl` no longer throws `NotSupported` when `maxSize`/`minSize` is set — silently degrades to a PUT URL. Option-level constraints that a backend can't enforce now degrade across the board; the per-adapter README documents what's enforced.
- **examples**: `EXAMPLE_ADAPTER=azure|gcs` wired alongside the existing options.
- **docs**: top-level README adapter table and `AGENTS.md` running-tests section now cover the two new adapters.
