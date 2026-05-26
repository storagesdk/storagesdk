---
"@storagesdk/core": minor
"@storagesdk/adapters": minor
---

`uploadUrl` now supports S3-style POST policies for browser-direct uploads. Passing `maxSize` or `minSize` switches the returned shape from a presigned PUT URL to a presigned POST URL + form fields the browser submits as `multipart/form-data`.

```ts
const signed = await storage.uploadUrl('photo.jpg', {
  expiresIn: 300,
  maxSize: 5 * 1024 * 1024,
  contentType: 'image/jpeg',
});
// signed.method === 'POST'
// signed.url + signed.fields go straight into a FormData submission
```

- **s3**: implemented via `@aws-sdk/s3-presigned-post` (new optional peer dep). R2 and MinIO inherit POST automatically.
- **tigris**: switched to `@tigrisdata/storage`'s new `getSignedUploadUrl` (SDK 3.9.0+). Bumps `@tigrisdata/storage` peer to `^3.9.0`.
- **fs**: throws `StorageError({ code: 'NotSupported' })` when `maxSize`/`minSize` is set — `file://` URLs aren't enforceable upload policies.

Existing PUT behavior is unchanged when no size constraints are passed.

New example: `examples/browser-upload/` walks through the full server-mints-URL → browser-POSTs-file → server-verifies flow.
