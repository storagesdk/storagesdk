import { s3 } from '@storagesdk/adapters/s3';
import { Storage } from '@storagesdk/core';

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const REGION = process.env.S3_REGION ?? 'us-east-1';
const CREDENTIALS = {
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
};
const BUCKET = process.env.S3_BUCKET;
if (!BUCKET) {
  throw new Error('S3_BUCKET is required (the bucket must already exist).');
}

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
await storage.upload('data.json', JSON.stringify({ value: 1, runs: 0 }));

// Forks must be seeded from a snapshot — take one of the current state.
const snap = await storage.snapshots.create({ name: 'baseline' });

// Spin up an experiment that won't touch the main bucket.
// Fork name must fit in S3's 63-char bucket-name limit (and leave room
// for any nested snapshots on the fork if you go that route).
const forkName = `${BUCKET}-exp`;
const info = await storage.forks.create({
  name: forkName,
  fromSnapshot: snap.id,
});

const fork = storage.forks.get(info.name);

// Mutate the fork freely.
await fork.upload(
  'data.json',
  JSON.stringify({ value: 999, runs: 1, note: 'risky experiment' })
);

// Verify isolation.
const main = await storage.download('data.json', { as: 'json' });
const inFork = await fork.download('data.json', { as: 'json' });
console.log('Main:', main);
console.log('Fork:', inFork);

// Throw away the experiment — empties + deletes the fork bucket.
await storage.forks.delete(info.name);

// Clean up the snapshot too.
await storage.snapshots.delete(snap.id);

console.log('Experiment cleaned up. Main is untouched.');
