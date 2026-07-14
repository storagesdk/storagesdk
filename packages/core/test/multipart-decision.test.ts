import { beforeEach, describe, expect, it } from 'vitest';
import type { Adapter } from '../src/adapter.js';
import { StorageError } from '../src/errors.js';
import { Storage } from '../src/storage.js';
import type {
  BodyInput,
  StorageItemMeta,
  UploadOptions,
} from '../src/types.js';

/**
 * Tiny recording adapter — captures the `opts` passed to upload so tests
 * can assert what the Storage class resolved for `multipart`. Other methods
 * are unused; they throw if called so a regression doesn't sneak past.
 */
function recordingAdapter(): {
  adapter: Adapter;
  lastOpts: () => UploadOptions | undefined;
} {
  let lastOpts: UploadOptions | undefined;
  const notUsed = () => {
    throw new StorageError({
      code: 'NotSupported',
      message: 'recordingAdapter: only upload is wired',
    });
  };
  const adapter: Adapter = {
    name: 'recording',
    raw: undefined,
    async upload(
      path: string,
      _body: BodyInput,
      opts?: UploadOptions
    ): Promise<StorageItemMeta> {
      lastOpts = opts;
      return {
        path,
        size: 0,
        contentType: 'application/octet-stream',
        etag: 'recorded',
        lastModified: new Date(),
      };
    },
    download: notUsed,
    head: notUsed,
    list: notUsed,
    delete: notUsed,
    copy: notUsed,
    move: notUsed,
    url: notUsed,
    uploadUrl: notUsed,
    snapshots: {
      create: notUsed,
      list: notUsed,
      head: notUsed,
      delete: notUsed,
      get: notUsed,
    },
    forks: {
      create: notUsed,
      list: notUsed,
      head: notUsed,
      delete: notUsed,
      get: notUsed,
      merge: notUsed,
      rebase: notUsed,
      diff: notUsed,
    },
  };
  return { adapter, lastOpts: () => lastOpts };
}

describe('Storage.upload multipart auto-decide', () => {
  let adapter: Adapter;
  let lastOpts: () => UploadOptions | undefined;

  beforeEach(() => {
    ({ adapter, lastOpts } = recordingAdapter());
  });

  it('resolves to single PUT for size-known body below threshold', async () => {
    const storage = new Storage({ adapter });
    await storage.upload('small.txt', 'hello');
    expect(lastOpts()?.multipart).toBe(false);
  });

  it('resolves to multipart for size-known body above threshold', async () => {
    const storage = new Storage({ adapter });
    await storage.upload('big.bin', new Uint8Array(6 * 1024 * 1024));
    expect(lastOpts()?.multipart).toBe(true);
  });

  it('always multiparts a ReadableStream (size unknown)', async () => {
    const storage = new Storage({ adapter });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    await storage.upload('stream.bin', stream);
    expect(lastOpts()?.multipart).toBe(true);
  });

  it('honors explicit multipart: true for tiny bodies', async () => {
    const storage = new Storage({ adapter });
    await storage.upload('tiny.txt', 'x', { multipart: true });
    expect(lastOpts()?.multipart).toBe(true);
  });

  it('honors explicit multipart: false for large bodies', async () => {
    const storage = new Storage({ adapter });
    await storage.upload('big.bin', new Uint8Array(10 * 1024 * 1024), {
      multipart: false,
    });
    expect(lastOpts()?.multipart).toBe(false);
  });

  it('respects a custom multipartThreshold passed in UploadOptions', async () => {
    const storage = new Storage({ adapter });
    await storage.upload('2kb.bin', new Uint8Array(2048), {
      multipartThreshold: 1024,
    });
    expect(lastOpts()?.multipart).toBe(true);
    await storage.upload('512b.bin', new Uint8Array(512), {
      multipartThreshold: 1024,
    });
    expect(lastOpts()?.multipart).toBe(false);
  });

  it('treats the threshold as exclusive (size equal to threshold → single PUT)', async () => {
    const storage = new Storage({ adapter });
    await storage.upload('exact.bin', new Uint8Array(1024), {
      multipartThreshold: 1024,
    });
    expect(lastOpts()?.multipart).toBe(false);
  });

  it('handles Blob bodies via Blob.size', async () => {
    const storage = new Storage({ adapter });
    await storage.upload('blob.bin', new Blob([new Uint8Array(2048)]), {
      multipartThreshold: 1024,
    });
    expect(lastOpts()?.multipart).toBe(true);
  });

  it('handles string bodies via utf-8 byte length', async () => {
    const storage = new Storage({ adapter });
    // "🌊" is 4 UTF-8 bytes; 300 of them = 1200 bytes > 1024 threshold.
    await storage.upload('emoji.txt', '🌊'.repeat(300), {
      multipartThreshold: 1024,
    });
    expect(lastOpts()?.multipart).toBe(true);
  });
});
