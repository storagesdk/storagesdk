import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fs } from '@storagesdk/adapters/fs';
import { Storage } from '@storagesdk/core';

const root = path.join(os.tmpdir(), 'storagesdk-fork-experiment');
await fsp.rm(root, { recursive: true, force: true });

const storage = new Storage({ adapter: fs({ root, folder: 'main' }) });

// Baseline.
await storage.upload('data.json', JSON.stringify({ value: 1, runs: 0 }));

// Forks must be seeded from a snapshot — take one of the current state.
const snap = await storage.snapshots.create({ name: 'baseline' });

// Spin up an experiment that won't touch the main location.
const info = await storage.forks.create({
  name: 'experiment',
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

// Throw away the experiment.
await storage.forks.delete(info.name);
console.log('Experiment cleaned up. Main is untouched.');

// To "promote" a fork instead, you'd copy its entries into main and then
// delete the fork. The SDK leaves that decision to you.
