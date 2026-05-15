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

The SDK has two layers:

- **`Storage`** — the class consumers use. Wraps a full `Adapter`, exposes the overloaded `download` (with `as: 'stream' | 'text' | 'bytes' | 'blob' | 'json'`), writes, and the `snapshots` and `forks` namespaces. Extends `ReadOnlyStorage`.
- **`ReadOnlyStorage`** — what `storage.snapshots.get(id)` returns. Same overloaded `download` as `Storage`, plus the other three read methods. Exported as a **type only** from `@storagesdk/core`; consumers don't construct it directly.
- **`Adapter`** and **`ReadOnlyAdapter`** — the contracts adapter authors implement. `ReadOnlyAdapter` has the four read methods; `Adapter` extends it with writes plus two namespace properties typed as `AdapterSnapshots` and `AdapterForks`. Decoupled from `Storage` / `ReadOnlyStorage` so each layer can evolve independently.
- **`AdapterSnapshots`** and **`AdapterForks`** — the namespace contracts, exported so adapter authors can implement and unit-test them in isolation. Both have the same five methods (`create`, `list`, `head`, `delete`, `get`).

Snapshots and forks are exposed through symmetric namespaces: both `storage.snapshots` and `storage.forks` have the same five methods (`create`, `list`, `head`, `delete`, `get`).

### Packaging

The SDK ships under the `@storagesdk` npm scope as separate packages:

- `@storagesdk/core` — the consumer entry. `Storage`, `StorageError`, and the types end-user code handles.
- `@storagesdk/core/adapter` — the adapter-authoring entry. Re-exports the consumer entry plus `defineAdapter`, the `Adapter` contract types (`Adapter`, `ReadOnlyAdapter`, `AdapterSnapshots`, `AdapterForks`), the `Manifest` helpers, and `toWebStream`. Adapter packages import from here.
- `@storagesdk/adapters` — every backend adapter, accessed via subpath. Each backend's SDK is an optional peer dependency: install it only if you import that adapter.
  - `@storagesdk/adapters/fs` — filesystem adapter. Primarily for local development and tests. Takes `{ root, folder }`; snapshots and forks land as sibling folders under `root`. Sidecar files preserve per-object `contentType` and `metadata`. `url()`/`uploadUrl()` return `file://` URLs.
  - Future subpaths: `/s3`, `/r2`, `/gcs`, `/azure`, `/tigris`.

Each adapter package depends on `@storagesdk/core` and the provider's own SDK. You install only the adapters you use.

### Construction

```ts
import { Storage } from "@storagesdk/core";
import { s3 } from "@storagesdk/adapters/s3";
// or: import { tigris } from "@storagesdk/adapters/tigris";

const storage = new Storage({ adapter: s3({ bucket: "photos" }) });
```

The adapter is passed in at construction. The storage location — bucket, folder, prefix — is the adapter's concern. The public API doesn't use the word `bucket`.

### Paths

Paths passed to any method are normalized inside `defineAdapter` before reaching the adapter implementation:

- Leading slashes are stripped — `/photo.jpg` and `photo.jpg` are equivalent.
- Empty paths (after stripping) throw `StorageError` with code `InvalidArgument`.

Adapter implementations always receive normalized paths and don't have to defensively handle these cases. Authors who construct an `Adapter` object literal without calling `defineAdapter` are responsible for normalization themselves.

### Object operations

```ts
await storage.upload("photo.jpg", blob, { contentType: "image/jpeg" }); // StorageItemMeta
await storage.download("photo.jpg"); // StorageItem (metadata + body)
await storage.download("photo.jpg", { as: "text" }); // string
await storage.download("photo.jpg", { as: "stream" }); // ReadableStream<Uint8Array>
await storage.head("photo.jpg"); // StorageItemMeta (no body)
await storage.list({ prefix: "photos/", limit: 100 }); // { items: StorageItemMeta[], cursor? }
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

### Item shapes

Two related types model objects:

```ts
// Returned by `head` and items inside `list`.
interface StorageItemMeta {
  readonly path: string;
  readonly size: number;
  readonly contentType: string;
  readonly etag: string;
  readonly lastModified: Date;
  readonly metadata?: Readonly<Record<string, string>>;
}

