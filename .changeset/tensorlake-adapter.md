---
'@storagesdk/adapters': minor
---

Add a `tensorlake` adapter for Tensorlake Cloud Volumes, available via `@storagesdk/adapters/tensorlake` and `buildAdapter('tensorlake')`.

One Tensorlake filesystem maps to one storagesdk location. Snapshots are native commits with time-travel reads; forks are sibling filesystems (`<fs>-fork-<name>`) seeded from the source snapshot, with `merge`/`rebase`/`diff` provided by the core polyfills (content-hash `oid` as etag). `contentType`/`metadata` aren't persisted, `url()` returns a non-fetchable `tensorlake://` scheme URL, and `uploadUrl()` is unsupported. Configure via `TENSORLAKE_FILESYSTEM`, `TENSORLAKE_API_KEY` (falls back to `TENSORLAKE_PAT`), and optional `TENSORLAKE_API_URL` / `TENSORLAKE_ORGANIZATION_ID` / `TENSORLAKE_PROJECT_ID`.
