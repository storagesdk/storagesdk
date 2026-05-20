import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

const storage = new Storage({ adapter: getAdapter() });

// Baseline.
await storage.upload('data.json', JSON.stringify({ value: 1, runs: 0 }));

// Forks must be seeded from a snapshot — take one of the current state.
const snap = await storage.snapshots.create({ name: 'baseline' });

// Fork name has to be unique within the location's siblings — for cloud
// adapters that means a unique bucket name. A timestamp suffix keeps the
// example safe to run repeatedly across all adapters.
const forkName = `experiment-${Date.now().toString(36)}`;
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

// Throw away the experiment.
await storage.forks.delete(info.name);
console.log('Experiment cleaned up. Main is untouched.');

// To "promote" a fork instead, you'd copy its entries into main and then
// delete the fork. The SDK leaves that decision to you.
