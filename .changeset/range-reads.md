---
"@storagesdk/core": minor
"@storagesdk/adapters": minor
---

`download` now accepts an optional `range` to fetch a byte slice instead of the full object.

```ts
const item = await storage.download('video.mp4', {
  range: { offset: 0, length: 65_536 },
});
item.size; // 65536 (slice length, not full-object size)
```

Same shape for the typed-body overloads:

```ts
const bytes = await storage.download('big.bin', {
  as: 'bytes',
  range: { offset: 4096, length: 1024 },
});
```

**Mapping per adapter:**

- s3, r2, minio: `Range: bytes=N-M` on `GetObjectCommand`.
- azure: `BlobClient.download(offset, count)` (native two-arg signature).
- gcs: `createReadStream({ start, end })`.
- vercel: `Range` header passed through `get`'s `headers` option.
- tigris: slice-fallback (`@tigrisdata/storage`'s `get` doesn't expose range yet — egress is full object, slice is in-process). Will swap to native when the SDK adds it.
- fs: in-memory slice of the full read.

**Contract:**

- `range.offset` must be `>= 0`, `range.length` must be `> 0`. Validated in `defineAdapter` and surfaced as `InvalidArgument`.
- `range` past EOF returns whatever bytes exist — no error. Matches HTTP `Range` semantics.
- `StorageItem.size` is the slice length, not the full-object size.

The `ReadOnlyAdapter.download` signature changed: `opts?` is now `DownloadOptions` (`{ signal?, range? }`) instead of the inline `{ signal? }`. Third-party adapters that implement the interface continue to compile (method-param bivariance) but should accept and pass through `range` to honor the contract — the conformance suite has six new tests that exercise it.
