---
'@storagesdk/adapters': patch
---

The Vercel Blob adapter now honors `multipart`: multipart uploads, including
streams and bodies over `multipartThreshold`, are sent with `@vercel/blob`'s
`put({ multipart: true })`, which uploads the parts in parallel and retries
failed ones. Before, every upload was one PUT, which fails for large objects.