// Returned by `download`. Same metadata, plus the raw bytes.
interface StorageItem extends StorageItemMeta {
  readonly body: Uint8Array;
}
```

`StorageItemMeta` is the lightweight type — no body, no accessors, no closures. `list` returns an array of these directly; pulling a list result does not buffer object bodies.

`StorageItem` adds a single `body: Uint8Array` field. Adapter authors return `{ ...meta, body: bytes }` from `download`. Consumers either read `item.body` directly or use the `as` overloads on `Storage.download` for typed access (see below).

### Downloads with `as`

`download` is overloaded. The default returns the full `StorageItem`. Pass `as` to get a typed body in the shape you want:

```ts
await storage.download("photo.jpg");                     // StorageItem
await storage.download("photo.jpg", { as: "stream" });   // ReadableStream<Uint8Array>
await storage.download("photo.jpg", { as: "text" });     // string
await storage.download("photo.jpg", { as: "bytes" });    // Uint8Array
await storage.download("photo.jpg", { as: "blob" });     // Blob
await storage.download("config.json", { as: "json" });   // unknown (cast at the callsite)
```

Streams are always Web `ReadableStream` — in browsers, in Node 20+, in Cloudflare Workers, Deno, and Bun. Adapters whose underlying SDK returns a Node `Readable` use `Readable.toWeb()` internally so there's one stream type wherever your code runs.

If you need a Node `Readable` (e.g., to use with `pipeline()`), convert at the callsite:

```ts
import { Readable } from "node:stream";
const node = Readable.fromWeb(
  await storage.download("video.mp4", { as: "stream" }),
);
```

The SDK requires Node 20 or newer.

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

A snapshot is a read-only view of the storage at a point in time. The `snapshots` namespace has five methods:

```ts
storage.snapshots.create(opts?): Promise<SnapshotInfo>;        // returns metadata for the new snapshot
storage.snapshots.list():        Promise<SnapshotInfo[]>;
storage.snapshots.head(id):      Promise<SnapshotInfo>;        // metadata only
storage.snapshots.delete(id):    Promise<void>;
storage.snapshots.get(id):       ReadOnlyStorage;              // a reader bound to the snapshot
```

Typical use:

```ts
const info = await storage.snapshots.create({ name: "pre-migration" });
db.save(info.id);

// Read at the snapshot — the reader has the same overloaded download as Storage
const reader = storage.snapshots.get(info.id);
const text = await reader.download("photo.jpg", { as: "text" });
const items = (await reader.list({ prefix: "photos/" })).items;
```

`SnapshotInfo` is `{ id, name?, createdAt }` — lightweight, returned by `create`, `head`, and items inside `list`. To use the snapshot's contents, call `get(id)` and read through the returned `ReadOnlyStorage`.

### Forks

A fork is a new writable storage seeded from a snapshot. The `forks` namespace mirrors `snapshots` exactly:

```ts
storage.forks.create(opts):  Promise<ForkInfo>;                // returns metadata for the new fork
storage.forks.list():        Promise<ForkInfo[]>;
storage.forks.head(name):    Promise<ForkInfo>;
storage.forks.delete(name):  Promise<void>;                    // destructive — removes the forked storage
storage.forks.get(name):     Storage;                          // full read-write storage bound to the fork
```

Typical use:

```ts
const info = await storage.forks.create({
  name: "photos-exp",
  fromSnapshot: snap.id,
  onProgress: ({ copied, total }) => { /* ... */ },
  signal: controller.signal,
});

