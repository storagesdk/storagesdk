import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

// Walk a tiny app through four releases, snapshotting before each one.
// We do this inside a throwaway fork so the demo never touches the parent
// bucket — at the end the fork (and all its snapshots) get cleaned up.

const storage = new Storage({ adapter: await getAdapter() });

const suffix = Date.now().toString(36);
const sandboxName = `snap-demo-${suffix}`;
await storage.forks.create({ name: sandboxName });
const sandbox = storage.forks.get(sandboxName);

// v0.1.0 — first cut, just a README.
await sandbox.upload('README.md', '# my-app\n');
const v0_1 = await sandbox.snapshots.create({ name: 'v0.1.0' });

// v0.2.0 — ship the auth module.
await sandbox.upload('auth.ts', '// auth module\n');
const v0_2 = await sandbox.snapshots.create({ name: 'v0.2.0' });

// v0.3.0 — billing module.
await sandbox.upload('billing.ts', '// billing module\n');
const v0_3 = await sandbox.snapshots.create({ name: 'v0.3.0' });

// v1.0.0 — stable; publish a CHANGELOG.
await sandbox.upload(
  'CHANGELOG.md',
  '# Changelog\n\n## v1.0.0\n- auth, billing\n'
);
const v1 = await sandbox.snapshots.create({ name: 'v1.0.0' });

// HEAD — in-development analytics module, not snapshotted yet.
await sandbox.upload('analytics.ts', '// analytics — WIP\n');

const all = await sandbox.snapshots.list();
console.log(`${all.length} snapshot(s) on the timeline:\n`);

await print('HEAD (live, v1.1.0-dev)', sandbox);
console.log('|');
await print(`${v1.name} ${v1.id}`, sandbox.snapshots.get(v1.id));
console.log('|');
await print(`${v0_3.name} ${v0_3.id}`, sandbox.snapshots.get(v0_3.id));
console.log('|');
await print(`${v0_2.name} ${v0_2.id}`, sandbox.snapshots.get(v0_2.id));
console.log('|');
await print(`${v0_1.name} ${v0_1.id}`, sandbox.snapshots.get(v0_1.id));

// Clean up: drop each snapshot first, then the sandbox fork itself.
for (const s of [v0_1, v0_2, v0_3, v1]) {
  await sandbox.snapshots.delete(s.id);
}

await storage.forks.delete(sandboxName);
console.log('\nDone.');

async function print(label: string, r: { list: typeof storage.list }) {
  console.log(`* ${label}`);
  const { items } = await r.list();
  for (const it of items.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`|   ${it.path}`);
  }
}
