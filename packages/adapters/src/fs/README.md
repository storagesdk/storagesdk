# @storagesdk/adapters/fs

Filesystem adapter for [storagesdk](https://github.com/storagesdk/storagesdk). Targets `node:fs/promises`; primarily for local development and tests.

```sh
npm install @storagesdk/core @storagesdk/adapters
```

```ts
import { Storage } from '@storagesdk/core';
import { fs } from '@storagesdk/adapters/fs';

const storage = new Storage({
  adapter: fs({ root: '/var/data', folder: 'photos' }),
});
```

## Configuration

```ts
fs({
  root:   string;  // parent directory under which the folder and its siblings live
  folder: string;  // the folder this adapter operates on
})
```

Data lives at `<root>/<folder>/`. Snapshots and forks created later (via `storage.snapshots.create()` / `storage.forks.create()`) land as sibling folders directly under `<root>` — *not* nested inside the data folder.

For the call above (`root: '/var/data'`, `folder: 'photos'`):

```
/var/data/
├── photos/                                  ← this adapter's data
│   ├── beach.jpg
│   └── .storagesdk.metadata.json
├── photos-snapshot-1747318800123456789012/  ← a snapshot of `photos`
└── photos-exp/                              ← a fork named `photos-exp`
```

## Object metadata

The filesystem doesn't natively preserve a content type or arbitrary user metadata. The FS adapter writes a tiny sidecar JSON next to each object that needs them:

```
photo.jpg
photo.jpg.storagesdk.meta.json     ← only written when contentType or metadata is set
```

`head()` and `download()` read the sidecar; `list()` skips it for speed (paginated list returns stat-based meta only). `copy`, `move`, and `delete` operate on the pair.

## URLs

`storage.url()` and `storage.uploadUrl()` return `file://` URLs with an optional `expires` parameter encoded. **These are not signed URLs** — the filesystem has no notion of access control or expiry enforcement. They're useful for local development and tests where any URL shape works.

```ts
await storage.url('beach.jpg');
// file:///var/data/photos/beach.jpg

await storage.url('beach.jpg', { expiresIn: 3600 });
// file:///var/data/photos/beach.jpg?expires=1747322400

await storage.uploadUrl('new.jpg');
// { method: 'PUT', url: 'file:///var/data/photos/new.jpg' }
```

## Reserved filenames

The FS adapter owns two pieces of the keyspace under each location:

- `<key>.storagesdk.meta.json` — per-object sidecar. `upload()` rejects keys with this suffix.
- `.storagesdk.metadata.json` — per-location manifest (the SDK's own `writeManifest` writes through `adapter.upload`, so this filename is *not* rejected; just don't write to it yourself).

Both are filtered out of `list()` results.

## Path traversal

Keys containing `..` segments that resolve outside the adapter's folder are rejected with `StorageError({ code: 'InvalidArgument' })`. `storage.upload('../escape.txt', body)` throws.

## What's not implemented

- **Multipart uploads.** `upload(path, body, { multipart: true })` accepts the option silently but writes the body in one `fs.writeFile` call. The filesystem doesn't have a separate multipart API.
- **Streaming download at the adapter level.** `download()` reads the file fully into a `Uint8Array`. The `storage.download(path, { as: 'stream' })` overload still works — it wraps the buffered body in a `ReadableStream`.

## Snapshots and forks

Both follow the SDK's sibling-location convention — each snapshot/fork is a **sibling folder** under `<root>` with its own `.storagesdk.metadata.json`. `snapshots.list()` and `forks.list()` read the parent's manifest.

### How creation works

Both `snapshots.create` and `forks.create` follow the same five-step recipe — they only differ in how they name the sibling and what they record in the parent's manifest:

1. **Pick a sibling name.** Snapshots: `nextSnapshotId(folder)` → `<folder>-snapshot-<25 digits>` (13-digit ms + 12-digit crypto-random; the id doubles as the folder name). Forks: user-provided `name`.
2. **Resolve safely.** `resolveSiblingSafe(root, name)` requires the resolved path to be a direct child of `<root>`. Names with separators, `.`, `..`, or anything escaping `<root>` throw `InvalidArgument` synchronously. Forks also bail with `Conflict` if the target folder already exists.
3. **Copy the source folder.** `fsp.cp(source, sibling, { recursive: true })`. The source is:
   - For snapshots → the parent's live folder.
   - For forks with `fromSnapshot` set → the named snapshot folder (must exist, else `NotFound`).
   - For forks with `fromSnapshot` omitted → the parent's live folder.
4. **Write the child's own manifest.** `writeManifest(siblingImpl, emptyManifest({ location: folder, snapshotId }))`. This overwrites the parent's manifest that step 3 just copied across, so the new sibling tracks its own lineage with empty snapshot/fork lists.
5. **Append to the parent's manifest.** `readManifest(parent)` → push the new `SnapshotInfo` / `ForkInfo` → `writeManifest(parent, ...)`. Concurrent creates on the same parent will race this read-modify-write — serialize calls per parent until that's fixed.

The recursive copy is plain `fs.cp` — no hardlinks, no reflinks. Each snapshot and fork is a full bytewise copy, which is simple and portable but proportional to the data size. `snapshots.get(id)` returns a `ReadOnlyAdapter` scoped to the sibling folder; the read-only contract is enforced by type, not by filesystem permissions.

See [`examples/snapshots`](../../../../examples/snapshots) and [`examples/forks`](../../../../examples/forks) for runnable walkthroughs.
