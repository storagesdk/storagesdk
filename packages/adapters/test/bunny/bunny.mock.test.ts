import { createHash } from 'node:crypto';
import { StorageError } from '@storagesdk/core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { bunny } from '../../src/bunny/bunny.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

// Runs the conformance suite against an in-memory stand-in for the Bunny
// Edge Storage HTTP API, so the adapter is exercised without credentials.
// The live suite in `bunny.test.ts` covers the real service.
const ENDPOINT = 'https://storage.bunny.mock';
const ZONE = 'mock-zone';
const ACCESS_KEY = 'mock-access-key';

interface Entry {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  lastChanged: Date;
}

const files = new Map<string, Entry>();
/** Every request the mock served, as `METHOD zone-relative-key`. */
const requests: string[] = [];

const describeEntry = (name: string, entry: Entry) => ({
  ObjectName: name,
  Length: entry.bytes.byteLength,
  LastChanged: entry.lastChanged.toISOString(),
  IsDirectory: false,
  ContentType: entry.contentType,
  Checksum: createHash('sha256')
    .update(entry.bytes)
    .digest('hex')
    .toUpperCase(),
});

/** One directory level: the files in `dir` plus its immediate subfolders. */
function listDirectory(dir: string): unknown[] {
  const out: unknown[] = [];
  const folders = new Set<string>();
  for (const [key, entry] of files) {
    if (!key.startsWith(dir)) continue;
    const rest = key.slice(dir.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      out.push(describeEntry(rest, entry));
    } else {
      folders.add(rest.slice(0, slash));
    }
  }
  for (const name of folders) {
    out.push({
      ObjectName: name,
      Length: 0,
      LastChanged: new Date().toISOString(),
      IsDirectory: true,
      ContentType: '',
      Checksum: null,
    });
  }
  return out;
}

async function handle(url: URL, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (headers.get('AccessKey') !== ACCESS_KEY) {
    return new Response(null, { status: 401 });
  }
  const zonePrefix = `/${ZONE}/`;
  if (!url.pathname.startsWith(zonePrefix)) {
    return new Response(null, { status: 404 });
  }
  const key = decodeURIComponent(url.pathname.slice(zonePrefix.length));
  const isDirectory = key === '' || key.endsWith('/');
  const entry = files.get(key);
  requests.push(`${init.method} ${key}`);

  switch (init.method) {
    case 'PUT': {
      // The adapter always sends a `Uint8Array` body.
      const bytes = new Uint8Array(init.body as Uint8Array);
      files.set(key, {
        bytes,
        contentType:
          headers.get('Override-Content-Type') ?? 'application/octet-stream',
        lastChanged: new Date(),
      });
      return new Response(null, { status: 201 });
    }
    case 'DELETE': {
      if (isDirectory) {
        for (const k of [...files.keys()]) {
          if (k.startsWith(key)) files.delete(k);
        }
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: files.delete(key) ? 200 : 404 });
    }
    case 'DESCRIBE': {
      if (!entry) return new Response(null, { status: 404 });
      return Response.json(describeEntry(key.split('/').pop() ?? '', entry));
    }
    case 'GET': {
      if (isDirectory) return Response.json(listDirectory(key));
      if (!entry) return new Response(null, { status: 404 });
      const responseHeaders = {
        'content-type': entry.contentType,
        'last-modified': entry.lastChanged.toUTCString(),
      };
      const range = /^bytes=(\d+)-(\d+)$/.exec(headers.get('Range') ?? '');
      if (range) {
        const body = entry.bytes.slice(Number(range[1]), Number(range[2]) + 1);
        return new Response(body, { status: 206, headers: responseHeaders });
      }
      return new Response(entry.bytes, { headers: responseHeaders });
    }
    default:
      return new Response(null, { status: 405 });
  }
}

const realFetch = globalThis.fetch;

