---
'@storagesdk/adapters': minor
'@storagesdk/core': patch
---

Add a `tensorlake` adapter for Tensorlake Cloud Volumes, available via `@storagesdk/adapters/tensorlake` and `buildAdapter('tensorlake')`.

One Tensorlake filesystem maps to one storagesdk location. Uploads send checksum-attested parts directly to blob storage; stream bodies remain memory-bounded through Tensorlake's local-path publication API; downloads return bytes, content identity, and size in one request with server-side range support; copy and move reuse immutable content references; snapshots are metadata-only retention points with time-travel reads; and forks share the source filesystem's storage network without copying bytes. `merge`/`rebase`/`diff` use the core polyfills (native content id as etag). `contentType`/`metadata` aren't persisted, `url()` returns a non-fetchable `tensorlake://` scheme URL, and `uploadUrl()` is unsupported. Configure via `TENSORLAKE_FILESYSTEM`, `TENSORLAKE_API_KEY` (falls back to `TENSORLAKE_PAT`), and optional `TENSORLAKE_API_URL` / `TENSORLAKE_ORGANIZATION_ID` / `TENSORLAKE_PROJECT_ID`.

Live-fork creation no longer deletes its automatically retained base when physical fork creation fails. This keeps content-addressed snapshots safe when a backend returns a retention point that existed before the fork attempt.
