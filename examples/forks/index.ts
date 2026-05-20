import { Storage } from '@storagesdk/core';
import { getAdapter } from '../adapter.js';

const storage = new Storage({ adapter: getAdapter() });

// 1. Baseline.
await storage.upload('shared.txt', 'baseline\n');

// 2. Spin up three forks of the parent's live state. No snapshot needed
// for copy-based adapters (FS, S3) — they just copy from live — and Tigris
// forks the current bucket natively when `fromSnapshot` is omitted. Fork
// names get a per-run suffix so the example is safe to run repeatedly on
// cloud adapters (bucket names need to be unique).
//
// Creation is serial: each `forks.create` does a read-modify-write of the
// parent's manifest, and concurrent calls would race that update on copy-
// based adapters. The interesting parallelism is in the mutation phase.
const suffix = Date.now().toString(36);
const forkNames = [`alpha-${suffix}`, `beta-${suffix}`, `gamma-${suffix}`];
for (const name of forkNames) {
  await storage.forks.create({ name });
}

// 3. Mutate the three forks in parallel — each writes a different file
// and a different version of the shared one.
await Promise.all(
  forkNames.map((name, i) => {
    const fork = storage.forks.get(name);
    return Promise.all([
      fork.upload(`branch-${i}.txt`, `notes from ${name}\n`),
      fork.upload('shared.txt', `mutated by ${name}\n`),
    ]);
  })
);

// 4. List all forks. Tigris's forks.list is currently `NotSupported`
// pending an upstream `listBuckets({ sourceBucketName })` filter — fall
// back to the names we created so the rest of the demo still runs.
let listedNames: string[];
try {
  const listed = await storage.forks.list();
  listedNames = listed.map((f) => f.name);
  console.log(`forks.list() returned ${listed.length} fork(s).`);
} catch (err) {
  if ((err as { code?: string }).code !== 'NotSupported') throw err;
  console.log(
    'forks.list() is NotSupported on this adapter — using the names we just created.'
  );
  listedNames = forkNames;
}

// 5. Show contents of the parent and each fork side-by-side.
console.log('\nparent (HEAD)');
console.log(indent(await readPairs(storage, ['shared.txt'])));

for (const name of listedNames) {
  console.log(`\nfork: ${name}`);
  const fork = storage.forks.get(name);
  const keys = await listPaths(fork);
  console.log(indent(await readPairs(fork, keys)));
}

// 6. Clean up — serial, same manifest-write reason as create.
for (const name of forkNames) {
  await storage.forks.delete(name);
}
console.log('\nForks cleaned up.');

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

async function readPairs(
  s: { download: typeof storage.download },
  keys: string[]
): Promise<[string, string][]> {
  return Promise.all(
    keys.map(
      async (k): Promise<[string, string]> => [
        k,
        (await s.download(k, { as: 'text' })).trim(),
      ]
    )
  );
}

function indent(pairs: [string, string][]): string {
  return pairs.map(([k, v]) => `  ${k}: ${v}`).join('\n');
}
