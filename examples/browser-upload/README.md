# browser-upload

End-to-end demo of the POST-policy flow: a tiny Node server mints a presigned POST URL via storagesdk, the browser submits the file directly to the storage backend.

## Run

POST policies aren't supported by the fs adapter (no HTTP server to enforce them). Pick a backend that does — s3, r2, minio, or tigris — and pass its env vars (same shape as the other examples).

```sh
# Example: against AWS S3 (bucket must already exist + have CORS configured)
EXAMPLE_ADAPTER=s3 \
EXAMPLE_BUCKET=my-bucket \
EXAMPLE_REGION=us-east-1 \
EXAMPLE_ACCESS_KEY_ID=... \
EXAMPLE_SECRET_ACCESS_KEY=... \
pnpm --filter @storagesdk/examples browser-upload
```

Open http://localhost:3000, pick a file (≤ 5 MB), click Upload.

The full env-var matrix is in [`../README.md`](../README.md).

## CORS

The browser POSTs directly to the storage backend, so the bucket has to allow the origin running the form. On AWS S3, add a CORS rule like:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": []
  }
]
```

R2, MinIO, and Tigris each have their own CORS configuration story — see their docs.

## What it shows

`server.uploadUrl(key, { maxSize, contentType })` returns `{ method: 'POST', url, fields }` from the storage backend's POST-policy API. The HTML page:

1. `GET /upload-url?key=…` → server returns `{ method, url, fields }`.
2. Build a `FormData`: append every `fields[name]` as a hidden field, then append the chosen `file` last.
3. `fetch(url, { method: 'POST', body: form })` → uploads directly to the backend.
4. `GET /verify?key=…` → server uses `storage.head(key)` to confirm the upload landed.

The server enforces the policy through storagesdk: `maxSize: 5 MB` caps the upload, `contentType` is baked into the policy so the browser can't upload an arbitrary type.
