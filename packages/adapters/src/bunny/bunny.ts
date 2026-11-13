import {
  type Adapter,
  type BodyInput,
  bodyToBytes,
  checkSignal,
  defineAdapter,
  isInternalKey,
  type ListOptions,
  type ListResult,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
} from '@storagesdk/core/adapter';
import { asStorageError, BunnyHttpError } from './errors.js';
import { siblings } from './siblings.js';

/**
 * Primary storage region of a Bunny storage zone. The `de` (Falkenstein)
 * region is served from the bare `storage.bunnycdn.com` host; every other
 * region prefixes the host with its code.
 */
export type BunnyRegion =
  | 'de'
  | 'uk'
  | 'ny'
  | 'la'
  | 'sg'
  | 'se'
  | 'br'
  | 'jh'
  | 'syd';

const REGION_HOSTS: Readonly<Record<BunnyRegion, string>> = {
  de: 'storage.bunnycdn.com',
  uk: 'uk.storage.bunnycdn.com',
  ny: 'ny.storage.bunnycdn.com',
  la: 'la.storage.bunnycdn.com',
  sg: 'sg.storage.bunnycdn.com',
  se: 'se.storage.bunnycdn.com',
  br: 'br.storage.bunnycdn.com',
  jh: 'jh.storage.bunnycdn.com',
  syd: 'syd.storage.bunnycdn.com',
};

export interface BunnyConfig {
  /**
   * Storage zone name — the Bunny resource the credentials authorize. It
   * is the first path segment of every Edge Storage request.
   */
  zone: string;
  /**
   * Logical bucket name. A Bunny storage zone is one flat key namespace,
   * so the adapter maps each storagesdk "bucket" to a key prefix
   * (`<bucket>/<key>`) — multiple buckets coexist in one zone, and
   * snapshots/forks live as sibling prefixes within the same zone.
   */
  bucket: string;
  /**
   * Storage-zone password (read-write API key). Falls back to the
   * `BUNNY_STORAGE_ACCESS_KEY` env var. This is the per-zone password from
   * the Bunny dashboard, not the account-level API key.
   */
  accessKey?: string;
  /** Primary storage region. Defaults to `de` (Falkenstein). */
  region?: BunnyRegion;
  /**
   * Override the storage endpoint origin entirely (e.g. a local mock or a
   * region not in {@link BunnyRegion}). Takes precedence over `region`.
   * No trailing slash.
   */
  endpoint?: string;
  /**
   * Pull-zone hostname for public file URLs, e.g. `myzone.b-cdn.net` or a
   * custom domain. Bunny Edge Storage has no presigned-URL concept; public
   * reads are served by a linked Pull Zone. When set, `url()` returns the
   * CDN URL; when omitted, `url()` falls back to the (auth-required)
   * storage URL.
   */
  pullZone?: string;
}

/**
 * Resolved connection settings exposed via `storage.raw` so consumers can
 * issue their own Bunny Edge Storage requests without re-deriving the host
 * and credentials.
 */
export interface BunnyRaw {
  /** Storage endpoint origin, e.g. `https://storage.bunnycdn.com`. */
  readonly endpoint: string;
  /** Storage zone name. */
  readonly zone: string;
  /** Storage-zone password the adapter authenticates with. */
  readonly accessKey: string;
  /** Pull-zone host for public URLs, when configured. */
  readonly pullZone?: string;
}

/** Internal request context shared by every (sub-)impl of one adapter. */
interface Ctx {
  readonly raw: BunnyRaw;
  readonly host: string;
  readonly zone: string;
  readonly accessKey: string;
  readonly pullZone?: string;
}

/** One entry from a Bunny directory listing / DESCRIBE response. */
interface BunnyObject {
  ObjectName: string;
  Length: number;
  LastChanged: string;
  IsDirectory: boolean;
  ContentType: string;
  Checksum: string | null;
}

