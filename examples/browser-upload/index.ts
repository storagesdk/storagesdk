import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

/**
 * Demo server for the browser-upload flow:
 *   - Browser asks the server for a presigned POST URL.
 *   - Server uses storagesdk's `uploadUrl({ maxSize, contentType })` to mint
 *     one — storage returns `{ method: 'POST', url, fields }`.
 *   - Browser submits a multipart/form-data form to `url` with the
 *     `fields` as hidden inputs followed by the file input.
 *
 * The backend must support POST policies (s3, r2, minio, tigris). fs
 * throws `NotSupported`. Set `EXAMPLE_ADAPTER` accordingly — see
 * examples/README.md for env-var matrix.
 *
 * Your bucket must also have CORS enabled for the origin the browser
 * runs on (typically `http://localhost:3000`). For AWS S3, that's a
 * CORS rule on the bucket; for MinIO, `mc admin policy ...` or the
 * console UI. For local R2/Tigris see their docs.
 */

const PORT = Number(process.env.PORT ?? 3000);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB upload cap

const storage = new Storage({ adapter: await getAdapter() });
const indexHtml = readFileSync(path.join(import.meta.dirname, 'index.html'));

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Serve the form.
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(indexHtml);
    return;
  }

  // Mint a POST URL for the browser to upload to.
  if (req.method === 'GET' && url.pathname === '/upload-url') {
    const key = url.searchParams.get('key');
    const contentType =
      url.searchParams.get('contentType') ?? 'application/octet-stream';
    if (!key) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing ?key=' }));
      return;
    }
    try {
      const signed = await storage.uploadUrl(key, {
        expiresIn: 300,
        maxSize: MAX_SIZE,
        contentType,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(signed));
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'Unknown';
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: code, message }));
    }
    return;
  }

  // Verify the upload landed — fetch metadata from the bucket.
  if (req.method === 'GET' && url.pathname === '/verify') {
    const key = url.searchParams.get('key');
    if (!key) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing ?key=' }));
      return;
    }
    try {
      const meta = await storage.head(key);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          path: meta.path,
          size: meta.size,
          contentType: meta.contentType,
        })
      );
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'Unknown';
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: code }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT}`);
  console.log(`Adapter: ${process.env.EXAMPLE_ADAPTER ?? 'fs (will throw)'}`);
});
