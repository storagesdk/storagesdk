import { posix } from 'node:path';
import {
  type Adapter,
  type BodyInput,
  bodyToBytes,
  type CreateSnapshotOptions,
  checkSignal,
  defineAdapter,
  emptyManifest,
  type ForkInfo,
  type ForkOptions,
  isInternalKey,
  type ListOptions,
  type ListResult,
  nextSnapshotId,
  type ReadOnlyAdapter,
  readManifest,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  type UploadOptions,
  type UploadUrlOptions,
  type UrlOptions,
  writeManifest,
} from '@storagesdk/core/adapter';
import {
  AuthType,
  createClient,
  type FileStat,
  type WebDAVClient,
} from 'webdav';
import { asStorageError, isForbidden, isMissing } from './errors.js';
import { resolveSafe, resolveSiblingSafe } from './paths.js';

/**
 * WebDAV adapter config. Works against any server speaking WebDAV —
 * Nextcloud, ownCloud, Apache mod_dav, nginx-dav, NAS appliances,
 * pCloud, mailbox.org, kDrive, etc. The underlying `webdav` client is
 * stateless (one HTTP request per call), so there's no connection
 * lifecycle to manage.
 */
export interface WebdavConfig {
  /**
   * Base URL of the WebDAV server. For Nextcloud this looks like
   * `https://cloud.example.com/remote.php/dav/files/<username>`.
   */
  baseUrl: string;
  /** Absolute POSIX path under `baseUrl`. Sibling snapshots/forks
   *  live alongside `folder` under this directory. */
  root: string;
  /** The folder this adapter operates on. Lives at `<root>/<folder>`. */
  folder: string;
  /** Username for Basic / Digest auth. */
  username?: string;
  /** Password for Basic / Digest auth. */
  password?: string;
  /** OAuth bearer token. Takes precedence over `username`/`password`. */
  token?: string;
  /**
   * Auth scheme. Defaults to `'basic'` when `username`/`password` are
   * set, `'token'` when `token` is set, `'none'` otherwise. Override
   * to force Digest, or to opt out of auth entirely.
   */
  authType?: 'basic' | 'digest' | 'token' | 'none';
}

export type WebdavRaw = WebDAVClient;

/**
 * WebDAV adapter. Object operations map onto HTTP verbs (GET/PUT/
 * DELETE/MOVE/COPY/MKCOL/PROPFIND). The lib's client is stateless —
 * each method is a fresh request — so there is no socket lifecycle to
 * manage. Snapshots and forks are emulated as sibling collections
 * under `root`, populated by a single `COPY` with `Depth: infinity`
 * (server-side, recursive, one HTTP call).
 *
 * `storage.raw` is the underlying `WebDAVClient` for callers that need
 * an API the adapter doesn't surface (PROPPATCH, LOCK, custom
 * properties, etc.).
 */
export function webdav(config: WebdavConfig): Adapter<WebdavRaw> {
  const client = createClient(config.baseUrl, buildClientOptions(config));
  return defineAdapter(createImpl(config, client));
}

const AUTH_TYPE_MAP: Readonly<
  Record<NonNullable<WebdavConfig['authType']>, AuthType>
> = {
  basic: AuthType.Password,
  digest: AuthType.Digest,
  token: AuthType.Token,
  none: AuthType.None,
};

/** Convert a `FileStat` from a PROPFIND response into a
 *  `StorageItemMeta`. Pure helper so `list` can reuse the data
 *  already fetched by the directory walk without a per-item `stat`
 *  round-trip, and `head` can share the same shaping. */
function fileToMeta(file: FileStat, key: string): StorageItemMeta {
  const size = typeof file.size === 'number' ? file.size : 0;
  const etag = file.etag;
  return {
    path: key,
    size,
    contentType: file.mime ?? 'application/octet-stream',
    etag: typeof etag === 'string' && etag.length > 0 ? etag : `${size}`,
    lastModified:
      typeof file.lastmod === 'string' ? new Date(file.lastmod) : new Date(0),
  };
}

/** Strip a trailing `/` from a remote path. Used to normalize
 *  directory paths into a single shape so the visited-set in
 *  `walkKeys` matches regardless of whether the server includes
 *  trailing slashes on collection entries. */
