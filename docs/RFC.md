# RFC: storagesdk — one API across object storage providers, with fork and snapshot built in

**Status:** Draft
**Date:** 2026-05-13

## Summary

`storagesdk` is a TypeScript SDK with one API across object storage providers. It supports the usual operations — upload, download, list, delete, copy, move, signed URLs — and adds two: **snapshot** (a read-only view of the storage at a point in time) and **fork** (a new writable copy seeded from a snapshot).

The SDK ships adapters for several providers. Every shipped adapter supports every operation, either through the provider's native APIs or through a default implementation the SDK provides.

## Background

Two existing projects motivate this design.

- **files-sdk** (`files-sdk.dev`) is an SDK with around 18 adapters that works across many file backends. It has 8 methods (upload, download, head, list, delete, copy, url, signed upload URL) and treats the storage container as invisible: the adapter is configured with credentials and a location, and the API only deals with keys. It does not model snapshot or fork.
- **@tigrisdata/storage** is a Tigris-specific SDK with a richer API, including bucket lifecycle, snapshot, fork, regions, and tiers. The API is Tigris-flavored and not portable to other providers.

There is a gap between them: an SDK that works across providers and also ships snapshot and fork as built-in operations, instead of leaving them to provider-specific escape hatches.

## Goals

- One API that behaves the same across providers for every operation the SDK supports.
- Snapshot and fork are built-in operations, not optional add-ons.
- The adapter contract is small enough that a third-party developer can write a new adapter in a few hours.
- Long-running operations report progress through callbacks. There are no capability flags for user code to check at runtime.

## Non-goals

- Provider-specific configuration that doesn't generalize cleanly across providers: bucket CORS, lifecycle policies, ACLs, region and tier selection. These stay available through the `raw` escape hatch and may be added later if a cross-provider shape becomes clear.
- Consumer file-sync services (Google Drive, Dropbox, OneDrive, Box) in v1. Bulk snapshot and fork on these would be slow and expensive.
- Result-type return values (`{ data, error }`). The SDK throws.

## Public API

The SDK has one main class, `Storage`, and one read-only sibling, `Snapshot`.

### Packaging

The SDK ships under the `@storagesdk` npm scope as separate packages:

- `@storagesdk/core` — the `Storage` class, `Snapshot`, `defineAdapter`, `StorageError`, types, and shared helpers.
- `@storagesdk/<adapter>` — one package per adapter, e.g., `@storagesdk/s3`, `@storagesdk/r2`, `@storagesdk/gcs`, `@storagesdk/azure`, `@storagesdk/tigris`, `@storagesdk/fs`.

Each adapter package depends on `@storagesdk/core` and the provider's own SDK. You install only the adapters you use.

### Construction

```ts
import { Storage } from "@storagesdk/core";
import { s3 } from "@storagesdk/s3";
// or: import { tigris } from "@storagesdk/tigris";

const storage = new Storage({ adapter: s3({ bucket: "photos" }) });
```

The adapter is passed in at construction. The storage location — bucket, folder, prefix — is the adapter's concern. The public API doesn't use the word `bucket`.

### Paths

Paths passed to any method are normalized at the `Storage` layer before reaching the adapter:

- Leading slashes are stripped — `/photo.jpg` and `photo.jpg` are equivalent.
- Empty paths (after stripping) throw `StorageError`.

Adapters always receive normalized paths and don't have to defensively handle these cases.

### Object operations

```ts
await storage.upload("photo.jpg", blob, { contentType: "image/jpeg" });
await storage.download("photo.jpg"); // StorageItem with body ready
await storage.download("photo.jpg", { as: "stream" }); // ReadableStream
await storage.head("photo.jpg"); // StorageItem with metadata; body is lazy
await storage.list({ prefix: "photos/", limit: 100 }); // { items: StorageItem[], cursor? }
await storage.delete("photo.jpg");
await storage.copy("a.jpg", "b.jpg");
await storage.move("a.jpg", "b.jpg");
```

For large uploads, pass `multipart: true`. The SDK splits the body into parts and uploads them in parallel:

```ts
await storage.upload("large.mp4", stream, {
  multipart: true,
  partSize: 8 * 1024 * 1024, // optional, defaults to 5 MB
  concurrency: 4, // optional, defaults to 4
  onProgress: ({ loaded, total }) => {
    /* ... */
  },
  signal: controller.signal,
});
```

