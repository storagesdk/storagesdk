import { createHash } from 'node:crypto';
import { afterAll, beforeAll, vi } from 'vitest';
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
