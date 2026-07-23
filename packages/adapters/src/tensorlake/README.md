# @storagesdk/adapters/tensorlake

[Tensorlake Cloud Volumes](https://docs.tensorlake.ai/) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters tensorlake
```

```ts
import { Storage } from '@storagesdk/core';
import { tensorlake } from '@storagesdk/adapters/tensorlake';

const storage = new Storage({
  adapter: tensorlake({
    filesystem: 'agent-runs',
    apiKey: process.env.TENSORLAKE_API_KEY,
  }),
});
```

## Configuration

```ts
tensorlake({
  filesystem: string;
  apiKey?: string;
  apiUrl?: string;
  organizationId?: string;
  projectId?: string;
})
```

A Tensorlake filesystem is a durable, versioned file tree; one filesystem maps to one storagesdk location. Create the filesystem out of band (e.g. via the `tl` CLI or the SDK's `FilesystemClient.create()`) before pointing the adapter at it.

## Notes

- Reads and writes go through the SDK's `Filesystem` handle: `writeFile` for uploads, `readFile` for downloads, `listFiles` for `head`/`list`. Range reads are sliced client-side; `copy`/`move` are read-then-write (`move` is an atomic `writeFiles` with a delete).
- Snapshots are native commits. `snapshots.get(id)` reads the filesystem at that commit (time-travel), so snapshot reads stay frozen after later writes. The set of snapshots is tracked in a per-filesystem manifest object (`.storagesdk.metadata.json`).
- `snapshots.delete()` only drops the manifest reference — the SDK has no delete-snapshot call, so the underlying commit persists until the whole filesystem is deleted.
- Forks are sibling filesystems named `<filesystem>-fork-<name>`, seeded by copying the source snapshot's files into the new filesystem. `merge`/`rebase`/`diff` use the core three-way polyfills, keyed on each file's git blob `oid` (a content hash) as the etag.
- `head`/`list` report `lastModified` as the Unix epoch — Tensorlake listings carry no per-file mtime — and `list` walks the tree client-side.
- `contentType` and `metadata` are accepted but not persisted; downloads always report `application/octet-stream`.
- `url()` returns a deterministic, non-fetchable `tensorlake://<filesystem>/<path>` locator (snapshot readers append `?v=<commit>`).
- `uploadUrl()` throws `NotSupported`; Tensorlake does not expose presigned upload URLs.

## Environment

```sh
TENSORLAKE_FILESYSTEM=agent-runs
TENSORLAKE_API_KEY=tl_...          # falls back to TENSORLAKE_PAT
TENSORLAKE_API_URL=https://api.tensorlake.ai
TENSORLAKE_ORGANIZATION_ID=org_...
TENSORLAKE_PROJECT_ID=proj_...
```