/**
 * Adapter for Bunny Edge Storage.
 *
 * Implemented directly against the Edge Storage HTTP API (`fetch`, no SDK
 * dependency): `PUT`/`GET`/`DELETE` for objects, a `DESCRIBE` request for
 * `head`, and trailing-slash `GET` for directory listings. A Bunny storage
 * zone is a single flat namespace, so the adapter maps each storagesdk
 * bucket to a key prefix; snapshots live at `<bucket>-snapshot-<id>/` and
 * forks at `<forkName>/`, each carrying its own
 * `.storagesdk.metadata.json` manifest — the sibling-prefix convention
 * shared with the Vercel Blob adapter.
 *
 * **Gaps** (see the adapter compat matrix): Bunny has no user-metadata
 * field, so `upload`'s `metadata` is dropped; there is no presigned upload
 * URL (`uploadUrl` throws `NotSupported`); and there is no server-side
 * copy, so `copy`/`move` and snapshot/fork seeding stream bytes through
 * the client (O(bytes), not O(metadata)).
 */
export function bunny(config: BunnyConfig): Adapter<BunnyRaw> {
  const accessKey =
    config.accessKey ??
    (typeof process !== 'undefined'
      ? process.env.BUNNY_STORAGE_ACCESS_KEY
      : undefined);
  if (!accessKey) {
    throw new StorageError({
      code: 'InvalidArgument',
      message:
        'bunny adapter: accessKey is required (pass config.accessKey or set BUNNY_STORAGE_ACCESS_KEY)',
    });
  }
  const host = (
    config.endpoint ?? `https://${REGION_HOSTS[config.region ?? 'de']}`
  ).replace(/\/$/, '');
  const raw: BunnyRaw = {
    endpoint: host,
    zone: config.zone,
    accessKey,
    ...(config.pullZone !== undefined ? { pullZone: config.pullZone } : {}),
  };
  const ctx: Ctx = {
    raw,
    host,
    zone: config.zone,
    accessKey,
    ...(config.pullZone !== undefined ? { pullZone: config.pullZone } : {}),
  };
  return defineAdapter<BunnyRaw>(impl(ctx, config.bucket));
}

/** Encode a slash-delimited key per segment, preserving a trailing slash. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Compose a logical-bucket key into a zone-relative key. */
const bucketKey = (bucket: string, key: string): string => `${bucket}/${key}`;

/** Full object URL for a zone-relative key. */
const objUrl = (ctx: Ctx, zoneKey: string): string =>
  `${ctx.host}/${ctx.zone}/${encodePath(zoneKey)}`;

const authHeaders = (ctx: Ctx): Record<string, string> => ({
  AccessKey: ctx.accessKey,
});

