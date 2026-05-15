import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fs } from '@storagesdk/adapters/fs';
import { Storage } from '@storagesdk/core';

const root = path.join(os.tmpdir(), 'storagesdk-snapshot-restore');
await fsp.rm(root, { recursive: true, force: true });

const storage = new Storage({ adapter: fs({ root, folder: 'config' }) });

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

// Clean up the snapshot if we don't need it anymore.
await storage.snapshots.delete(snap.id);
