import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { s3 } from '@storagesdk/adapters/s3';
import { Storage } from '@storagesdk/core';

// MinIO defaults — override via env vars for AWS S3, R2, etc.
const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const REGION = process.env.S3_REGION ?? 'us-east-1';
const CREDENTIALS = {
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
};
const BUCKET = 'storagesdk-quickstart';

// Ensure the bucket exists. The adapter doesn't auto-create buckets;
// bucket lifecycle is the caller's concern.
const admin = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: CREDENTIALS,
  forcePathStyle: true,
});
try {
  await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
} catch {
  /* bucket may already exist — that's fine */
}
admin.destroy();

const storage = new Storage({
  adapter: s3({
    bucket: BUCKET,
    region: REGION,
    endpoint: ENDPOINT,
    credentials: CREDENTIALS,
    forcePathStyle: true,
  }),
});

// upload — any body shape (string, Uint8Array, Blob, ReadableStream).
await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

// list — paginated, metadata only.
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

// url — signed S3 URL (real signature for the configured backend).
console.log('url:', await storage.url('hello.txt', { expiresIn: 300 }));

// delete — done.
await storage.delete('hello.txt');
console.log('Cleaned up');