/** GET one directory level. Returns `[]` for a not-yet-existing folder. */
async function listDir(
  ctx: Ctx,
  zoneDir: string,
  signal: AbortSignal | undefined
): Promise<BunnyObject[]> {
  const res = await fetch(`${ctx.host}/${ctx.zone}/${encodePath(zoneDir)}`, {
    method: 'GET',
    headers: { ...authHeaders(ctx), Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new BunnyHttpError(
      res.status,
      `bunny: list ${zoneDir} (${res.status})`
    );
  }
  return (await res.json()) as BunnyObject[];
}

/** Fetch the bytes + content type of a zone-relative key (no range). */
async function getBytes(
  ctx: Ctx,
  zoneKey: string,
  signal: AbortSignal | undefined
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  const res = await fetch(objUrl(ctx, zoneKey), {
    method: 'GET',
    headers: authHeaders(ctx),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    throw new BunnyHttpError(
      res.status,
      `bunny: get ${zoneKey} (${res.status})`
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType =
    res.headers.get('content-type')?.split(';')[0]?.trim() ||
    'application/octet-stream';
  return { bytes, contentType };
}

/** PUT bytes to a zone-relative key. Bunny auto-creates parent folders. */
async function putBytes(
  ctx: Ctx,
  zoneKey: string,
  bytes: Uint8Array,
  contentType: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const res = await fetch(objUrl(ctx, zoneKey), {
    method: 'PUT',
    headers: {
      ...authHeaders(ctx),
      // Bunny stores the literal Content-Type unless an override is given;
      // mirror the official SDK's convention of declaring octet-stream and
      // overriding to the real type.
      'Content-Type': 'application/octet-stream',
      'Override-Content-Type': contentType,
    },
    body: bytes,
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    throw new BunnyHttpError(
      res.status,
      `bunny: put ${zoneKey} (${res.status})`
    );
  }
}

/** DELETE a zone-relative key. 404 is a no-op (matches S3/fs). */
async function deleteKey(
  ctx: Ctx,
  zoneKey: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const res = await fetch(objUrl(ctx, zoneKey), {
    method: 'DELETE',
    headers: authHeaders(ctx),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok && res.status !== 404) {
    throw new BunnyHttpError(
      res.status,
      `bunny: delete ${zoneKey} (${res.status})`
    );
  }
}

/**
 * Recursively delete a sibling prefix. Bunny's DELETE on a trailing-slash
 * path removes the directory and everything under it in one call.
 * Best-effort: used for snapshot/fork teardown and create-failure rollback.
 */
async function destroySibling(
  ctx: Ctx,
  prefix: string,
  signal: AbortSignal | undefined
): Promise<void> {
  try {
    await fetch(`${ctx.host}/${ctx.zone}/${encodePath(`${prefix}/`)}`, {
      method: 'DELETE',
      headers: authHeaders(ctx),
      ...(signal ? { signal } : {}),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Copy every object under `fromBucket` to `toBucket`, streaming bytes
 * through the client (Bunny has no server-side copy). Walks the source one
 * directory level at a time and skips the manifest — the destination
 * writes its own.
 */
async function copyAllBlobs(
  ctx: Ctx,
  fromBucket: string,
  toBucket: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const base = `${fromBucket}/`;
  const stack: string[] = [base];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    const entries = await listDir(ctx, dir, signal);
    for (const e of entries) {
      if (e.IsDirectory) {
        stack.push(`${dir}${e.ObjectName}/`);
        continue;
      }
      const zoneKey = `${dir}${e.ObjectName}`;
      const relative = zoneKey.slice(base.length);
      if (isInternalKey(relative)) continue;
      const { bytes, contentType } = await getBytes(ctx, zoneKey, signal);
      await putBytes(
        ctx,
        `${toBucket}/${relative}`,
        bytes,
        contentType,
        signal
      );
    }
  }
}

function impl(ctx: Ctx, bucketName: string): Adapter<BunnyRaw> {
  const zoneKeyOf = (key: string): string => bucketKey(bucketName, key);

  const objectToMeta = (obj: BunnyObject, key: string): StorageItemMeta => ({
    path: key,
    size: obj.Length ?? 0,
    contentType: obj.ContentType || 'application/octet-stream',
    etag: obj.Checksum ?? '',
    lastModified: obj.LastChanged ? new Date(obj.LastChanged) : new Date(0),
  });

  /** Walk every object under this bucket prefix, keyed relative to it. */
  const walkKeys = async (
    signal: AbortSignal | undefined
  ): Promise<Array<{ key: string; obj: BunnyObject }>> => {
    const base = `${bucketName}/`;
    const out: Array<{ key: string; obj: BunnyObject }> = [];
    const stack: string[] = [base];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      const entries = await listDir(ctx, dir, signal);
      for (const e of entries) {
        if (e.IsDirectory) {
          stack.push(`${dir}${e.ObjectName}/`);
        } else {
          out.push({ key: `${dir}${e.ObjectName}`.slice(base.length), obj: e });
        }
      }
    }
    return out;
  };

  const doDownload = async (
    key: string,
    opts:
      | { signal?: AbortSignal; range?: { offset: number; length: number } }
      | undefined
  ): Promise<StorageItem> => {
    const rangeHeader =
      opts?.range !== undefined
        ? {
            Range: `bytes=${opts.range.offset}-${opts.range.offset + opts.range.length - 1}`,
          }
        : undefined;
    const res = await fetch(objUrl(ctx, zoneKeyOf(key)), {
      method: 'GET',
      headers: { ...authHeaders(ctx), ...(rangeHeader ?? {}) },
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    if (!res.ok) {
      throw new BunnyHttpError(
        res.status,
        `bunny: download ${key} (${res.status})`
      );
    }
    let body = new Uint8Array(await res.arrayBuffer());
    if (opts?.range && res.status !== 206) {
      // Server ignored Range and returned the whole object — slice locally.
      const { offset, length } = opts.range;
      body = sliceBytes(body, offset, offset + length);
    }
    const contentType =
      res.headers.get('content-type')?.split(';')[0]?.trim() ||
      'application/octet-stream';
    const lastMod = res.headers.get('last-modified');
    return {
      path: key,
      size: body.byteLength,
      contentType,
      etag: res.headers.get('etag') ?? '',
      lastModified: lastMod ? new Date(lastMod) : new Date(0),
      body,
    };
  };

  return {
    name: 'bunny',
    raw: ctx.raw,

    async upload(
      key: string,
      body: BodyInput,
      opts?: UploadOptions
    ): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      // Bunny has no user-metadata field; `opts.metadata` is dropped
      // (documented in the compat matrix).
      const bytes = await bodyToBytes(body);
      const contentType = opts?.contentType ?? 'application/octet-stream';
      try {
        await putBytes(ctx, zoneKeyOf(key), bytes, contentType, opts?.signal);
        // Bunny's PUT response carries no object metadata; synthesize from
        // inputs. `head`/`download` return the server's etag + mtime later.
        return {
          path: key,
          size: bytes.byteLength,
          contentType,
          etag: '',
          lastModified: new Date(),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      try {
        return await doDownload(key, opts);
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      try {
        // Bunny exposes per-object metadata via a `DESCRIBE` request on the
        // object path — no parent listing required.
        const res = await fetch(objUrl(ctx, zoneKeyOf(key)), {
          method: 'DESCRIBE',
          headers: { ...authHeaders(ctx), Accept: 'application/json' },
          ...(opts?.signal ? { signal: opts.signal } : {}),
        });
        if (!res.ok) {
          throw new BunnyHttpError(
            res.status,
            `bunny: head ${key} (${res.status})`
          );
        }
        const obj = (await res.json()) as BunnyObject;
        if (obj.IsDirectory) {
          throw new StorageError({
            code: 'NotFound',
            message: `bunny adapter: ${key} is a directory`,
          });
        }
        return objectToMeta(obj, key);
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const prefix = opts?.prefix ?? '';
      const limit = opts?.limit ?? 1000;
      const cursor = opts?.cursor ?? '';
      try {
        const all = await walkKeys(opts?.signal);
        const matching = all
          .filter(
            ({ key }) =>
              !isInternalKey(key) && key.startsWith(prefix) && key > cursor
          )
          .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const page = matching.slice(0, limit);
        const items = page.map(({ key, obj }) => objectToMeta(obj, key));
        const hasMore = matching.length > limit;
        const last = page[page.length - 1];
        return hasMore && last !== undefined
          ? { items, cursor: last.key }
          : { items };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        await deleteKey(ctx, zoneKeyOf(key), opts?.signal);
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      // No server-side copy on Bunny — download the source and re-upload.
      try {
        const { bytes, contentType } = await getBytes(
          ctx,
          zoneKeyOf(from),
          opts?.signal
        );
        await putBytes(ctx, zoneKeyOf(to), bytes, contentType, opts?.signal);
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      // copy + delete. Not atomic — a failure after the copy may leave both
      // keys present. Matches the documented contract.
      try {
        const { bytes, contentType } = await getBytes(
          ctx,
          zoneKeyOf(from),
          opts?.signal
        );
        await putBytes(ctx, zoneKeyOf(to), bytes, contentType, opts?.signal);
        await deleteKey(ctx, zoneKeyOf(from), opts?.signal);
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      const zoneKey = zoneKeyOf(key);
      // Public access is served by a linked Pull Zone. With one configured
      // the CDN URL is publicly fetchable; without it we return the storage
      // URL, which requires the `AccessKey` header to fetch (not public).
      if (ctx.pullZone) {
        return `https://${ctx.pullZone}/${encodePath(zoneKey)}`;
      }
      return objUrl(ctx, zoneKey);
    },

    async uploadUrl(_key, _opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      throw new StorageError({
        code: 'NotSupported',
        message:
          'bunny adapter: uploadUrl is not supported (Bunny Edge Storage has no presigned upload URL).',
      });
    },

    ...siblings<BunnyRaw>(
      {
        at: (bucket) => impl(ctx, bucket),
        copyAll: (from, to, signal) => copyAllBlobs(ctx, from, to, signal),
        destroy: (prefix, signal) => destroySibling(ctx, prefix, signal),
        asStorageError,
      },
      bucketName
    ),
  };
}

/** Copy a byte slice into a fresh `ArrayBuffer`-backed `Uint8Array`. */
function sliceBytes(
  u8: Uint8Array,
  start: number,
  end: number
): Uint8Array<ArrayBuffer> {
  const len = Math.max(0, Math.min(end, u8.byteLength) - start);
  const out = new Uint8Array(new ArrayBuffer(len));
  out.set(u8.subarray(start, start + len));
  return out;
}
