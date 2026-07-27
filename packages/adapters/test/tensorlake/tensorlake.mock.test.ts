import { readFile } from 'node:fs/promises';
import type {
  FileEntry,
  FilesystemInfo,
  FilesystemSnapshotInfo,
  FilesystemVersion,
} from 'tensorlake';
import { expect, it, vi } from 'vitest';

const nativeCalls = vi.hoisted(() => ({ pathWrites: 0 }));

/**
 * In-memory stand-in for the `tensorlake` SDK's `FilesystemClient` /
 * `Filesystem`. Models the two behaviors the adapter leans on: every write
 * produces a new version, and reads accept a version id for
 * time-travel. `contentId` is a content hash so identical bytes hash
 * identically across filesystems — which is what default merge/diff rely on.
 */
vi.mock('tensorlake', () => {
  class FilesystemError extends Error {}
  class FilesystemNotFoundError extends FilesystemError {
    readonly filesystemName: string;
    constructor(name: string) {
      super(`filesystem ${name} not found`);
      this.filesystemName = name;
      this.name = 'FilesystemNotFoundError';
    }
  }
  class FileNotFoundInFilesystemError extends FilesystemError {
    readonly filesystem: string;
    readonly path: string;
    constructor(filesystem: string, path: string) {
      super(`${path} not found in ${filesystem}`);
      this.filesystem = filesystem;
      this.path = path;
      this.name = 'FileNotFoundInFilesystemError';
    }
  }
  class FilesystemAPIError extends FilesystemError {
    readonly statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'FilesystemAPIError';
    }
  }

  const toBytes = (data: Uint8Array | string): Uint8Array =>
    typeof data === 'string' ? new TextEncoder().encode(data) : data;

  const oidOf = (data: Uint8Array): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      h ^= data[i] ?? 0;
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  const versionObj = (
    id: string,
    previousVersionId: string | null
  ): FilesystemVersion => ({
    versionId: id,
    previousVersionId,
    created: true,
    message: '',
  });

  class Store {
    readonly commits = new Map<string, Map<string, Uint8Array>>();
    readonly live = new Map<string, Uint8Array>();
    readonly retained = new Map<string, FilesystemSnapshotInfo>();
    counter = 0;
    head: string | undefined;

    commitNow(): string {
      const id = `commit-${++this.counter}`;
      this.commits.set(id, new Map(this.live));
      this.head = id;
      return id;
    }

    view(version: string | undefined): Map<string, Uint8Array> {
      if (version === undefined) return this.live;
      const commit = this.commits.get(version);
      if (commit === undefined) {
        throw new FilesystemAPIError(404, `unknown version ${version}`);
      }
      return commit;
    }
  }

  const filesystems = new Map<string, Store>();

  class Filesystem {
    readonly name: string;
    constructor(name: string) {
      this.name = name;
    }
    private store(): Store {
      const store = filesystems.get(this.name);
      if (store === undefined) throw new FilesystemNotFoundError(this.name);
      return store;
    }
    async writeFile(
      path: string,
      data: Uint8Array | string
    ): Promise<FilesystemVersion> {
      const store = this.store();
      const previous = store.head ?? null;
      store.live.set(path, toBytes(data));
      return versionObj(store.commitNow(), previous);
    }
    async writeFiles(
      files:
        | Map<string, Uint8Array | string>
        | Record<string, Uint8Array | string>,
      _message?: string,
      deletes?: string[]
    ): Promise<FilesystemVersion> {
      const store = this.store();
      const previous = store.head ?? null;
      const entries =
        files instanceof Map ? [...files.entries()] : Object.entries(files);
      for (const [path, data] of entries) store.live.set(path, toBytes(data));
      for (const path of deletes ?? []) store.live.delete(path);
      return versionObj(store.commitNow(), previous);
    }
    async writeFileFromPath(
      path: string,
      localPath: string
    ): Promise<FilesystemVersion> {
      nativeCalls.pathWrites += 1;
      return this.writeFile(path, await readFile(localPath));
    }
    async deleteFile(path: string): Promise<FilesystemVersion> {
      const store = this.store();
      const previous = store.head ?? null;
      if (!store.live.has(path)) {
        throw new FileNotFoundInFilesystemError(this.name, path);
      }
      store.live.delete(path);
      return versionObj(store.commitNow(), previous);
    }
    async copyFile(from: string, to: string): Promise<FilesystemVersion> {
      const store = this.store();
      const previous = store.head ?? null;
      const bytes = store.live.get(from);
      if (bytes === undefined) {
        throw new FileNotFoundInFilesystemError(this.name, from);
      }
      store.live.set(to, bytes);
      return versionObj(store.commitNow(), previous);
    }
    async moveFile(from: string, to: string): Promise<FilesystemVersion> {
      const store = this.store();
      const previous = store.head ?? null;
      const bytes = store.live.get(from);
      if (bytes === undefined) {
        throw new FileNotFoundInFilesystemError(this.name, from);
      }
      store.live.delete(from);
      store.live.set(to, bytes);
      return versionObj(store.commitNow(), previous);
    }
    async snapshot(message = ''): Promise<{ id: string; message: string }> {
      const store = this.store();
      const id = store.head ?? store.commitNow();
      const existing = store.retained.get(id);
      if (existing !== undefined && existing.message !== message) {
        throw new FilesystemAPIError(
          409,
          'permanent snapshot already has a different message'
        );
      }
      store.retained.set(id, {
        id,
        createdAt: new Date(),
        message,
      });
      return { id, message };
    }
    async listSnapshots(): Promise<FilesystemSnapshotInfo[]> {
      return [...this.store().retained.values()];
    }
    async deleteSnapshot(snapshot: string): Promise<void> {
      this.store().retained.delete(snapshot);
    }
    async readFile(path: string, version?: string): Promise<Uint8Array> {
      const bytes = this.store().view(version).get(path);
      if (bytes === undefined) {
        throw new FileNotFoundInFilesystemError(this.name, path);
      }
      return bytes;
    }
    async readFileWithMetadata(
      path: string,
      options?: {
        version?: string;
        range?: { offset: number; length: number };
      }
    ): Promise<{ data: Uint8Array; contentId: string; size: number }> {
      if (this.store().head === undefined) {
        throw new FilesystemAPIError(400, 'native filesystem head is unborn');
      }
      const bytes = await this.readFile(path, options?.version);
      if (options?.range && options.range.offset >= bytes.byteLength) {
        throw new FilesystemAPIError(416, 'requested range not satisfiable');
      }
      const data = options?.range
        ? bytes.subarray(
            options.range.offset,
            options.range.offset + options.range.length
          )
        : bytes;
      return {
        data,
        contentId: oidOf(bytes),
        size: bytes.byteLength,
      };
    }
    async readText(path: string, version?: string): Promise<string> {
      return new TextDecoder().decode(await this.readFile(path, version));
    }
    async listFiles(dirPath?: string, version?: string): Promise<FileEntry[]> {
      const store = this.store();
      if (store.head === undefined) {
        throw new FilesystemAPIError(400, 'native filesystem head is unborn');
      }
      const view = store.view(version);
      const prefix = dirPath ? `${dirPath.replace(/\/+$/, '')}/` : '';
      const files = new Set<string>();
      const dirs = new Set<string>();
      for (const key of view.keys()) {
        if (prefix && !key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (rest.length === 0) continue;
        const slash = rest.indexOf('/');
        if (slash === -1) files.add(rest);
        else dirs.add(rest.slice(0, slash));
      }
      const out: FileEntry[] = [];
      for (const dir of dirs) {
        out.push({
          name: dir,
          path: `${prefix}${dir}`,
          contentId: '',
          kind: 'directory',
          executable: false,
          size: null,
          isDir: true,
          isSymlink: false,
        });
      }
      for (const file of files) {
        const key = `${prefix}${file}`;
        const bytes = view.get(key) as Uint8Array;
        out.push({
          name: file,
          path: key,
          contentId: oidOf(bytes),
          kind: 'file',
          executable: false,
          size: bytes.byteLength,
          isDir: false,
          isSymlink: false,
        });
      }
      return out;
    }
    async status() {
      const store = this.store();
      return {
        name: this.name,
        status: 'ready',
        versionId: store.head ?? null,
        generation: store.counter,
      };
    }
  }

  class FilesystemClient {
    async create(name: string): Promise<Filesystem> {
      if (filesystems.has(name)) {
        throw new FilesystemAPIError(409, `filesystem ${name} already exists`);
      }
      filesystems.set(name, new Store());
      return new Filesystem(name);
    }
    async get(name: string): Promise<Filesystem> {
      if (!filesystems.has(name)) throw new FilesystemNotFoundError(name);
      return new Filesystem(name);
    }
    async fork(
      name: string,
      base: string,
      snapshot?: string
    ): Promise<Filesystem> {
      if (filesystems.has(name)) {
        throw new FilesystemAPIError(409, `filesystem ${name} already exists`);
      }
      const baseStore = filesystems.get(base);
      if (baseStore === undefined) throw new FilesystemNotFoundError(base);
      const source = baseStore.view(snapshot);
      const forkStore = new Store();
      for (const [path, bytes] of source) forkStore.live.set(path, bytes);
      forkStore.commitNow();
      filesystems.set(name, forkStore);
      return new Filesystem(name);
    }
    async list(): Promise<FilesystemInfo[]> {
      return [...filesystems.keys()].map((name) => ({
        name,
        fullName: name,
        defaultBranch: 'main',
        status: 'ready',
        kind: 'filesystem',
      }));
    }
    async delete(name: string): Promise<void> {
      if (!filesystems.delete(name)) throw new FilesystemNotFoundError(name);
    }
  }

  return {
    FilesystemClient,
    Filesystem,
    FilesystemError,
    FilesystemNotFoundError,
    FileNotFoundInFilesystemError,
    FilesystemAPIError,
  };
});