beforeAll(() => {
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    return url.origin === ENDPOINT
      ? handle(url, init ?? {})
      : realFetch(input, init);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

storageAdapterTestSuite({
  name: 'bunny adapter (mock)',
  adapter: () =>
    bunny({
      zone: ZONE,
      bucket: 'mock-bucket',
      accessKey: ACCESS_KEY,
      endpoint: ENDPOINT,
    }),
  capabilities: {
    userMetadata: false,
    presignedUploads: false,
    fetchableSignedUrls: false,
  },
});

describe('bunny adapter (implementation)', () => {
  const build = (bucket: string, extra: { pullZone?: string } = {}) =>
    bunny({
      zone: ZONE,
      bucket,
      accessKey: ACCESS_KEY,
      endpoint: ENDPOINT,
      ...extra,
    });

  beforeEach(() => {
    files.clear();
    requests.length = 0;
  });

  it('stores each bucket under its own key prefix', async () => {
    await build('one').upload('a/b.txt', 'hello', {
      contentType: 'text/plain',
    });
    expect([...files.keys()]).toEqual(['one/a/b.txt']);
    expect(files.get('one/a/b.txt')?.contentType).toBe('text/plain');
    expect((await build('two').list()).items).toEqual([]);
  });

  it('keeps snapshots and forks in sibling prefixes and hides the manifest', async () => {
    const adapter = build('one');
    await adapter.upload('a.txt', 'a');
    const snap = await adapter.snapshots.create();
    await adapter.forks.create({ name: 'one-fork', fromSnapshot: snap.id });

    expect(snap.id).toMatch(/^one-snapshot-\d{25}$/);
    expect([...files.keys()].sort()).toEqual(
      [
        'one/.storagesdk.metadata.json',
        'one/a.txt',
        `${snap.id}/.storagesdk.metadata.json`,
        `${snap.id}/a.txt`,
        'one-fork/.storagesdk.metadata.json',
        'one-fork/a.txt',
      ].sort()
    );
    expect((await adapter.list()).items.map((i) => i.path)).toEqual(['a.txt']);
  });

  it('list only walks the folder the prefix names', async () => {
    const adapter = build('one');
    await adapter.upload('logs/2026/a.txt', 'a');
    await adapter.upload('logs/2026/b.txt', 'b');
    await adapter.upload('images/deep/c.png', 'c');
    requests.length = 0;

    const page = await adapter.list({ prefix: 'logs/2026/' });
    expect(page.items.map((i) => i.path)).toEqual([
      'logs/2026/a.txt',
      'logs/2026/b.txt',
    ]);
    expect(requests).toEqual(['GET one/logs/2026/']);
  });

  it('list matches a prefix that ends mid-name', async () => {
    const adapter = build('one');
    await adapter.upload('logs/app-1.txt', '1');
    await adapter.upload('logs/app-2/x.txt', '2');
    await adapter.upload('logs/other.txt', '3');

    const page = await adapter.list({ prefix: 'logs/app-' });
    expect(page.items.map((i) => i.path)).toEqual([
      'logs/app-1.txt',
      'logs/app-2/x.txt',
    ]);
  });

  it('url() uses the pull zone when set, the storage endpoint otherwise', async () => {
    expect(await build('one').url('a b.txt')).toBe(
      `${ENDPOINT}/${ZONE}/one/a%20b.txt`
    );
    expect(
      await build('one', { pullZone: 'cdn.example.com' }).url('a b.txt')
    ).toBe('https://cdn.example.com/one/a%20b.txt');
  });

  it('uploadUrl throws NotSupported', async () => {
    await expect(build('one').uploadUrl('a.txt')).rejects.toMatchObject({
      code: 'NotSupported',
    });
  });

  it('maps a rejected access key to Unauthorized', async () => {
    const adapter = bunny({
      zone: ZONE,
      bucket: 'one',
      accessKey: 'wrong',
      endpoint: ENDPOINT,
    });
    await expect(adapter.upload('a.txt', 'a')).rejects.toMatchObject({
      code: 'Unauthorized',
    });
  });

  it('rejects an unknown region', () => {
    expect(() =>
      bunny({
        zone: ZONE,
        bucket: 'one',
        accessKey: ACCESS_KEY,
        region: 'mars' as never,
      })
    ).toThrow(StorageError);
  });

  it('forks.create refuses a prefix that is already in use', async () => {
    const one = build('one');
    await one.upload('a.txt', 'a');
    await build('two').upload('keep.txt', 'keep');

    await expect(one.forks.create({ name: 'two' })).rejects.toMatchObject({
      code: 'Conflict',
    });
    await expect(one.forks.create({ name: 'one' })).rejects.toMatchObject({
      code: 'Conflict',
    });
    expect([...files.keys()].filter((k) => k.startsWith('two/'))).toEqual([
      'two/keep.txt',
    ]);
    // The auto-created base snapshot is rolled back too.
    expect(await one.snapshots.list()).toEqual([]);
  });

  it('forks.delete and snapshots.delete leave unknown prefixes alone', async () => {
    const one = build('one');
    await one.upload('a.txt', 'a');
    await build('two').upload('keep.txt', 'keep');

    await one.forks.delete('two');
    await one.snapshots.delete('two');
    expect(files.has('two/keep.txt')).toBe(true);
  });
});
