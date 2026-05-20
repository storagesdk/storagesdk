import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

// Walk a tiny app through four releases, snapshotting before each one.
// Every release ADDS a new file so the file list at each snapshot
// differs from the next — easy to see in the graph at the end.

const storage = new Storage({ adapter: getAdapter() });

// v0.1.0 — first cut, just a README.
await storage.upload('README.md', '# my-app\n');
const v0_1 = await storage.snapshots.create({ name: 'v0.1.0' });

// v0.2.0 — ship the auth module.
await storage.upload('auth.ts', '// auth module\n');
const v0_2 = await storage.snapshots.create({ name: 'v0.2.0' });

// v0.3.0 — billing module.
await storage.upload('billing.ts', '// billing module\n');
const v0_3 = await storage.snapshots.create({ name: 'v0.3.0' });

// v1.0.0 — stable; publish a CHANGELOG.
await storage.upload(
  'CHANGELOG.md',
  '# Changelog\n\n## v1.0.0\n- auth, billing\n'
);
const v1 = await storage.snapshots.create({ name: 'v1.0.0' });

// HEAD — in-development analytics module, not snapshotted yet.
await storage.upload('analytics.ts', '// analytics — WIP\n');

const all = await storage.snapshots.list();
console.log(`${all.length} snapshot(s) on the timeline:\n`);

await print('HEAD (live, v1.1.0-dev)', storage);
console.log('|');
await print(`${v1.name} ${v1.id}`, storage.snapshots.get(v1.id));
console.log('|');
await print(`${v0_3.name} ${v0_3.id}`, storage.snapshots.get(v0_3.id));
console.log('|');
await print(`${v0_2.name} ${v0_2.id}`, storage.snapshots.get(v0_2.id));
console.log('|');
await print(`${v0_1.name} ${v0_1.id}`, storage.snapshots.get(v0_1.id));

// Tigris snapshots are point-in-time references rather than copies, so
// its `snapshots.delete` throws `NotSupported`. Catch that so the demo
// still finishes on Tigris.
for (const s of [v0_1, v0_2, v0_3, v1]) {
  try {
    await storage.snapshots.delete(s.id);
  } catch (err) {
    if ((err as { code?: string }).code !== 'NotSupported') throw err;
  }
}
console.log('\nDone.');

async function print(label: string, r: { list: typeof storage.list }) {
  console.log(`* ${label}`);
  const { items } = await r.list();
  for (const it of items.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`|   ${it.path}`);
  }
}