const { storageAdapterTestSuite } = await import('../../src/test-suite.js');
const { tensorlake } = await import('../../src/tensorlake/tensorlake.js');
const { FilesystemClient } = await import('tensorlake');

const mockClient = new FilesystemClient({ apiKey: 'test' });
for (const filesystem of [
  'mock-volume',
  'mock-stream-volume',
  'mock-range-volume',
  'mock-empty-volume',
  'mock-snapshot-ownership-volume',
  'mock-fork-registry-volume',
  'mock-live-fork-base-volume',
  'mock-nested-fork-volume',
]) {
  await mockClient.create(filesystem);
}

storageAdapterTestSuite({
  name: 'tensorlake adapter (in-memory)',
  adapter: () => tensorlake({ filesystem: 'mock-volume', apiKey: 'test' }),
  capabilities: {
    userMetadata: false,
    contentType: false,
    presignedUploads: false,
    fetchableSignedUrls: false,
  },
});

it('uses the bounded local-path publication API for stream bodies', async () => {
  const adapter = tensorlake({
    filesystem: 'mock-stream-volume',
    apiKey: 'test',
  });
  const before = nativeCalls.pathWrites;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('streamed '));
      controller.enqueue(new TextEncoder().encode('payload'));
      controller.close();
    },
  });

  await adapter.upload('stream.txt', body);

  expect(nativeCalls.pathWrites).toBe(before + 1);
  expect(
    new TextDecoder().decode((await adapter.download('stream.txt')).body)
  ).toBe('streamed payload');
});

