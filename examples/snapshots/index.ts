import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

const storage = new Storage({ adapter: getAdapter() });

// 1. Baseline.
await storage.upload('readme.md', '# v1\nfresh project\n');
await storage.upload('config.json', JSON.stringify({ env: 'dev' }));

// 2. First snapshot — captures the baseline.
const snap1 = await storage.snapshots.create({ name: 'baseline' });

// 3. Upload more on top of the baseline.
await storage.upload('feature.ts', 'export const feature = true;\n');
await storage.upload(
  'config.json',
  JSON.stringify({ env: 'dev', feature: 'on' })
);

// 4. Second snapshot — captures the post-feature state.
const snap2 = await storage.snapshots.create({ name: 'feature-added' });

// 5. List all snapshots.
const all = await storage.snapshots.list();
console.log(`${all.length} snapshot(s):\n`);

// 6. Show what each state looks like via a git-like graph.
const live = await listPaths(storage);
const at1 = await listPaths(storage.snapshots.get(snap1.id));
const at2 = await listPaths(storage.snapshots.get(snap2.id));

console.log('* HEAD (live)');
console.log(indent(live));
console.log('|');
console.log(`* ${snap2.name ?? snap2.id} ${snap2.id}`);
console.log(indent(at2));
console.log('|');
console.log(`* ${snap1.name ?? snap1.id} ${snap1.id}`);
console.log(indent(at1));

// 7. Clean up. Tigris snapshots are point-in-time references, not
// separate copies, so its `snapshots.delete` throws NotSupported — handle
// it gracefully so the demo still completes.
for (const s of [snap1, snap2]) {
  try {
    await storage.snapshots.delete(s.id);
  } catch (err) {
    if ((err as { code?: string }).code !== 'NotSupported') throw err;
  }
}
console.log('\nDone.');

async function listPaths(s: { list: typeof storage.list }): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await s.list(cursor !== undefined ? { cursor } : undefined);
    for (const it of page.items) out.push(it.path);
    cursor = page.cursor;
  } while (cursor);
  out.sort();
  return out;
}

function indent(paths: string[]): string {
  if (paths.length === 0) return '|   (empty)';
  return paths.map((p) => `|   ${p}`).join('\n');
}
