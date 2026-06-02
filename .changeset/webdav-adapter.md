---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/webdav` adapter for any WebDAV server — Nextcloud, ownCloud, Apache mod_dav, nginx-dav, NAS appliances (Synology, QNAP, TrueNAS), and providers that still ship WebDAV (pCloud, mailbox.org, kDrive, TransIP STACK, disroot).

```ts
import { Storage } from '@storagesdk/core';
import { webdav } from '@storagesdk/adapters/webdav';

const storage = new Storage({
  adapter: webdav({
    baseUrl: 'https://cloud.example.com/remote.php/dav/files/me',
    root: '/storagesdk',
    folder: 'demo',
    username: 'me',
    password: process.env.WEBDAV_PASSWORD,
  }),
});

// Snapshots and forks ride on a single server-side COPY with Depth: infinity.
const snap = await storage.snapshots.create({ name: 'baseline' });
await storage.forks.create({ name: 'experiment', fromSnapshot: snap.id });
```

**Notes:**

- Peer dep: `webdav` (v5.x, ESM-only).
- The `webdav` client is stateless — every method is an independent HTTP request, so there's no connection lifecycle to manage. Auth via Basic / Digest (auto-detected) / OAuth Bearer / None.
- Snapshots and forks are sibling collections under `root`, populated by **one** `COPY` request with `Depth: infinity` (server-side, recursive). No client-side fan-out.
- `contentType` is honored end-to-end (PUT `Content-Type` on upload, `getcontenttype` via PROPFIND on read).
- `opts.metadata` on `upload` is silently dropped — WebDAV's PROPPATCH dead properties exist in the spec but server support is inconsistent. Conformance flips `userMetadata: false` to match.
- `url()` returns the plain resource URL; caller supplies auth. `uploadUrl()` throws `NotSupported`.
- `storage.raw` is the underlying `WebDAVClient` for PROPPATCH, LOCK, or anything the adapter doesn't surface directly.