function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

function buildClientOptions(
  config: WebdavConfig
): Parameters<typeof createClient>[1] {
  const explicit = config.authType ? AUTH_TYPE_MAP[config.authType] : undefined;
  const inferred =
    config.token !== undefined
      ? AuthType.Token
      : config.username !== undefined
        ? AuthType.Password
        : AuthType.None;
  const authType = explicit ?? inferred;
  return {
    authType,
    ...(config.username !== undefined ? { username: config.username } : {}),
    ...(config.password !== undefined ? { password: config.password } : {}),
    ...(config.token !== undefined
      ? {
          token: {
            access_token: config.token,
            token_type: 'Bearer',
          },
        }
      : {}),
  };
}

function createImpl(
  config: WebdavConfig,
  client: WebDAVClient
): Adapter<WebdavRaw> {
  const folderPath = posix.join(config.root, config.folder);
  // Single-shot mkcol cache. WebDAV's `createDirectory` with
  // `{recursive: true}` is cheap on each call but still a round-trip;
  // skip the call entirely for dirs we've already ensured in this
  // adapter's lifetime.
  const ensuredDirs = new Set<string>();

  const ensureDir = async (
    dir: string,
    signal: AbortSignal | undefined
  ): Promise<void> => {
    if (ensuredDirs.has(dir) || dir === '' || dir === '/') return;
    try {
      await client.createDirectory(dir, {
        recursive: true,
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      throw asStorageError(err);
    }
    ensuredDirs.add(dir);
  };

  const statToMeta = async (
    filePath: string,
    key: string,
    signal: AbortSignal | undefined
  ): Promise<StorageItemMeta> => {
    let stat: Awaited<ReturnType<WebDAVClient['stat']>>;
    try {
      stat = await client.stat(filePath, signal ? { signal } : {});
    } catch (err) {
      throw asStorageError(err);
    }
    // `stat` returns `FileStat | ResponseDataDetailed<FileStat>`; we
    // never pass `{details: true}` so it's always the bare FileStat.
    return fileToMeta(stat as FileStat, key);
  };

  /** Recursive walk under this adapter's `folderPath`, yielding
   *  object keys + the `FileStat` already returned by PROPFIND for
   *  each. Walks via repeated `Depth: 1` PROPFIND calls because
   *  `Depth: infinity` is disabled by default on most production
   *  servers (Apache mod_dav, ownCloud, several SaaS providers).
   *  Returning the FileStat lets `list` build per-item meta without
   *  a per-item `stat` round-trip. Skips reserved keys and guards
   *  against directory cycles. */
  const walkKeys = async (
    signal: AbortSignal | undefined
  ): Promise<Array<{ key: string; file: FileStat }>> => {
    const out: Array<{ key: string; file: FileStat }> = [];
    const start = stripTrailingSlash(folderPath);
    const stack: string[] = [start];
    // Normalize trailing-slash differences before comparing — some
    // servers return collection entries with `/` appended, some
    // without. A visited set keyed on the stripped form catches
    // self-references AND any other cycle the server might create.
    const visited = new Set<string>([start]);
    while (stack.length > 0) {
      const current = stack.pop() as string;
      let entries: Awaited<ReturnType<WebDAVClient['getDirectoryContents']>>;
      try {
        // No `deep: true` — that uses Depth: infinity which most
        // production WebDAV servers disable.
        entries = await client.getDirectoryContents(current, {
          ...(signal ? { signal } : {}),
        });
      } catch (err) {
        // PROPFIND on a path that doesn't exist yet returns 404 on
        // Nextcloud/ownCloud but 403 on Apache mod_dav. Treat both as
        // "empty folder" for enumeration; real auth errors surface
        // from the per-file ops downstream.
        if (isMissing(err) || isForbidden(err)) continue;
        throw asStorageError(err);
      }
      const list = Array.isArray(entries) ? entries : [];
      for (const e of list) {
        if (typeof e.filename !== 'string') continue;
        // `filename` from the lib is absolute from `baseUrl`'s root.
        if (e.type === 'directory') {
          const normalized = stripTrailingSlash(e.filename);
          if (visited.has(normalized)) continue;
          visited.add(normalized);
          stack.push(normalized);
        } else if (e.type === 'file') {
          const rel = posix.relative(folderPath, e.filename);
          if (rel.startsWith('..')) continue;
          if (isInternalKey(rel)) continue;
          out.push({ key: rel, file: e });
        }
      }
    }
    return out;
  };

  return {
    name: 'webdav',
    raw: client,

    async upload(
      key: string,
      body: BodyInput,
      opts?: UploadOptions
    ): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const fullPath = resolveSafe(folderPath, key);
      const bytes = await bodyToBytes(body);
      await ensureDir(posix.dirname(fullPath), opts?.signal);
      const contentType = opts?.contentType ?? 'application/octet-stream';
      try {
        await client.putFileContents(fullPath, Buffer.from(bytes), {
          overwrite: true,
          headers: { 'Content-Type': contentType },
          ...(opts?.signal ? { signal: opts.signal } : {}),
        });
      } catch (err) {
        throw asStorageError(err);
      }
      // Synthesize the response from inputs. Avoids a stat RT; the
      // server's lastModified will be close to `now`, and the etag
      // would otherwise require a fresh PROPFIND.
      // User metadata is silently dropped — WebDAV's PROPPATCH dead
      // properties exist but server support is spotty.
      const now = new Date();
      return {
        path: key,
        size: bytes.byteLength,
        contentType,
        etag: `${bytes.byteLength}-${now.getTime()}`,
        lastModified: now,
      };
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const fullPath = resolveSafe(folderPath, key);
      let body: Buffer;
      let respHeaders: Readonly<Record<string, string>> | undefined;
      let respStatus = 0;
      // Ask the server for the requested byte range. HTTP `Range` is
      // honored by every WebDAV-compliant server; on the rare server
      // that ignores it we fall back to a client-side slice below.
      const rangeHeader =
        opts?.range !== undefined
          ? {
              Range: `bytes=${opts.range.offset}-${
                opts.range.offset + opts.range.length - 1
              }`,
            }
          : undefined;
      try {
        // `details: true` returns ResponseDataDetailed<Buffer> — body
        // plus headers + status. Reading mime/etag/lastmod off the
        // GET response saves a separate `stat` round-trip per download.
        const got = await client.getFileContents(fullPath, {
          format: 'binary',
          details: true,
          ...(rangeHeader ? { headers: rangeHeader } : {}),
          ...(opts?.signal ? { signal: opts.signal } : {}),
        });
        const detailed = got as unknown as {
          data: Buffer | string | ArrayBuffer;
          headers: Record<string, string>;
          status: number;
        };
        const data = detailed.data;
        body =
          data instanceof Buffer
            ? data
            : data instanceof ArrayBuffer
              ? Buffer.from(data)
              : Buffer.from(String(data), 'utf8');
        respHeaders = detailed.headers;
        respStatus = detailed.status;
      } catch (err) {
        throw asStorageError(err);
      }
      const bytes = new Uint8Array(
        body.buffer,
        body.byteOffset,
        body.byteLength
      );
      const headerVal = (name: string): string | undefined => {
        if (!respHeaders) return undefined;
        const direct = respHeaders[name];
        if (typeof direct === 'string') return direct;
        // The lib's `Headers` is a plain string→string map but some
        // servers lower-case headers and the lib doesn't normalize.
        // Scan case-insensitively as a fallback.
        for (const k of Object.keys(respHeaders)) {
          if (k.toLowerCase() === name) return respHeaders[k];
        }
        return undefined;
      };
      const contentType =
        headerVal('content-type') ?? 'application/octet-stream';
      const etagHeader = headerVal('etag');
      const lastModHeader = headerVal('last-modified');
      const meta: StorageItemMeta = {
        path: key,
        size: bytes.byteLength,
        contentType: contentType.split(';')[0]?.trim() || contentType,
        etag:
          etagHeader && etagHeader.length > 0
            ? etagHeader
            : `${bytes.byteLength}`,
        lastModified: lastModHeader ? new Date(lastModHeader) : new Date(0),
      };
      if (opts?.range) {
        // 206 Partial Content → server honored Range, body is already
        // the requested slice. 200 → server ignored Range and returned
        // the whole file; slice client-side as a fallback so callers
        // still get the contract they asked for.
        if (respStatus === 206) {
          return { ...meta, body: new Uint8Array(bytes) };
        }
        const { offset, length } = opts.range;
        const sliced = bytes.slice(offset, offset + length);
        return { ...meta, size: sliced.byteLength, body: sliced };
      }
      return { ...meta, body: new Uint8Array(bytes) };
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const fullPath = resolveSafe(folderPath, key);
      return statToMeta(fullPath, key, opts?.signal);
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const prefix = opts?.prefix ?? '';
      const limit = opts?.limit ?? 100;
      const cursor = opts?.cursor ?? '';

      const all = await walkKeys(opts?.signal);
      const matching = all
        .filter(({ key }) => key.startsWith(prefix) && key > cursor)
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const page = matching.slice(0, limit);
      // No per-item stat round-trip — every `FileStat` was already
      // returned by the walk's PROPFIND responses.
      const items: StorageItemMeta[] = page.map(({ key, file }) =>
        fileToMeta(file, key)
      );
      const hasMore = matching.length > limit;
      const last = page[page.length - 1];
      return hasMore && last !== undefined
        ? { items, cursor: last.key }
        : { items };
    },

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      const fullPath = resolveSafe(folderPath, key);
      try {
        await client.deleteFile(
          fullPath,
          opts?.signal ? { signal: opts.signal } : {}
        );
      } catch (err) {
        // Match S3 / fs: deleting a missing key is a no-op.
        if (isMissing(err)) return;
        throw asStorageError(err);
      }
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      const fromPath = resolveSafe(folderPath, from);
      const toPath = resolveSafe(folderPath, to);
      await ensureDir(posix.dirname(toPath), opts?.signal);
      try {
        await client.copyFile(fromPath, toPath, {
          overwrite: true,
          ...(opts?.signal ? { signal: opts.signal } : {}),
        });
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      const fromPath = resolveSafe(folderPath, from);
      const toPath = resolveSafe(folderPath, to);
      await ensureDir(posix.dirname(toPath), opts?.signal);
      try {
        await client.moveFile(fromPath, toPath, {
          overwrite: true,
          ...(opts?.signal ? { signal: opts.signal } : {}),
        });
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      const fullPath = resolveSafe(folderPath, key);
      // `getFileDownloadLink` returns a plain URL — not signed. Callers
      // need to supply auth (Basic/Digest/Bearer) to fetch. Capability
      // `fetchableSignedUrls: false` keeps the conformance suite from
      // trying an unauthenticated GET.
      return client.getFileDownloadLink(fullPath);
    },

    async uploadUrl(_key, _opts?: UploadUrlOptions): Promise<never> {
      throw new StorageError({
        code: 'NotSupported',
        message:
          'webdav adapter: uploadUrl is not supported (WebDAV has no presigned upload URL concept).',
      });
    },

    snapshots: {
      async create(opts?: CreateSnapshotOptions): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        await ensureDir(folderPath, opts?.signal);
        const id = nextSnapshotId(config.folder);
        const snapPath = resolveSiblingSafe(config.root, id);

        try {
          // Native server-side recursive COPY in one HTTP call.
          await client.copyFile(folderPath, snapPath, {
            overwrite: true,
            ...(opts?.signal ? { signal: opts.signal } : {}),
          });

          const snapImpl = createImpl({ ...config, folder: id }, client);
          await writeManifest(
            snapImpl,
            emptyManifest({ location: config.folder, snapshotId: null })
          );

          const thisImpl = createImpl(config, client);
          const meta = await readManifest(thisImpl);
          const info: SnapshotInfo = {
            id,
            createdAt: new Date(),
            ...(opts?.name !== undefined ? { name: opts.name } : {}),
          };
          meta.snapshots.push(info);
          await writeManifest(thisImpl, meta);
          return info;
        } catch (err) {
          // Best-effort rollback so a failed snapshot doesn't leave an
          // orphan sibling on the server.
          await client.deleteFile(snapPath).catch(() => {});
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        const thisImpl = createImpl(config, client);
        return (await readManifest(thisImpl)).snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const thisImpl = createImpl(config, client);
        const meta = await readManifest(thisImpl);
        const found = meta.snapshots.find((s) => s.id === id);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `snapshot ${id} not found`,
          });
        }
        return found;
      },

      async delete(id, opts): Promise<void> {
        checkSignal(opts?.signal);
        const snapPath = resolveSiblingSafe(config.root, id);
        const thisImpl = createImpl(config, client);
        const meta = await readManifest(thisImpl);
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        try {
          await client.deleteFile(
            snapPath,
            opts?.signal ? { signal: opts.signal } : {}
          );
        } catch (err) {
          if (!isMissing(err)) throw asStorageError(err);
        }
        await writeManifest(thisImpl, meta);
      },

      get(id): ReadOnlyAdapter {
        resolveSiblingSafe(config.root, id);
        const snapImpl = createImpl({ ...config, folder: id }, client);
        return {
          download: (p, opts) => snapImpl.download(p, opts),
          head: (p, opts) => snapImpl.head(p, opts),
          list: (opts) => snapImpl.list(opts),
          url: (p, opts) => snapImpl.url(p, opts),
        };
      },
    },

    forks: {
      async create(opts: ForkOptions): Promise<ForkInfo> {
        checkSignal(opts.signal);
        const forkPath = resolveSiblingSafe(config.root, opts.name);
        if (
          await client.exists(
            forkPath,
            opts.signal ? { signal: opts.signal } : {}
          )
        ) {
          throw new StorageError({
            code: 'Conflict',
            message: `fork ${opts.name} already exists`,
          });
        }

        let sourcePath: string;
        if (opts.fromSnapshot !== undefined) {
          sourcePath = resolveSiblingSafe(config.root, opts.fromSnapshot);
          if (
            !(await client.exists(
              sourcePath,
              opts.signal ? { signal: opts.signal } : {}
            ))
          ) {
            throw new StorageError({
              code: 'NotFound',
              message: `snapshot ${opts.fromSnapshot} not found`,
            });
          }
        } else {
          sourcePath = folderPath;
          await ensureDir(sourcePath, opts.signal);
        }

        try {
          await client.copyFile(sourcePath, forkPath, {
            overwrite: false,
            ...(opts.signal ? { signal: opts.signal } : {}),
          });

          const forkImpl = createImpl({ ...config, folder: opts.name }, client);
          await writeManifest(
            forkImpl,
            emptyManifest({
              location: config.folder,
              snapshotId: opts.fromSnapshot ?? null,
            })
          );

          const thisImpl = createImpl(config, client);
          const meta = await readManifest(thisImpl);
          const info: ForkInfo = {
            name: opts.name,
            createdAt: new Date(),
            ...(opts.fromSnapshot !== undefined
              ? { fromSnapshot: opts.fromSnapshot }
              : {}),
          };
          meta.forks.push(info);
          await writeManifest(thisImpl, meta);
          return info;
        } catch (err) {
          await client.deleteFile(forkPath).catch(() => {});
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        const thisImpl = createImpl(config, client);
        return (await readManifest(thisImpl)).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const thisImpl = createImpl(config, client);
        const meta = await readManifest(thisImpl);
        const found = meta.forks.find((f) => f.name === name);
        if (!found) {
          throw new StorageError({
            code: 'NotFound',
            message: `fork ${name} not found`,
          });
        }
        return found;
      },

      async delete(name, opts): Promise<void> {
        checkSignal(opts?.signal);
        const forkPath = resolveSiblingSafe(config.root, name);
        const thisImpl = createImpl(config, client);
        const meta = await readManifest(thisImpl);
        meta.forks = meta.forks.filter((f) => f.name !== name);
        try {
          await client.deleteFile(
            forkPath,
            opts?.signal ? { signal: opts.signal } : {}
          );
        } catch (err) {
          if (!isMissing(err)) throw asStorageError(err);
        }
        await writeManifest(thisImpl, meta);
      },

      get(name): Adapter<WebdavRaw> {
        // Sibling-name format is validated synchronously; existence is
        // deferred to the returned adapter's first call.
        resolveSiblingSafe(config.root, name);
        return createImpl({ ...config, folder: name }, client);
      },
    },
  };
}
