import {
  type BlobItem,
  BlobSASPermissions,
  BlobServiceClient,
  type BlobServiceClient as BlobServiceClientType,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import {
  type Adapter,
  bodyToBytes,
  bridgeSignalToController,
  checkSignal,
  defineAdapter,
  emptyManifest,
  type ForkInfo,
  isInternalKey,
  type ListOptions,
  type ListResult,
  nextSnapshotId,
  type ReadOnlyAdapter,
  readManifest,
  readStreamToBytes,
  type SnapshotInfo,
  StorageError,
  type StorageItem,
  type StorageItemMeta,
  toWebStream,
  type UploadOptions,
  type UploadUrlOptions,
  type UploadUrlResult,
  type UrlOptions,
  writeManifest,
} from '@storagesdk/core/adapter';
import { asStorageError } from './errors.js';

export interface AzureConfig {
  /** Container the adapter operates on. */
  bucket: string;
  /** Azure Storage account name. */
  accountName: string;
  /** Account access key. Find under "Access keys" in the Azure portal. */
  accountKey: string;
  /**
   * Override the blob service endpoint. Defaults to
   * `https://<accountName>.blob.core.windows.net`. Use for Azure US Gov,
   * China, or Azurite local emulation.
   */
  endpoint?: string;
}

/**
 * Adapter for Azure Blob Storage.
 *
 * Maps each Azure container to a storagesdk "bucket". Snapshots and forks
 * follow the sibling-container convention used by the S3 adapter: each is
 * a new container populated by server-side copy. Lineage is stored as a
 * `.storagesdk.metadata.json` blob at the root of each container.
 *
 * Auth is account name + key. For Entra ID / SAS / connection-string
 * auth, build a `BlobServiceClient` yourself and reach for it via
 * `storage.raw`.
 */
export function azure(config: AzureConfig): Adapter<BlobServiceClientType> {
  const credential = new StorageSharedKeyCredential(
    config.accountName,
    config.accountKey
  );
  const url =
    config.endpoint ?? `https://${config.accountName}.blob.core.windows.net`;
  const client = new BlobServiceClient(url, credential);
  return defineAdapter<BlobServiceClientType>(
    impl(client, credential, config.bucket)
  );
}

function impl(
  client: BlobServiceClientType,
  credential: StorageSharedKeyCredential,
  bucket: string
): Adapter<BlobServiceClientType> {
  const container = client.getContainerClient(bucket);

  return {
    name: 'azure',
    raw: client,

    async upload(key, body, opts?: UploadOptions): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const blob = container.getBlockBlobClient(key);
      const bridge = bridgeSignalToController(opts?.signal);
      try {
        const payload = await bodyToBytes(body);
        await blob.uploadData(payload, {
          ...(opts?.contentType !== undefined
            ? { blobHTTPHeaders: { blobContentType: opts.contentType } }
            : {}),
          ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
          ...(bridge.controller
            ? { abortSignal: bridge.controller.signal }
            : {}),
          ...(opts?.onProgress !== undefined
            ? {
                onProgress: (e) =>
                  opts.onProgress?.({
                    loaded: e.loadedBytes,
                    total: payload.byteLength,
                  }),
              }
            : {}),
        });
        return {
          path: key,
          size: payload.byteLength,
          contentType: opts?.contentType ?? 'application/octet-stream',
          etag: '',
          lastModified: new Date(),
          ...(opts?.metadata !== undefined ? { metadata: opts.metadata } : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      } finally {
        bridge.dispose();
      }
    },

    async download(key, opts): Promise<StorageItem> {
      checkSignal(opts?.signal);
      const blob = container.getBlockBlobClient(key);
      try {
        const res = await blob.download(0, undefined, {
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
        });
        const stream = res.readableStreamBody;
        if (!stream) {
          throw new StorageError({
            code: 'NotFound',
            message: `${key} has no body`,
          });
        }
        const body = await readStreamToBytes(toWebStream(stream));
        return {
          path: key,
          size: res.contentLength ?? body.byteLength,
          contentType: res.contentType ?? 'application/octet-stream',
          etag: stripQuotes(res.etag ?? ''),
          lastModified: res.lastModified ?? new Date(),
          body,
          ...(res.metadata && Object.keys(res.metadata).length > 0
            ? { metadata: res.metadata }
            : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async head(key, opts): Promise<StorageItemMeta> {
      checkSignal(opts?.signal);
      const blob = container.getBlockBlobClient(key);
      try {
        const props = await blob.getProperties({
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
        });
        return {
          path: key,
          size: props.contentLength ?? 0,
          contentType: props.contentType ?? 'application/octet-stream',
          etag: stripQuotes(props.etag ?? ''),
          lastModified: props.lastModified ?? new Date(),
          ...(props.metadata && Object.keys(props.metadata).length > 0
            ? { metadata: props.metadata }
            : {}),
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async list(opts?: ListOptions): Promise<ListResult> {
      checkSignal(opts?.signal);
      const limit = opts?.limit ?? 1000;
      const items: StorageItemMeta[] = [];
      try {
        // Page size matches the caller's `limit` exactly. Filtering the
        // internal manifest may yield `limit - 1` items on the page
        // that contains it; that's the contract callers should expect
        // from `list({ limit })` ("up to N", not "exactly N"). The S3
        // adapter does the same. Over-fetching by 1 here would advance
        // the continuation token past an item we silently discarded.
        const iter = container
          .listBlobsFlat({
            ...(opts?.prefix !== undefined ? { prefix: opts.prefix } : {}),
            ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          })
          .byPage({
            maxPageSize: limit,
            ...(opts?.cursor !== undefined
              ? { continuationToken: opts.cursor }
              : {}),
          });
        const page = await iter.next();
        const value = page.value;
        let cursor: string | undefined;
        if (value) {
          for (const blob of value.segment.blobItems as BlobItem[]) {
            if (isInternalKey(blob.name)) continue;
            items.push({
              path: blob.name,
              size: blob.properties.contentLength ?? 0,
              contentType:
                blob.properties.contentType ?? 'application/octet-stream',
              etag: stripQuotes(blob.properties.etag ?? ''),
              lastModified: blob.properties.lastModified ?? new Date(),
              ...(blob.metadata && Object.keys(blob.metadata).length > 0
                ? { metadata: blob.metadata }
                : {}),
            });
          }
          if (value.continuationToken) cursor = value.continuationToken;
        }
        return cursor !== undefined ? { items, cursor } : { items };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async delete(key, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        await container.getBlockBlobClient(key).deleteIfExists({
          ...(opts?.signal ? { abortSignal: opts.signal } : {}),
        });
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async copy(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        const src = container.getBlockBlobClient(from);
        const dst = container.getBlockBlobClient(to);
        await dst.syncCopyFromURL(
          sasSourceUrl(src.url, bucket, from, credential),
          {
            ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          }
        );
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async move(from, to, opts): Promise<void> {
      checkSignal(opts?.signal);
      try {
        const src = container.getBlockBlobClient(from);
        const dst = container.getBlockBlobClient(to);
        await dst.syncCopyFromURL(
          sasSourceUrl(src.url, bucket, from, credential),
          {
            ...(opts?.signal ? { abortSignal: opts.signal } : {}),
          }
        );
        // Copy succeeded — see the delete through unconditionally,
        // same pattern as the S3 adapter, so a mid-move abort doesn't
        // leave both src and dst.
        await src.delete();
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async url(key, opts?: UrlOptions): Promise<string> {
      checkSignal(opts?.signal);
      try {
        const blob = container.getBlockBlobClient(key);
        const sas = generateBlobSASQueryParameters(
          {
            containerName: bucket,
            blobName: key,
            permissions: BlobSASPermissions.parse('r'),
            expiresOn: new Date(Date.now() + (opts?.expiresIn ?? 3600) * 1000),
          },
          credential
        );
        return `${blob.url}?${sas.toString()}`;
      } catch (err) {
        throw asStorageError(err);
      }
    },

    async uploadUrl(key, opts?: UploadUrlOptions): Promise<UploadUrlResult> {
      checkSignal(opts?.signal);
      // Azure SAS doesn't enforce `maxSize`/`minSize` at the URL level,
      // and there's no POST-policy equivalent. Silently ignore those
      // options and return a write-permission SAS — the compat matrix
      // documents the gap. `contentType` is honored: when present, it's
      // baked into the SAS so the client must send a matching header.
      try {
        const blob = container.getBlockBlobClient(key);
        const sas = generateBlobSASQueryParameters(
          {
            containerName: bucket,
            blobName: key,
            permissions: BlobSASPermissions.parse('cw'), // create + write
            expiresOn: new Date(Date.now() + (opts?.expiresIn ?? 3600) * 1000),
            ...(opts?.contentType !== undefined
              ? { contentType: opts.contentType }
              : {}),
          },
          credential
        );
        return {
          method: 'PUT',
          url: `${blob.url}?${sas.toString()}`,
          // Azure REST requires this header on every block-blob PUT —
          // the SAS doesn't carry it, so the client has to send it.
          // Surface it here so callers don't need Azure-specific knowledge.
          headers: { 'x-ms-blob-type': 'BlockBlob' },
        };
      } catch (err) {
        throw asStorageError(err);
      }
    },

    // Sibling-container convention for snapshots and forks. Each is a
    // new container populated by server-side `syncCopyFromURL` per blob
    // (same storage account, no SAS needed). Manifest lives as a
    // regular blob at `MANIFEST_PATH` in each container.
    snapshots: {
      async create(opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const id = nextSnapshotId(bucket);
        await createSibling(client, id);
        try {
          await copyAllBlobs(client, credential, bucket, id);
          // Initialize the snapshot's own manifest.
          const snapImpl = impl(client, credential, id);
          await writeManifest(
            snapImpl,
            emptyManifest({ location: bucket, snapshotId: null })
          );

          const thisImpl = impl(client, credential, bucket);
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
          await destroySibling(client, id);
          throw asStorageError(err);
        }
      },

      async list(): Promise<SnapshotInfo[]> {
        const thisImpl = impl(client, credential, bucket);
        return (await readManifest(thisImpl)).snapshots;
      },

      async head(id, opts): Promise<SnapshotInfo> {
        checkSignal(opts?.signal);
        const thisImpl = impl(client, credential, bucket);
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
        const thisImpl = impl(client, credential, bucket);
        const meta = await readManifest(thisImpl);
        meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
        await destroySibling(client, id);
        await writeManifest(thisImpl, meta);
      },

      get(id): ReadOnlyAdapter {
        const snapImpl = impl(client, credential, id);
        return {
          download: (p, opts) => snapImpl.download(p, opts),
          head: (p, opts) => snapImpl.head(p, opts),
          list: (opts) => snapImpl.list(opts),
          url: (p, opts) => snapImpl.url(p, opts),
        };
      },
    },

    forks: {
      async create(opts): Promise<ForkInfo> {
        checkSignal(opts.signal);
        // Validate `fromSnapshot` against the parent manifest before
        // touching Azure. A bogus snapshot id otherwise surfaces as
        // `Provider` (whatever Azure throws when the source container
        // is missing), violating the cross-adapter `NotFound` contract.
        if (opts.fromSnapshot !== undefined) {
          const parent = impl(client, credential, bucket);
          const parentMeta = await readManifest(parent);
          if (!parentMeta.snapshots.some((s) => s.id === opts.fromSnapshot)) {
            throw new StorageError({
              code: 'NotFound',
              message: `snapshot ${opts.fromSnapshot} not found`,
            });
          }
        }
        await createSibling(client, opts.name);
        try {
          const source = opts.fromSnapshot ?? bucket;
          await copyAllBlobs(client, credential, source, opts.name);
          const forkImpl = impl(client, credential, opts.name);
          await writeManifest(
            forkImpl,
            emptyManifest({
              location: bucket,
              snapshotId: opts.fromSnapshot ?? null,
            })
          );

          const thisImpl = impl(client, credential, bucket);
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
          await destroySibling(client, opts.name);
          throw asStorageError(err);
        }
      },

      async list(): Promise<ForkInfo[]> {
        const thisImpl = impl(client, credential, bucket);
        return (await readManifest(thisImpl)).forks;
      },

      async head(name, opts): Promise<ForkInfo> {
        checkSignal(opts?.signal);
        const thisImpl = impl(client, credential, bucket);
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
        const thisImpl = impl(client, credential, bucket);
        const meta = await readManifest(thisImpl);
        meta.forks = meta.forks.filter((f) => f.name !== name);
        await destroySibling(client, name);
        await writeManifest(thisImpl, meta);
      },

      get(name): Adapter<BlobServiceClientType> {
        return impl(client, credential, name);
      },
    },
  };
}

async function createSibling(
  client: BlobServiceClientType,
  name: string
): Promise<void> {
  try {
    await client.getContainerClient(name).create();
  } catch (err) {
    throw asStorageError(err);
  }
}

async function destroySibling(
  client: BlobServiceClientType,
  name: string
): Promise<void> {
  try {
    const c = client.getContainerClient(name);
    // Empty the container so the delete doesn't trip on lingering blobs.
    for await (const blob of c.listBlobsFlat()) {
      await c
        .getBlockBlobClient(blob.name)
        .deleteIfExists()
        .catch(() => {});
    }
    await c.deleteIfExists();
  } catch {
    /* swallow — best-effort */
  }
}

async function copyAllBlobs(
  client: BlobServiceClientType,
  credential: StorageSharedKeyCredential,
  fromBucket: string,
  toBucket: string
): Promise<void> {
  const src = client.getContainerClient(fromBucket);
  const dst = client.getContainerClient(toBucket);
  for await (const blob of src.listBlobsFlat()) {
    // Skip the source manifest — the destination writes its own.
    if (isInternalKey(blob.name)) continue;
    const srcBlob = src.getBlockBlobClient(blob.name);
    const dstBlob = dst.getBlockBlobClient(blob.name);
    await dstBlob.syncCopyFromURL(
      sasSourceUrl(srcBlob.url, fromBucket, blob.name, credential)
    );
  }
}

/**
 * Generate a short-lived read SAS for a blob and return `<url>?<sas>`.
 * `syncCopyFromURL` requires the source URL to authenticate itself
 * server-side — `SharedKey` auth on the destination request alone
 * doesn't grant the storage service permission to read the source.
 * Azurite is lax about this; real Azure enforces it.
 */
function sasSourceUrl(
  blobUrl: string,
  containerName: string,
  blobName: string,
  credential: StorageSharedKeyCredential
): string {
  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      // 5 minutes is plenty for a sync copy; sync copies block until the
      // server-side transfer is done.
      expiresOn: new Date(Date.now() + 5 * 60 * 1000),
    },
    credential
  );
  return `${blobUrl}?${sas.toString()}`;
}

function stripQuotes(s: string): string {
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}