Adapters without a native multipart API fall back to a single PUT and ignore the multipart options. Per-adapter behavior is in each adapter's docs.

### The `StorageItem` shape

`download`, `head`, and the items returned from `list` all share the same shape:

```ts
interface StorageItem {
  readonly path: string;
  readonly size: number;
  readonly contentType: string;
  readonly etag: string;
  readonly lastModified: Date;
  readonly metadata?: Readonly<Record<string, string>>;

  // Body accessors — call any one.
  blob(): Promise<Blob>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  bytes(): Promise<Uint8Array>;
  stream(): ReadableStream;
}
```

After `download`, the body is fetched and the accessors return it. After `head` or `list`, the body isn't fetched until you call an accessor; calling one then issues a download for that single item. One shape covers all three operations — you don't have to think about which response you got back.

### Streaming downloads

`download` returns a `StorageItem` with the body fetched and ready. Pass `{ as: "stream" }` to get a `ReadableStream` instead:

```ts
const stream = await storage.download("video.mp4", { as: "stream" });
```

The stream is always a Web `ReadableStream` — in browsers, in Node 20+, in Cloudflare Workers, Deno, and Bun. Adapters whose underlying SDK returns a Node `Readable` use `Readable.toWeb()` to convert internally, so there's one stream type to think about wherever your code runs.

If you need a Node `Readable` (e.g., to use with `pipeline()`), convert at the callsite with the standard Node API:

```ts
import { Readable } from "node:stream";
const node = Readable.fromWeb(stream);
```

This means the SDK requires Node 20 or newer.

### URLs

```ts
await storage.url("photo.jpg");                      // a URL to read the object
await storage.url("photo.jpg", { expiresIn: 3600 }); // hint to adapters that sign

await storage.uploadUrl("photo.jpg", {
  expiresIn: 3600,
  maxSize: 10_000_000,
});
```

`url()` returns whatever URL the adapter produces — typically signed when the underlying object needs authentication, plain when the adapter is configured for public access. Options like `expiresIn` are hints; adapters that don't sign just ignore them.

`uploadUrl()` returns a discriminated value: either `{ method: "PUT", url, headers? }` or `{ method: "POST", url, fields }` for S3-style POST policies (used when `maxSize` is set). Uploads always need authentication, so this URL is always signed.

### Snapshots

A snapshot is a read-only view of the storage at a point in time. `snapshots.create` returns a `Snapshot` handle with the read methods only — no `upload`, no `delete`.

```ts
const snap = await storage.snapshots.create({ name: "pre-migration" });

await snap.download("photo.jpg");
await snap.head("photo.jpg");
await snap.list({ prefix: "photos/" });
await snap.url("photo.jpg", { expiresIn: 3600 });

// The handle has a serializable id
const id = snap.id;
db.save(id);

// Rehydrate later. Synchronous, no I/O.
const same = storage.snapshots.get(id);
```

`Storage` and `Snapshot` share a common interface for reads, `ReadOnlyStorage`. Read-only code can accept either.

### Fork

A fork is a new writable copy seeded from a snapshot.

```ts
const exp = await storage.fork({
  name: "photos-exp",
  fromSnapshot: snap.id,
  onProgress: ({ copied, total }) => {
    /* ... */
  },
  signal: controller.signal,
});

await exp.upload("new.jpg", blob);
```

`fork` returns a new `Storage` instance pointing at the new copy. The destination is created automatically.

### Errors

Operations throw `StorageError`. The error has a normalized `code` and the original error attached as `cause`.

```ts
try {
  await storage.download("missing.jpg");
} catch (e) {
  if (e instanceof StorageError && e.code === "NotFound") {
    /* handle */
  }
  throw e;
}
```

Codes: `NotFound`, `NotSupported`, `Conflict`, `Unauthorized`, `Provider`.

### Escape hatch

```ts
storage.raw; // the underlying native client, typed per adapter
```

### Browser uploads

For browser uploads that go directly to the provider, the SDK doesn't ship a wrapping helper. The method is `uploadUrl`: a server route asks the SDK for a signed URL, returns it to the browser, and the browser uploads to the provider directly.

