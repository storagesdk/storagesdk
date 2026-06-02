// Content snippets used by code blocks across the site. Lifted from the README.

export const SNIPPETS = {
  // ── Multi-adapter switcher: same call site, different adapter import ──
  adapters: {
    tigris: `import { Storage } from '@storagesdk/core';
import { tigris } from '@storagesdk/adapters/tigris';

const storage = new Storage({
  adapter: tigris({
    bucket: 'agent-runs',
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    s3: `import { Storage } from '@storagesdk/core';
import { s3 } from '@storagesdk/adapters/s3';

const storage = new Storage({
  adapter: s3({
    bucket: 'agent-runs',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    r2: `import { Storage } from '@storagesdk/core';
import { r2 } from '@storagesdk/adapters/r2';

const storage = new Storage({
  adapter: r2({
    bucket: 'agent-runs',
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    gcs: `import { Storage } from '@storagesdk/core';
import { gcs } from '@storagesdk/adapters/gcs';

const storage = new Storage({
  adapter: gcs({
    bucket: 'agent-runs',
    projectId: process.env.GOOGLE_PROJECT_ID,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    azure: `import { Storage } from '@storagesdk/core';
import { azure } from '@storagesdk/adapters/azure';

const storage = new Storage({
  adapter: azure({
    bucket: 'agent-runs',
    accountName: process.env.AZURE_ACCOUNT_NAME,
    accountKey: process.env.AZURE_ACCOUNT_KEY,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    vercel: `import { Storage } from '@storagesdk/core';
import { vercel } from '@storagesdk/adapters/vercel';

const storage = new Storage({
  adapter: vercel({
    bucket: 'agent-runs',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    minio: `import { Storage } from '@storagesdk/core';
import { minio } from '@storagesdk/adapters/minio';

const storage = new Storage({
  adapter: minio({
    bucket: 'agent-runs',
    endpoint: process.env.MINIO_ENDPOINT,
    accessKeyId: process.env.MINIO_ACCESS_KEY_ID,
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    github: `import { Storage } from '@storagesdk/core';
import { github } from '@storagesdk/adapters/github';

const storage = new Storage({
  adapter: github({
    owner: 'agentco',
    repo: 'agent-runs',
    // branch defaults to the repo's default branch
    // token defaults to process.env.GITHUB_TOKEN
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    fly: `import { Storage } from '@storagesdk/core';
import { fly } from '@storagesdk/adapters/fly';

const storage = new Storage({
  adapter: fly({
    bucket: 'agent-runs',
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    railway: `import { Storage } from '@storagesdk/core';
import { railway } from '@storagesdk/adapters/railway';

const storage = new Storage({
  adapter: railway({
    bucket: 'agent-runs',
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
    fs: `import { Storage } from '@storagesdk/core';
import { fs } from '@storagesdk/adapters/fs';

const storage = new Storage({
  adapter: fs({
    root: './.storage',
    folder: 'agent-runs',
  }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!', {
  contentType: 'text/plain',
});

const text = await storage.download('hello.txt', { as: 'text' });`,
  },

  // ── Hero — the snapshots+forks pitch in code ──
  hero: `import { Storage } from '@storagesdk/core';
import { tigris } from '@storagesdk/adapters/tigris';

const storage = new Storage({
  adapter: tigris({
    bucket: 'agent-runs',
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY,
  }),
});

// Freeze the current state.
const snap = await storage.snapshots.create({ name: 'pre-migration' });

// Branch from that snapshot — writable, isolated.
await storage.forks.create({ name: 'agent-runs-exp', fromSnapshot: snap.id });
const fork = storage.forks.get('agent-runs-exp');

await fork.upload('hello.txt', 'mutated in fork only');`,

  // ── Snapshots — frozen state after live writes ──
  snapshotsRead: `await storage.upload('photo.jpg', 'before');
const snap = await storage.snapshots.create({ name: 'baseline' });
await storage.upload('photo.jpg', 'after');

const reader = storage.snapshots.get(snap.id);

await reader.download('photo.jpg', { as: 'text' });   // 'before'
await storage.download('photo.jpg', { as: 'text' });  // 'after'`,

  snapshotsApi: `storage.snapshots.create(opts?: { name?, signal? }):          Promise<SnapshotInfo>;
storage.snapshots.list():                                     Promise<SnapshotInfo[]>;
storage.snapshots.head(id, opts?: { signal? }):               Promise<SnapshotInfo>;
storage.snapshots.delete(id, opts?: { signal? }):             Promise<void>;
storage.snapshots.get(id):                                    ReadOnlyStorage;`,

  // ── Forks — branch and mutate ──
  forksBranch: `const snap = await storage.snapshots.create();
await storage.forks.create({ name: 'experiment', fromSnapshot: snap.id });

const fork = storage.forks.get('experiment');
await fork.upload('config.json', JSON.stringify({ flag: true }));

// Parent bucket is untouched. The fork has its own writable view.
const liveValue = await storage.download('config.json', { as: 'text' });
// → whatever it was; the fork didn't write here.`,

  forksApi: `storage.forks.create(opts: { name, fromSnapshot?, signal? }):  Promise<ForkInfo>;
storage.forks.list():                                          Promise<ForkInfo[]>;
storage.forks.head(name, opts?: { signal? }):                  Promise<ForkInfo>;
storage.forks.delete(name, opts?: { signal? }):                Promise<void>;
storage.forks.get(name):                                       Storage<Raw>;`,

  // ── Standard ops surface ──
  ops: `await storage.upload('report.pdf', body, { contentType: 'application/pdf' });

const item = await storage.download('report.pdf');             // StorageItem
const text = await storage.download('report.pdf', { as: 'text' });
const bytes = await storage.download('report.pdf', { as: 'bytes' });

await storage.head('report.pdf');
await storage.list({ prefix: 'reports/' });
await storage.copy('a.png', 'b.png');
await storage.move('tmp/x.png', 'img/x.png');
await storage.delete('old.pdf');`,

  // ── Streaming download ──
  streaming: `const stream = await storage.download('large.mp4', { as: 'stream' });
// Web ReadableStream<Uint8Array> — pipe it anywhere.

for await (const chunk of stream) {
  res.write(chunk);
}`,

  // ── Signed URLs ──
  signedUrls: `// 5-minute GET URL for a private object.
await storage.url('photo.jpg', { expiresIn: 300 });

// PUT upload URL — client uploads directly to the backend.
await storage.uploadUrl('new.jpg', { expiresIn: 300 });
// → { method: 'PUT', url, headers? }

// POST upload URL — adds maxSize / minSize / contentType guards
// the backend enforces. Browser submits as multipart/form-data.
await storage.uploadUrl('new.jpg', {
  expiresIn: 300,
  maxSize: 5_000_000,
  contentType: 'image/jpeg',
});
// → { method: 'POST', url, fields }`,

  // ── Typed escape hatch ──
  escapeHatch: `const storage = new Storage({
  adapter: tigris({
    bucket: 'agent-runs',
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY,
  }),
});
//    ^ Storage typed end-to-end via the adapter — no cast.

// Need a backend-specific op? Reach through .raw — fully typed.
await storage.raw.someBackendOp({ /* ... */ });`,

  // ── AbortSignal ──
  abort: `const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 5_000);

try {
  await storage.upload('big.bin', body, { signal: ctrl.signal });
} catch (err) {
  if (err.code === 'Aborted') {
    // The caller cancelled. Nothing was committed.
  }
}`,

  errors: `type StorageErrorCode =
  | 'NotFound'         // missing key, snapshot, or fork
  | 'NotSupported'     // adapter doesn't implement this op
  | 'Conflict'         // duplicate fork name, etc.
  | 'Unauthorized'     // 401 / 403 from the backend
  | 'InvalidArgument'  // bad path, sidecar collision
  | 'Aborted'          // caller's AbortSignal fired
  | 'Provider';        // unmapped backend error (cause attached)`,

  // ── Install commands ──
  install: {
    npm: 'npm install @storagesdk/core @storagesdk/adapters',
    pnpm: 'pnpm add @storagesdk/core @storagesdk/adapters',
    bun: 'bun add @storagesdk/core @storagesdk/adapters',
    yarn: 'yarn add @storagesdk/core @storagesdk/adapters',
  },

  // ── CLI ──
  cli: `# install once, talk to every backend
npm install -g @storagesdk/cli

# upload from a pipe — pick the adapter with a flag
cat report.pdf | storage put report.pdf --adapter s3 --bucket reports --stdin

# list as JSON (the default)
storage list --adapter r2 --bucket reports --prefix 2026/

# snapshots and forks at the prompt
storage snapshot create --adapter tigris --bucket prod --name baseline
storage fork create --from-snapshot snap_5fe2 --name experiment-42

# stream a download straight to disk
storage get report.pdf --adapter gcs --bucket reports --stdout > out.pdf`,

  firstCall: `import { Storage } from '@storagesdk/core';
import { fs } from '@storagesdk/adapters/fs';

const storage = new Storage({
  adapter: fs({ root: './.storage', folder: 'agent-runs' }),
});

await storage.upload('hello.txt', 'Hello, storage SDK!');
const text = await storage.download('hello.txt', { as: 'text' });`,

  // ── Custom adapter ──
  customAdapter: `import { defineAdapter, type Adapter } from '@storagesdk/core/adapter';

export function myAdapter(config: MyConfig): Adapter {
  return defineAdapter({
    name: 'my-backend',
    raw: /* your underlying client */,
    async upload(path, body, opts) { /* ... */ },
    async download(path, opts)     { /* ... */ },
    async head(path, opts)         { /* ... */ },
    async list(opts)               { /* ... */ },
    async delete(path, opts)       { /* ... */ },
    async copy(from, to, opts)     { /* ... */ },
    async move(from, to, opts)     { /* ... */ },
    async url(path, opts)          { /* ... */ },
    async uploadUrl(path, opts)    { /* ... */ },
    snapshots: { /* create, list, head, delete, get */ },
    forks:     { /* create, list, head, delete, get */ },
  });
}`,
};
