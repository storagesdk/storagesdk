/**
 * The exact code shown in the IDE. Verified against the real package API:
 *   - `new Storage({ adapter })`
 *   - per-adapter config shapes (tigris/s3/azure/github)
 *   - storage.list / upload / delete, storage.snapshots.* / forks.*
 * Keeping these as whole strings (not assembled token-by-token) makes the
 * line numbers stable so scenes can highlight specific lines reliably.
 */

export type AdapterId = 'tigris' | 's3' | 'azure' | 'github';

export const ADAPTER_META: Record<
  AdapterId,
  { name: string; subpath: string; label: string }
> = {
  tigris: {
    name: 'tigris',
    subpath: '@storagesdk/adapters/tigris',
    label: 'Tigris',
  },
  s3: { name: 's3', subpath: '@storagesdk/adapters/s3', label: 'Amazon S3' },
  azure: {
    name: 'azure',
    subpath: '@storagesdk/adapters/azure',
    label: 'Azure Blob',
  },
  github: {
    name: 'github',
    subpath: '@storagesdk/adapters/github',
    label: 'GitHub',
  },
};

/** The adapter-construction block — the only thing that changes when you swap. */
function adapterBlock(id: AdapterId): string {
  switch (id) {
    case 'tigris':
      return `  adapter: tigris({
    bucket: 'agent-runs',
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY,
  }),`;
    case 's3':
      return `  adapter: s3({
    bucket: 'agent-runs',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  }),`;
    case 'azure':
      return `  adapter: azure({
    bucket: 'agent-runs',
    accountName: process.env.AZURE_ACCOUNT,
    accountKey: process.env.AZURE_KEY,
  }),`;
    case 'github':
      return `  adapter: github({
    owner: 'acme',
    repo: 'agent-runs',
    token: process.env.GITHUB_TOKEN,
  }),`;
  }
}

const CRUD_METHODS = `const { items } = await storage.list({ prefix: 'runs/' });

await storage.upload('runs/hello.txt', 'Hello, storage SDK!');

await storage.delete('runs/hello.txt');`;

/** Just the head (import + construction) — adapter-specific, so its height varies. */
export function headFile(id: AdapterId): string {
  const m = ADAPTER_META[id];
  return `import { Storage } from '@storagesdk/core';
import { ${m.name} } from '${m.subpath}';

const storage = new Storage({
${adapterBlock(id)}
});`;
}

const ALL_ADAPTERS: AdapterId[] = ['tigris', 's3', 'azure', 'github'];

/** Tallest head across all adapters — every crudFile is padded up to this. */
const MAX_HEAD_LINES = Math.max(
  ...ALL_ADAPTERS.map((id) => headFile(id).split('\n').length)
);

/**
 * Full file for the CRUD scenes. The adapter configs differ in height (S3's
 * nested `credentials` is the tallest), so we pad the shorter ones with blank
 * lines after the constructor. That keeps the import block AND the
 * list/upload/delete calls on identical lines for every adapter — nothing
 * shifts when the swap scene cross-dissolves between them.
 */
export function crudFile(id: AdapterId): string {
  const head = headFile(id);
  const pad = MAX_HEAD_LINES - head.split('\n').length;
  const gap = '\n'.repeat(1 + pad); // one separating blank line + alignment pad
  return `${head}\n${gap}${CRUD_METHODS}`;
}

/** Line numbers of the list/upload/delete calls — constant across adapters now. */
export const CRUD_METHOD_LINES = {
  list: MAX_HEAD_LINES + 2,
  upload: MAX_HEAD_LINES + 4,
  delete: MAX_HEAD_LINES + 6,
} as const;

/**
 * Snapshots — read frozen state after a live write (Tigris). Line numbers are
 * referenced by name in SNAPSHOT_LINES below, so keep the layout in sync.
 */
export function snapshotFile(): string {
  return `import { Storage } from '@storagesdk/core';
import { tigris } from '@storagesdk/adapters/tigris';

const storage = new Storage({
  adapter: tigris({ bucket: 'agent-runs' }),
});

await storage.upload('runs/hello.txt', 'before');

const snap = await storage.snapshots.create({ name: 'baseline' });

await storage.upload('runs/hello.txt', 'after');

const frozen = storage.snapshots.get(snap.id);
await frozen.download('runs/hello.txt', { as: 'text' });   // 'before'
await storage.download('runs/hello.txt', { as: 'text' });  // 'after'`;
}

export const SNAPSHOT_LINES = {
  writeBefore: 8,
  snapshot: 10,
  writeAfter: 12,
  readFrozen: 15,
  readLive: 16,
} as const;

/** Forks — branch from a snapshot, mutate, leave the parent untouched (Tigris). */
export function forkFile(): string {
  return `import { Storage } from '@storagesdk/core';
import { tigris } from '@storagesdk/adapters/tigris';

const storage = new Storage({
  adapter: tigris({ bucket: 'agent-runs' }),
});

const snap = await storage.snapshots.create({ name: 'baseline' });

await storage.forks.create({
  name: 'experiment',
  fromSnapshot: snap.id,
});

const fork = storage.forks.get('experiment');
await fork.upload('runs/hello.txt', 'mutated in fork only');

await fork.download('runs/hello.txt', { as: 'text' });     // 'mutated…'
await storage.download('runs/hello.txt', { as: 'text' });  // 'after'`;
}

export const FORK_LINES = {
  snapshot: 8,
  forkCreate: 11,
  forkWrite: 16,
  readFork: 18,
  readParent: 19,
} as const;