it('rejects a range offset past EOF', async () => {
  const adapter = tensorlake({
    filesystem: 'mock-range-volume',
    apiKey: 'test',
  });
  await adapter.upload('small.txt', 'abc');

  await expect(
    adapter.download('small.txt', { range: { offset: 3, length: 1 } })
  ).rejects.toMatchObject({ code: 'InvalidArgument' });
});

it('treats an unborn filesystem as empty storage', async () => {
  const adapter = tensorlake({
    filesystem: 'mock-empty-volume',
    apiKey: 'test',
  });

  expect(await adapter.list()).toEqual({ items: [] });
  await expect(adapter.head('missing.txt')).rejects.toMatchObject({
    code: 'NotFound',
  });
  await expect(adapter.download('missing.txt')).rejects.toMatchObject({
    code: 'NotFound',
  });
});

it('does not list, inspect, or delete snapshots owned by another client', async () => {
  const filesystem = await mockClient.get('mock-snapshot-ownership-volume');
  await filesystem.writeFile('seed.txt', 'seed');
  const external = await filesystem.snapshot('another client');
  const adapter = tensorlake({
    filesystem: 'mock-snapshot-ownership-volume',
    apiKey: 'test',
  });

  expect(await adapter.snapshots.list()).toEqual([]);
  await expect(adapter.snapshots.head(external.id)).rejects.toMatchObject({
    code: 'NotFound',
  });
  await expect(adapter.snapshots.delete(external.id)).rejects.toMatchObject({
    code: 'NotFound',
  });
  expect(
    (await filesystem.listSnapshots()).some(
      (snapshot) => snapshot.id === external.id
    )
  ).toBe(true);
});

it("does not expose a parent's fork registry as a child's forks", async () => {
  const adapter = tensorlake({
    filesystem: 'mock-fork-registry-volume',
    apiKey: 'test',
  });
  await adapter.upload('seed.txt', 'seed');

  await adapter.forks.create({ name: 'first-child' });
  await adapter.forks.create({ name: 'second-child' });

  expect(await adapter.forks.get('second-child').forks.list()).toEqual([]);
});

it('keeps nested fork names distinct from root fork names', async () => {
  const adapter = tensorlake({
    filesystem: 'mock-nested-fork-volume',
    apiKey: 'test',
  });
  await adapter.upload('seed.txt', 'seed');

  await adapter.forks.create({ name: 'a-fork-b' });
  await adapter.forks.create({ name: 'a' });
  await adapter.forks.get('a').forks.create({ name: 'b' });

  expect((await adapter.forks.list()).map((fork) => fork.name).sort()).toEqual([
    'a',
    'a-fork-b',
  ]);
  expect(await adapter.forks.get('a').forks.head('b')).toMatchObject({
    name: 'b',
  });
});

it('reuses a retained live-fork base without deleting it on failure', async () => {
  const adapter = tensorlake({
    filesystem: 'mock-live-fork-base-volume',
    apiKey: 'test',
  });
  await adapter.upload('seed.txt', 'seed');
  const baseline = await adapter.snapshots.create({ name: 'baseline' });

  const created = await adapter.forks.create({ name: 'child' });
  expect(created.fromSnapshot).toBe(baseline.id);
  expect((await adapter.snapshots.head(baseline.id)).name).toBe('baseline');

  await expect(adapter.forks.create({ name: 'child' })).rejects.toMatchObject({
    code: 'Conflict',
  });
  expect((await adapter.snapshots.head(baseline.id)).name).toBe('baseline');
});
