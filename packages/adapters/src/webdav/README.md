# @storagesdk/adapters/webdav

WebDAV adapter for [storagesdk](https://github.com/storagesdk/storagesdk). Works against any server that speaks WebDAV — Nextcloud, ownCloud, Apache mod_dav, nginx-dav, NAS appliances (Synology, QNAP, TrueNAS), and providers like pCloud, mailbox.org, kDrive, TransIP STACK, disroot.

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
```

## Config

```ts
webdav({
  baseUrl: string;                                  // server root URL
  root: string;                                     // path under baseUrl
  folder: string;                                   // <root>/<folder> for this adapter
  username?: string;                                // Basic / Digest auth
  password?: string;
  token?: string;                                   // OAuth bearer (takes precedence)
  authType?: 'basic' | 'digest' | 'token' | 'none'; // override the inferred scheme
});
```

## Notes

- Peer dependency: `webdav` (v5.x). ESM-only.
- The `webdav` client is **stateless** — every method is an independent HTTP request. There is no connection to manage, no socket lifecycle, no idle timeouts.
- Snapshots and forks are sibling collections under `root`, populated via the WebDAV `COPY` verb with `Depth: infinity`. **One HTTP request, server-side, recursive.** Unlike SFTP/FTP, the client never round-trips the data.
- `contentType` is honored end-to-end. The lib carries it through `PUT Content-Type` on upload and reads it back via `PROPFIND`'s `getcontenttype` on head/download.
- `opts.metadata` on `upload` is silently dropped — WebDAV's PROPPATCH dead properties exist in the spec but server support is patchy (Nextcloud OK, generic Apache mod_dav unreliable).
- `url()` returns the plain resource URL. It's not signed — fetching it requires the caller to supply auth (Basic/Digest/Bearer). Conformance flips `fetchableSignedUrls: false` to match.
- `uploadUrl()` throws `NotSupported` — WebDAV has no presigned upload concept.
- `storage.raw` is the underlying `WebDAVClient` — reach for it when you need PROPPATCH, LOCK, custom WebDAV properties, or anything else the adapter doesn't surface.

## Capabilities

| Capability | Support |
| --- | --- |
| Snapshots | Sibling collection via native `COPY` (one HTTP call) |
| Forks | Sibling collection via native `COPY` (one HTTP call) |
| Byte-range reads | ✓ (slice of the downloaded blob) |
| Multipart upload | ✗ |
| User metadata | ✗ |
| Content-Type | ✓ |
| Signed URLs | ✗ (returns the plain resource URL; caller supplies auth) |
| Presigned uploads | ✗ |
