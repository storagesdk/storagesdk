# @storagesdk/adapters/tensorlake

[Tensorlake Cloud Volumes](https://docs.tensorlake.ai/) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters tensorlake
```

> **Requires Node.js >= 22 and `tensorlake >= 0.5.89 < 0.6.0`.** This adapter uses the native Cloud Volumes publication, ranged-read, snapshot, copy/move, and fork APIs introduced in that SDK release. storagesdk core itself has no such requirement.

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

- Uploads use Tensorlake's checksum-attested direct publication path: bytes flow from the SDK process to blob storage, never through the Tensorlake API server. The write returns only after the new live head is durable. `ReadableStream` bodies are first spooled to a temporary local file so multi-GiB uploads remain bounded in memory, then streamed from that file to blob storage.
- `copy` and `move` are atomic metadata mutations that reuse immutable content references. They don't download or re-upload file bytes.
- `snapshots.create()` retains the current head permanently with one metadata-only server call. `snapshots.get(id)` is a frozen time-travel reader, and `snapshots.delete()` removes the native retention root. Bytes still reachable from a head, fork, mount, or another snapshot remain durable.
- Forks are deterministic, opaque sibling filesystems derived from the complete parent/name tuple, so nested forks cannot collide with similarly named root forks. Tensorlake creates them by sharing the source storage network and publishing a new ownership root/head pointer; no tree walk or payload copy is required. `merge`/`rebase`/`diff` use the core three-way polyfills, keyed on each file's native content id as the etag.
- Storagesdk keeps one hidden record per fork under `.storagesdk/forks/`; independent paths let concurrent fork creates and deletes compose. Native snapshots are discovered directly from Tensorlake.
- Concurrent native forks retry Tensorlake's transient `network reachability changed` conflict; duplicate fork names still fail immediately with `Conflict`.
- Range reads use Tensorlake's server-side HTTP range path and return the requested bytes plus immutable content identity in one request.
- `head`/`list` report `lastModified` as the Unix epoch — Tensorlake listings carry no per-file mtime — and `list` walks the tree client-side.
- `contentType` and `metadata` are accepted but not persisted; downloads always report `application/octet-stream`.
- `url()` returns a deterministic, non-fetchable `tensorlake://<filesystem>/<path>` locator (snapshot readers append `?v=<version-id>`).
- `uploadUrl()` throws `NotSupported`; Tensorlake does not expose presigned upload URLs.

## Environment

```sh
TENSORLAKE_FILESYSTEM=agent-runs
TENSORLAKE_API_KEY=tl_...          # falls back to TENSORLAKE_PAT
TENSORLAKE_API_URL=https://api.tensorlake.ai
TENSORLAKE_ORGANIZATION_ID=org_...
TENSORLAKE_PROJECT_ID=proj_...
```

## Compatibility

| Capability | Support |
| --- | --- |
| Uploads | Native direct-to-blob publication |
| Copy / move | Native metadata-only mutations |
| Snapshots | Native metadata-only retention |
| Forks | Native shared-storage-network fork |
| Byte-range reads | Server-side HTTP range |
| User metadata | Not persisted |
| Signed URLs | Non-fetchable locator only |
