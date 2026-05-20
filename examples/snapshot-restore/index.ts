import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

const storage = new Storage({ adapter: getAdapter() });

// Baseline.
await storage.upload('settings.json', JSON.stringify({ theme: 'dark' }));
await storage.upload('user.json', JSON.stringify({ name: 'Alice' }));

// Snapshot the baseline. SnapshotInfo.id is also the snapshot's location.
const snap = await storage.snapshots.create({ name: 'pre-experiment' });
console.log('Snapshot:', snap.id);

// Mutate live storage.
await storage.upload('settings.json', JSON.stringify({ theme: 'light' }));
await storage.delete('user.json');

// Read at the snapshot — frozen view of the data at create() time.
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

// To restore: copy every snapshot entry back into live storage.
const { items } = await reader.list();
for (const it of items) {
  const item = await reader.download(it.path);
  await storage.upload(it.path, item.body, { contentType: it.contentType });
}
console.log('Restored from snapshot. Live now matches the snapshot.');

// Clean up the snapshot if we don't need it anymore. Some adapters
// (e.g. Tigris) treat snapshots as point-in-time references rather than
// separate copies, so deletion isn't a thing — surface that gracefully.
try {
  await storage.snapshots.delete(snap.id);
  console.log('Snapshot deleted.');
} catch (err) {
  if ((err as { code?: string }).code === 'NotSupported') {
    console.log(
      'Snapshot deletion is not supported on this adapter (the snapshot is a reference, not a copy).'
    );
  } else {
    throw err;
  }
}
