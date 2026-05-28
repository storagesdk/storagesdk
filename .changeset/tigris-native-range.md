---
"@storagesdk/adapters": patch
---

### `forks.create({ fromSnapshot })` — bogus-id contract relaxed

The conformance test `forks.create with an unknown fromSnapshot` previously required `code: 'NotFound'`. To uphold that, every copy-based adapter pre-checked the snapshot id against its parent manifest (or via a native list call) before invoking the backend. That round-trip is fine for manifest-backed adapters but can mean an O(snapshots) scan on backends with native, unbounded snapshot lists.

The conformance test now asserts the call throws a `StorageError` — no specific code. The actual failure mode that matters is "no silent success with an empty fork"; whether the error code is `NotFound`, `Provider`, or anything else is a less useful invariant to pin down at the contract level. Backends that map their copy-source-missing error to `NotFound` (e.g. AWS S3 surfacing `NoSuchBucket`) keep doing so; backends that surface it as something more generic do that.

The explicit pre-checks in s3, gcs, azure, and tigris are removed. The only adapter that still pre-checks is the one whose backend would otherwise silently succeed with an empty fork — keep that one targeted, drop the others.

No behavior change for callers passing a valid snapshot id. Callers branching on `code === 'NotFound'` for a bogus id will now see whatever code the underlying backend produces; refine adapter-side if you need that level of precision.

### `tigris` adapter

Picks up two `get` options from `@tigrisdata/storage@^3.11.0`:

- `range: { start, end }` — native byte-range reads. Drops the slice-the-full-body fallback the adapter was using since byte-range support shipped.
- `includeMetadata: true` — returns `{ body, metadata }` so the same response carries `etag`, `modified`, `contentType`, and `userMetadata`. Previously the adapter's `download` returned `etag: ""` because the SDK didn't surface it; now it matches every other adapter.

Peer dependency on `@tigrisdata/storage` bumps `^3.10.0` → `^3.11.0`.
