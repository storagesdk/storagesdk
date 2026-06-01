---
"@storagesdk/adapters": minor
---

Conformance suite (`@storagesdk/adapters/test-suite`) — refactor adapter capability switches into a single `capabilities` object on `StorageAdapterTestSuiteOptions` with behavior-describing names:

```ts
storageAdapterTestSuite({
  name: 'my-adapter',
  adapter: buildAdapter,
  capabilities: {
    userMetadata: true,        // adapter preserves user `metadata`
    contentType: true,         // adapter preserves `contentType`
    presignedUploads: true,    // `uploadUrl()` returns a usable URL
    fetchableSignedUrls: true, // `url()` is fetchable over HTTP
  },
});
```

Every flag defaults to `true`. Set one to `false` to opt out of the corresponding assertions when the backend doesn't support that behavior.

This replaces the flat `metadata` and `httpSignedUrls` flags. The only call sites — `fs` and `vercel` — are migrated in the same change.

Also adds `testTimeoutMs` to override vitest's default 5s per-test timeout for backends whose per-op latency makes the default too tight (e.g. adapters that hit a remote API many times per test).
