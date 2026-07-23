import type { FileEntry, FilesystemInfo, Snapshot } from 'tensorlake';
import { vi } from 'vitest';

/**
 * In-memory stand-in for the `tensorlake` SDK's `FilesystemClient` /
 * `Filesystem`. Models the two behaviors the adapter leans on: every write
 * produces a new commit, and reads accept a commit as `version` for
 * time-travel. `oid` is a content hash so identical bytes hash identically
 * across filesystems — which is what the default merge/diff rely on.
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

  const snapshotObj = (id: string): Snapshot => ({
    commit: id,
    tree: id,
    refName: 'main',
    parent: null,
    created: true,
    message: '',
  });

  class Store {
    readonly commits = new Map<string, Map<string, Uint8Array>>();
    readonly live = new Map<string, Uint8Array>();
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
    ): Promise<Snapshot> {
      const store = this.store();
      store.live.set(path, toBytes(data));
      return snapshotObj(store.commitNow());
    }
    async writeFiles(
      files:
        | Map<string, Uint8Array | string>
        | Record<string, Uint8Array | string>,
      _message?: string,
      deletes?: string[]
    ): Promise<Snapshot> {
      const store = this.store();
      const entries =
        files instanceof Map ? [...files.entries()] : Object.entries(files);
      for (const [path, data] of entries) store.live.set(path, toBytes(data));
      for (const path of deletes ?? []) store.live.delete(path);
      return snapshotObj(store.commitNow());
    }
    async deleteFile(path: string): Promise<Snapshot> {
      const store = this.store();
      if (!store.live.has(path)) {
        throw new FileNotFoundInFilesystemError(this.name, path);
      }
      store.live.delete(path);
      return snapshotObj(store.commitNow());
    }
    async snapshot(): Promise<Snapshot> {
      const store = this.store();
      return snapshotObj(store.head ?? store.commitNow());
    }
    async readFile(path: string, version?: string): Promise<Uint8Array> {
      const bytes = this.store().view(version).get(path);
      if (bytes === undefined) {
        throw new FileNotFoundInFilesystemError(this.name, path);
      }
      return bytes;
    }
    async readText(path: string, version?: string): Promise<string> {
      return new TextDecoder().decode(await this.readFile(path, version));
    }
    async listFiles(dirPath?: string, version?: string): Promise<FileEntry[]> {
      const view = this.store().view(version);
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
          oid: '',
          mode: 0o40000,
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
          oid: oidOf(bytes),
          mode: 0o100644,
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
        defaultBranch: 'main',
        headCommit: store.head ?? null,
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
      // Lenient: the live filesystem is assumed to pre-exist, so materialize
      // it on first touch instead of forcing test setup to create it.
      if (!filesystems.has(name)) filesystems.set(name, new Store());
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
