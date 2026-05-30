---
"@storagesdk/adapters": patch
---

Documentation only — no API or runtime changes.

- Reorder the adapter table in the `@storagesdk/adapters` README.
- Rename the `@storagesdk/adapters/fly` label from "Fly.io Tigris" to "Fly.io" in the package README and the adapter's own README/JSDoc.
- Use "provider" instead of "backend" in the `@storagesdk/adapters` README and simplify the S3 description.
- `@storagesdk/adapters/tigris` README: remove a stale "POST policies on `uploadUrl` — only PUT presigning today" note (the adapter has been forwarding `maxSize` / `minSize` to `@tigrisdata/storage` and returning the POST form when the SDK switches to it).
