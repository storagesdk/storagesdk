import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

// Three pricing experiments, each running in its own fork of the parent.
// Every fork rewrites the same file (`pricing.json`) with a different
// variant — at the end we read that one file across the parent and all
// three forks to show the divergence.

const storage = new Storage({ adapter: await getAdapter() });

// Parent has the current live pricing.
await storage.upload(
  'pricing.json',
  JSON.stringify({ plan: 'basic', price: 9.99 })
);

// Each experiment is a branch — give them branch-style names plus a
// per-run suffix so they stay unique on cloud adapters (bucket names).
const suffix = Date.now().toString(36);
const experiments = [
  { name: `pricing-cheap-${suffix}`, variant: { plan: 'basic', price: 4.99 } },
  {
    name: `pricing-premium-${suffix}`,
    variant: { plan: 'premium', price: 19.99 },
  },
  { name: `pricing-free-${suffix}`, variant: { plan: 'free', price: 0 } },
];

// Create the forks. Serial because copy-based adapters serialize on the
// parent's manifest write; the interesting parallelism is the mutation
// step below.
for (const e of experiments) {
  await storage.forks.create({ name: e.name });
}

// Each fork rewrites the same file with its own variant — in parallel,
// since these are independent data writes on independent buckets/folders.
await Promise.all(
  experiments.map(async (e) => {
    const fork = storage.forks.get(e.name);
    await fork.upload('pricing.json', JSON.stringify(e.variant));
  })
);

// Enumerate the forks via the SDK rather than reusing the names we created.
const listed = await storage.forks.list();
console.log(`${listed.length} fork(s):\n`);

// Read the same file across parent and each fork to show divergence.
console.log('parent (HEAD)');
console.log(`  pricing.json: ${await readText(storage, 'pricing.json')}`);

for (const f of listed) {
  console.log(`\nfork: ${f.name}`);
  const fork = storage.forks.get(f.name);
  console.log(`  pricing.json: ${await readText(fork, 'pricing.json')}`);
}

// Clean up — serial, same manifest-write reason as create.
for (const e of experiments) {
  await storage.forks.delete(e.name);
}
console.log('\nForks cleaned up.');

async function readText(
  s: { download: typeof storage.download },
  key: string
): Promise<string> {
  return (await s.download(key, { as: 'text' })).trim();
}
