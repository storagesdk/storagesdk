import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

const storage = new Storage({ adapter: getAdapter() });

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

// url — a signed URL on cloud adapters; a `file://` URL on the FS adapter.
console.log('url:', await storage.url('hello.txt'));

// delete — done.
await storage.delete('hello.txt');
console.log('Cleaned up');