```ts
// server route — written by the user, not the SDK:
import { storage } from "./storage";

export async function POST(request: Request) {
  const { path, contentType } = await request.json();

  // auth and validation are the user's call
  if (!isAllowed(path, request)) {
    return new Response("forbidden", { status: 403 });
  }

  const signed = await storage.uploadUrl(path, {
    contentType,
    maxSize: 50_000_000,
    expiresIn: 3600,
  });

  return Response.json(signed);
}
```

This keeps the SDK out of auth, completion notifications, and framework conventions, while working with any framework that speaks Web `Request`/`Response`.

## Adapter authoring

Adapters are written with a single factory function, `defineAdapter`:

```ts
import { defineAdapter } from "@storagesdk/core";

export function myProvider(config: MyConfig) {
  const client = new MyClient(config);

  return defineAdapter({
    name: "my-provider",
    raw: client,

    async upload(path, body, opts) {
      return client.put(path, body, opts);
    },
    async download(path, opts) {
      return client.get(path, opts);
    },
    async head(path) {
      return client.head(path);
    },
    async list(opts) {
      return client.list(opts);
    },
    async delete(path) {
      return client.delete(path);
    },
    async copy(from, to) {
      return client.copy(from, to);
    },
    async uploadUrl(path, opts) {
      return client.sign("PUT", path, opts);
    },
    async url(path, opts) {
      return client.sign("GET", path, opts);
    },
  });
}
```

The author supplies 8 methods, a `name`, and the native client (for `raw`). `defineAdapter` fills in default implementations of `snapshots` and `fork` on top of those 8 methods.

Providers with native snapshot or fork APIs supply their own implementations:

```ts
return defineAdapter({
  name: "tigris",
  raw: client,
  upload,
  download,
  head,
  list,
  delete: del,
  copy,
  uploadUrl,
  url,

  snapshots: {
    async create(opts) {
      return client.createSnapshot(opts);
    },
    async list() {
      return client.listSnapshots();
    },
    async delete(id) {
      return client.deleteSnapshot(id);
    },
    async download(id, path, opts) {
      return client.get(path, { snapshotVersion: id, ...opts });
    },
    async head(id, path) {
      return client.head(path, { snapshotVersion: id });
    },
    async list(id, opts) {
      return client.list({ ...opts, snapshotVersion: id });
    },
    async url(id, path, opts) {
      return client.sign("GET", path, { snapshotVersion: id, ...opts });
    },
  },

  async fork(opts) {
    const b = await client.createBucket({
      sourceBucketName: config.bucket,
      sourceBucketSnapshot: opts.fromSnapshot,
    });
    return tigris({ ...config, bucket: b.name });
  },
});
```

## Default snapshot and fork implementations

When an adapter doesn't supply native `snapshots` or `fork`, `defineAdapter` fills them in using only the 8 basic operations.

**Default snapshot.** When you create one, the SDK lists every key in the storage location, records the list (with size and etag) in a manifest object at `.snapshots/<id>.json` in the same location, and returns a handle that routes reads through that manifest. The `.snapshots/` prefix is reserved by the SDK. Creating a snapshot is O(n) in the number of objects.

**Default fork.** The SDK creates the destination (when the adapter supports it) and copies every entry from the source snapshot using the adapter's `copy` operation. Fork is O(n) in the number of objects and duplicates storage.

Both operations accept `onProgress` and an `AbortSignal`.

Providers with a cheaper path (e.g., S3 versioning) can supply their own `snapshots` and `fork` instead. We plan to ship building blocks like `s3VersioningSnapshot` that adapter authors can drop in.

## Consistency

For v1, the default snapshot is best-effort: writes that happen during the list phase may or may not be captured, and the SDK doesn't freeze writes. Adapters with native snapshot APIs (e.g., Tigris) may give stronger guarantees, documented per adapter.

A later version may add an opt-in path that uses provider versioning (e.g., S3 versioning) for stronger consistency. v1 ships best-effort.

## Adapters in v1

- S3
- R2
- MinIO
- DigitalOcean Spaces
- GCS
- Azure Blob
- Tigris (native snapshot and fork)
- Filesystem (local dev and test; hardlink-based snapshot and fork)

Not in v1: Google Drive, Dropbox, OneDrive, Box.
