---
"@storagesdk/adapters": patch
---

`tigris` adapter: use native byte-range reads and metadata-on-get from `@tigrisdata/storage@^3.11.0`.

- `download` now passes `range: { start, end }` through to Tigris's native `get` — no more slice-the-full-body fallback, partial reads only fetch the partial content.
- `download` also sets `includeMetadata: true`, so the returned `StorageItem` now carries the real `etag`, `lastModified`, and `userMetadata` from the same S3 response. Previously `etag` was always `""` because the SDK's `get` didn't surface it; now it matches the rest of the adapters.
- `forks.create({ fromSnapshot })` now validates the snapshot id via `listBucketSnapshots` and throws `NotFound` for unknown ids. Previously the bogus id surfaced as `Provider` from Tigris's `createBucket`, breaking the cross-adapter contract pinned by the conformance suite.

Peer dependency on `@tigrisdata/storage` bumps from `^3.10.0` to `^3.11.0`. The 3.11.0 release is what introduces both options.
