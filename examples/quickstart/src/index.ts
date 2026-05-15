import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fs } from '@storagesdk/adapters/fs';
import { Storage } from '@storagesdk/core';

// Set up a fresh storage location under the OS temp dir.
const root = path.join(os.tmpdir(), 'storagesdk-quickstart');
await fsp.rm(root, { recursive: true, force: true });

const storage = new Storage({ adapter: fs({ root, folder: 'photos' }) });

// upload — any body shape works (string, Uint8Array, Blob, ReadableStream).
await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

// list — paginated, returns metadata only (no body).
const { items } = await storage.list();
console.log(
  'Files:',
  items.map((i) => `${i.path} (${i.size}B)`)
);

// download — full StorageItem by default, or use `as` for a typed body.
const text = await storage.download('hello.txt', { as: 'text' });
console.log('Content:', text);

const meta = await storage.head('hello.txt');
console.log('contentType:', meta.contentType);

// url — for FS this is a file:// URL; cloud adapters return a real signed URL.
console.log('url:', await storage.url('hello.txt'));

// delete — done.
await storage.delete('hello.txt');
console.log('Cleaned up');