const fork = storage.forks.get(info.name);   // Storage instance
await fork.upload("new.jpg", blob);
```

`ForkInfo` is `{ name, fromSnapshot, createdAt }`. The fork's `name` is user-provided (you pass it on `create`) and is the identifier you use to look it up later. `forks.get(name)` returns a `Storage` so the full read/write surface — including its own nested `snapshots` and `forks` namespaces — is available.

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

Codes: `NotFound`, `NotSupported`, `Conflict`, `Unauthorized`, `InvalidArgument`, `Provider`.

### Escape hatch

Every adapter exposes its underlying native client (or whatever internal state it wants to surface) through `storage.raw`. The type flows through the adapter's `Raw` generic — adapters that declare `Adapter<S3Client>` give consumers `storage.raw` typed as `S3Client` without a cast.

```ts
const storage = new Storage({ adapter: s3({ bucket: "photos" }) });
//    ↑ inferred as Storage<S3Client> because s3() returns Adapter<S3Client>

storage.raw; // S3Client
```

`Storage`, `StorageOptions`, `Adapter`, `AdapterForks`, and `defineAdapter` all carry a `Raw` type parameter that defaults to `unknown`. Adapter authors who don't bother narrowing it get the old `raw: unknown` behavior. `forks.get(name)` returns `Storage<Raw>` so the typed escape hatch survives through fork navigation.

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

`Adapter` extends a smaller `ReadOnlyAdapter` interface (the four read methods). The full contract adds writes plus two namespace properties: `snapshots: AdapterSnapshots` and `forks: AdapterForks`. Each namespace exposes five methods. `AdapterSnapshots` and `AdapterForks` are exported alongside `Adapter` so authors can implement (and test) them in isolation.

Adapters are written through a single factory function, `defineAdapter`:

```ts
import { defineAdapter } from "@storagesdk/core/adapter";

