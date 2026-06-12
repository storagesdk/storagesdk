---
'@storagesdk/cli': patch
---

Bundle every adapter's SDK into the published `@storagesdk/cli` tarball. The CLI was previously broken at runtime because `@storagesdk/adapters` declares all backend SDKs (`@aws-sdk/client-s3`, `@tigrisdata/storage`, `@azure/storage-blob`, etc.) as **optional** peer deps — right for library consumers but wrong for a globally-installed CLI: `storage ls --adapter s3` failed with `ERR_MODULE_NOT_FOUND`, or worse silently resolved a stale version of the SDK sitting in some ancestor `node_modules`.

The fix lives in a pair of `prepack` / `postpack` scripts that inject the adapter peer deps into the CLI's `dependencies` at publish time, then restore the committed `package.json` after. The source tree stays minimal and never drifts; the tarball ships self-contained so `npm install -g @storagesdk/cli` followed by `storage <verb> --adapter <anything>` just works.
