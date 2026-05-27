---
"@storagesdk/adapters": minor
---

New `@storagesdk/adapters/vercel` adapter for [Vercel Blob](https://vercel.com/docs/vercel-blob).

```ts
import { vercel } from '@storagesdk/adapters/vercel';
const storage = new Storage({ adapter: vercel({ bucket: 'photos' }) });
```

Vercel Blob has no native bucket concept, so the adapter maps each storagesdk `bucket` to a pathname prefix within the Vercel Blob store. Snapshots and forks follow the sibling-prefix convention from the filesystem adapter; cross-prefix population uses Vercel's server-side `copy`.

**Compat notes:**

- `metadata` on `upload` is silently dropped — Vercel Blob has no user-metadata field.
- `minSize` on `uploadUrl` is silently dropped — Vercel signed PUT URLs enforce a max size via `maximumSizeInBytes` but have no lower bound.

Also adds a `metadata?: boolean` option to the `@storagesdk/adapters/test-suite` conformance suite (defaults to `true`). Adapters whose backend has no user-metadata concept opt out by setting it to `false`.