export function myProvider(config: MyConfig) {
  const client = new MyClient(config);

  return defineAdapter({
    name: "my-provider",
    raw: client,

    async upload(path, body, opts) {
      return client.put(path, body, opts); // returns StorageItemMeta
    },
    async download(path, opts) {
      const { meta, bytes } = await client.get(path, opts);
      return { ...meta, body: bytes }; // StorageItem
    },
    async head(path) {
      return client.head(path); // StorageItemMeta
    },
    async list(opts) {
      return client.list(opts); // { items: StorageItemMeta[], cursor? }
    },
    async delete(path) {
      return client.delete(path);
    },
    async copy(from, to) {
      return client.copy(from, to);
    },
    async move(from, to) {
      return client.move(from, to);
    },
    async uploadUrl(path, opts) {
      return client.sign("PUT", path, opts);
    },
    async url(path, opts) {
      return client.sign("GET", path, opts);
    },

    snapshots: { /* ... see below ... */ },
    forks:     { /* ... see below ... */ },
  });
}
```

`defineAdapter` wraps every path-taking method with normalization, normalizes paths on readers returned by `snapshots.get`, and recursively re-wraps adapters returned by `forks.get`.

### `snapshots` namespace

Five methods. `create` and `head` return `SnapshotInfo`; `get(id)` returns a `ReadOnlyAdapter` (the four read methods bound to the snapshot).

```ts
snapshots: {
  async create(opts) {
    return client.createSnapshot(opts);            // SnapshotInfo
  },
  async list() {
    return client.listSnapshots();                  // SnapshotInfo[]
  },
  async head(id) {
    return client.getSnapshot(id);                  // SnapshotInfo
  },
  async delete(id) {
    return client.deleteSnapshot(id);
  },
  get(id) {
    // Sync — returns a reader bound to `id`. No I/O until a method is called.
    return {
      download: (path) => client.get(path, { snapshotVersion: id }),
      head:     (path) => client.head(path, { snapshotVersion: id }),
      list:     (opts) => client.list({ ...opts, snapshotVersion: id }),
      url:      (path, opts) =>
        client.sign("GET", path, { snapshotVersion: id, ...opts }),
    };
  },
},
```

### `forks` namespace

Same shape. `create` and `head` return `ForkInfo`; `get(name)` returns an `Adapter` (the new forked storage, with full read/write capabilities and its own nested namespaces).

```ts
forks: {
  async create(opts) {
    const b = await client.createBucket({
      sourceBucketName: config.bucket,
      sourceBucketSnapshot: opts.fromSnapshot,
      name: opts.name,
    });
    return {
      name: opts.name,
      fromSnapshot: opts.fromSnapshot,
      createdAt: b.createdAt,
    };
  },
  async list() {
    return client.listForks(config.bucket);         // ForkInfo[]
  },
  async head(name) {
    return client.getForkInfo(name);                // ForkInfo
  },
  async delete(name) {
    return client.deleteBucket(name);
  },
  get(name) {
    // Sync — returns a fresh Adapter pointing at the forked bucket.
    return myProvider({ ...config, bucket: name });
  },
},
```

## Snapshot and fork convention

`snapshots` and `forks` are required on every adapter — there is no SDK-level polyfill. Authors who can't support either feature throw `StorageError` with code `NotSupported` from each method.

For copy-based implementations (i.e., everything that isn't a provider with native snapshot or fork APIs), the SDK defines a convention that all such adapters follow. The pattern is simple enough to inline inside each adapter, and the few SDK-defined pieces — the on-disk manifest format and the snapshot-naming scheme — ship as helpers from `@storagesdk/core/adapter`.

### Each snapshot and fork is a sibling location

A snapshot is a new sibling location (a new bucket for S3-style adapters, a new folder for the filesystem adapter) into which the source's entries are copied. A fork is the same thing, but seeded from a snapshot's contents rather than from the live parent. Snapshot locations are read-only; fork locations are full read-write storage.

Costs are explicit: every snapshot duplicates storage, and every snapshot/fork shares the parent's region, lifecycle policy, and billing line (because it lives in the same account / on the same filesystem). Adapters that need cheaper isolation (separate buckets per fork, S3 versioning, etc.) implement `snapshots` and `forks` natively and skip this convention entirely.

### Naming

- **Snapshots:** `<parent-location>-snapshot-<nanoseconds>`. SDK-generated via `nextSnapshotId(parentLocation)`. The id doubles as the sibling location's name — looking up a snapshot is looking up that location.
- **Forks:** user-provided `name` on `forks.create({ name })`. The name is the sibling location's name. `forks.create` throws `Conflict` if a location with that name already exists.

### Manifest at each location

Every SDK-managed location carries a `.storagesdk.metadata.json` at its root. The shape is uniform across top-level / snapshot / fork locations:

```ts
interface Manifest {
  version: 1;
  parent: { location: string; snapshotId: string | null } | null;
  snapshots: SnapshotInfo[];
  forks: ForkInfo[];
}
```

- `version` discriminates the schema generation. `readManifest` rejects a manifest whose version it doesn't recognize, so future schema changes won't be silently misread by older SDK versions. v1 is the only version today; when we evolve the schema we bump and add a migration branch.
- `parent` is `null` for top-level locations, `{ location, snapshotId: null }` for a snapshot, `{ location, snapshotId }` for a fork.
- `snapshots` and `forks` are this location's descendants. They populate as the location spawns new snapshots/forks; for a snapshot location they stay empty forever.

`snapshots.list()` and `forks.list()` read this file. `snapshots.create` / `forks.create` append to it; `snapshots.delete` / `forks.delete` remove from it. `snapshots.head(id)` and `forks.head(name)` look up by id/name in the arrays.

The SDK exports four helpers for this convention from the adapter entry:

```ts
import {
  type Manifest,
  emptyManifest,    // fresh value for a new location
  readManifest,     // reads .storagesdk.metadata.json, returns empty default if missing
  writeManifest,    // writes .storagesdk.metadata.json
  nextSnapshotId,   // generates the next snapshot id for a parent location
} from '@storagesdk/core/adapter';
```

These own the SDK-defined format and naming convention; the rest — how to actually create a sibling location, how to copy entries, how to clean up — is the adapter's job.

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
