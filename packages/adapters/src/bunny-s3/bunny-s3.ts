import type { S3Client } from '@aws-sdk/client-s3';
import {
  type Adapter,
  defineAdapter,
  isInternalKey,
  type StorageItemMeta,
} from '@storagesdk/core/adapter';
import { siblings } from '../bunny/siblings.js';
import { asStorageError } from '../s3/errors.js';
import { s3 } from '../s3/s3.js';

export interface BunnyS3Config {
  /**
   * Storage zone name. The zone must have been created with S3
   * compatibility turned on — it can't be enabled afterwards. On the S3
   * API the zone name is both the bucket and the access key id.
   */
  zone: string;
  /**
   * Logical bucket name. Credentials are scoped to one storage zone, so
   * the adapter can't create sibling zones for snapshots and forks.
   * Instead it maps each storagesdk "bucket" to a key prefix
   * (`<bucket>/<key>`) inside the zone, and snapshots/forks live as
   * sibling prefixes — the same layout the `bunny` adapter uses, so both
   * adapters can work on the same zone.
   */
  bucket: string;
  /**
   * Storage-zone password, used as the S3 secret access key. The zone's
   * read-only password also works for read-only use.
   */
  accessKey: string;
  /**
   * Storage region of the zone. It picks the endpoint and is the SigV4
   * signing region. Defaults to `de` (Frankfurt).
   *
   * @example `'de'`, `'uk'`, `'ny'`, `'la'`, `'sg'`, `'se'`, `'jh'`, `'syd'`
   */
  region?: string;
  /**
   * Override the endpoint URL. When unset, defaults to
   * `https://<region>-s3.storage.bunnycdn.com`.
   */
  endpoint?: string;
}

// Server-side copies and deletes issued at once while seeding or removing
// a snapshot/fork prefix. Well under Bunny's 500 requests/second limit.
const CONCURRENCY = 16;

/**
 * Adapter for Bunny Storage over its S3-compatible API.
 *
 * Object operations delegate to the S3 adapter, so this one has what the
 * Edge Storage HTTP API (`@storagesdk/adapters/bunny`) lacks: user
 * metadata, presigned `url()` / `uploadUrl()`, multipart uploads, and
 * server-side copy. Snapshots and forks use the sibling-prefix layout
 * shared with the `bunny` adapter rather than the S3 adapter's sibling
 * buckets, because a zone's credentials can't create another zone.
 *
 * Bunny defaults the adapter sets for you:
 *  - Endpoint built from `region`; override with `endpoint`.
 *  - `forcePathStyle: true`.
 *  - `requestChecksumCalculation: 'WHEN_REQUIRED'`.
 */
export function bunnyS3(config: BunnyS3Config): Adapter<S3Client> {
  const region = config.region ?? 'de';
  const zone = s3({
    bucket: config.zone,
    region,
    endpoint: config.endpoint ?? `https://${region}-s3.storage.bunnycdn.com`,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.zone,
      secretAccessKey: config.accessKey,
    },
  });
  return defineAdapter<S3Client>(impl(zone, config.bucket));
}

/** Run `fn` over `items`, at most `CONCURRENCY` at a time. */
async function inBatches<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

/** Every key under `prefix`, one page at a time. */
async function* pages(
  zone: Adapter<S3Client>,
  prefix: string,
  signal: AbortSignal | undefined
): AsyncGenerator<string[]> {
  let cursor: string | undefined;
  do {
    const page = await zone.list({
      prefix,
      ...(cursor !== undefined ? { cursor } : {}),
      ...(signal ? { signal } : {}),
    });
    yield page.items.map((item) => item.path);
    cursor = page.cursor;
  } while (cursor !== undefined);
}

/**
 * Copy every object under `from/` to `to/` with server-side `CopyObject`,
 * skipping the manifest — the destination writes its own.
 */
async function copyAll(
  zone: Adapter<S3Client>,
  from: string,
  to: string,
  signal: AbortSignal | undefined
): Promise<void> {
  const fromPrefix = `${from}/`;
  for await (const keys of pages(zone, fromPrefix, signal)) {
    const relative = keys
      .map((key) => key.slice(fromPrefix.length))
      .filter((key) => !isInternalKey(key));
    await inBatches(relative, (key) =>
      zone.copy(
        `${fromPrefix}${key}`,
        `${to}/${key}`,
        signal ? { signal } : undefined
      )
    );
  }
}

/**
 * Delete everything under `prefix/`. Best-effort: used for snapshot/fork
 * teardown and create-failure rollback.
 */
async function destroy(
  zone: Adapter<S3Client>,
  prefix: string,
  signal: AbortSignal | undefined
): Promise<void> {
  try {
    for await (const keys of pages(zone, `${prefix}/`, signal)) {
      await inBatches(keys, (key) => zone.delete(key));
    }
  } catch {
    /* best-effort */
  }
}

/**
 * The logical bucket stored under `bucket/` in the zone. `zone` is the S3
 * adapter pointed at the whole storage zone; every key is prefixed on the
 * way in and stripped on the way out.
 */
function impl(zone: Adapter<S3Client>, bucket: string): Adapter<S3Client> {
  const base = `${bucket}/`;
  const zoneKey = (key: string): string => `${base}${key}`;
  const strip = <T extends StorageItemMeta>(item: T): T => ({
    ...item,
    path: item.path.slice(base.length),
  });

  return {
    name: 'bunny-s3',
    raw: zone.raw,

    upload: async (key, body, opts) =>
      strip(await zone.upload(zoneKey(key), body, opts)),
    download: async (key, opts) =>
      strip(await zone.download(zoneKey(key), opts)),
    head: async (key, opts) => strip(await zone.head(zoneKey(key), opts)),

    async list(opts) {
      const page = await zone.list({
        ...opts,
        prefix: zoneKey(opts?.prefix ?? ''),
      });
      // The manifest is an object under this prefix, so filtering it can
      // leave one page short by one item.
      const items = page.items
        .map(strip)
        .filter((item) => !isInternalKey(item.path));
      return page.cursor !== undefined
        ? { items, cursor: page.cursor }
        : { items };
    },

    delete: (key, opts) => zone.delete(zoneKey(key), opts),
    copy: (from, to, opts) => zone.copy(zoneKey(from), zoneKey(to), opts),
    move: (from, to, opts) => zone.move(zoneKey(from), zoneKey(to), opts),
    url: (key, opts) => zone.url(zoneKey(key), opts),
    uploadUrl: (key, opts) => zone.uploadUrl(zoneKey(key), opts),

    ...siblings<S3Client>(
      {
        at: (name) => impl(zone, name),
        copyAll: (from, to, signal) => copyAll(zone, from, to, signal),
        destroy: (prefix, signal) => destroy(zone, prefix, signal),
        asStorageError,
      },
      bucket
    ),
  };
}
