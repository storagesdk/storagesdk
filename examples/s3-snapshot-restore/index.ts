import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { s3 } from '@storagesdk/adapters/s3';
import { Storage } from '@storagesdk/core';

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const REGION = process.env.S3_REGION ?? 'us-east-1';
const CREDENTIALS = {
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
};
const BUCKET = 'storagesdk-snap-demo';

// Ensure the bucket exists; the adapter doesn't auto-create.
const admin = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: CREDENTIALS,
  forcePathStyle: true,
});
try {
  await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
} catch {
  /* already exists */
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

// Baseline.
await storage.upload('settings.json', JSON.stringify({ theme: 'dark' }));
await storage.upload('user.json', JSON.stringify({ name: 'Alice' }));

// Snapshot — creates a sibling bucket and copies every object server-side.
const snap = await storage.snapshots.create({ name: 'pre-experiment' });
console.log('Snapshot:', snap.id);

// Mutate live storage.
await storage.upload('settings.json', JSON.stringify({ theme: 'light' }));
await storage.delete('user.json');

// Read at the snapshot — frozen view from the snapshot bucket.
const reader = storage.snapshots.get(snap.id);
console.log(
  'At snapshot — settings:',
  await reader.download('settings.json', { as: 'text' })
);
console.log(
  'At snapshot — user:    ',
  await reader.download('user.json', { as: 'text' })
);

// Live state is independent.
console.log(
  'Live — settings:        ',
  await storage.download('settings.json', { as: 'text' })
);

// Restore: copy every snapshot entry back into live storage.
const { items } = await reader.list();
for (const it of items) {
  const item = await reader.download(it.path);
  await storage.upload(it.path, item.body, { contentType: it.contentType });
}
console.log('Restored from snapshot. Live now matches the snapshot.');

// Clean up the snapshot — empties + deletes the snapshot bucket.
await storage.snapshots.delete(snap.id);
console.log('Snapshot bucket removed.');
