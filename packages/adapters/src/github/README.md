# @storagesdk/adapters/github

Adapter for a [GitHub](https://github.com) repository. Object operations go through the Contents API; snapshots and forks are first-class git refs — every snapshot is a **tag**, every fork is a **branch**.

```sh
npm install @storagesdk/core @storagesdk/adapters @octokit/rest
```

```ts
import { Storage } from '@storagesdk/core';
import { github } from '@storagesdk/adapters/github';

const storage = new Storage({
  adapter: github({
    owner: 'storagesdk',
    repo: 'agent-artifacts',
    // branch defaults to the repo's default branch
    // token defaults to process.env.GITHUB_TOKEN
  }),
});

await storage.upload('reports/2026-05.md', body, { contentType: 'text/markdown' });
const item = await storage.download('reports/2026-05.md');
const url  = await storage.url('reports/2026-05.md');
```

## How the storagesdk model maps to git

- `bucket` doesn't exist on GitHub — the storage namespace is `(owner, repo, branch)`. The adapter takes those directly.
- `snapshots` are **lightweight tags** at `refs/tags/<name>`. The snapshot id is the tag name.
- `forks` are **branches** at `refs/heads/<name>`, optionally seeded from a tag (`fromSnapshot`) instead of the live branch's HEAD.

```ts
// Snapshot = tag. Tag name doubles as the snapshot id.
const snap = await storage.snapshots.create({ name: 'pre-migration' });
snap.id; // 'pre-migration'

// Fork = branch.
await storage.forks.create({ name: 'experiment-42', fromSnapshot: snap.id });
const fork = storage.forks.get('experiment-42'); // Storage scoped to that branch
await fork.upload('config.json', JSON.stringify({ flag: true }));
```

`forks.create` without `fromSnapshot` branches from the live branch's HEAD.

## Config

```ts
interface GithubConfig {
  owner: string;
  repo: string;
  branch?: string;     // default branch, fetched lazily on first call
  token?: string;      // GITHUB_TOKEN env if omitted
  baseUrl?: string;    // for GitHub Enterprise
  commitMessage?: (op: 'upload' | 'delete' | 'copy' | 'move', paths: string[]) => string;
}
```

- `token` — needs `contents: write` for any write op. Public reads work unauthenticated but you'll hit the unauthenticated rate limit (60 req/hr) fast; pass a token even for read-only use.
- `commitMessage` — every write op (upload/delete/copy/move) creates a commit. Defaults to `"storagesdk: <op> <path>"`. Provide a function to customize.

## What this adapter doesn't preserve

- **`uploadUrl`** — GitHub has no presigned upload URLs. Throws `NotSupported`.
- **User metadata** — git tracks file content + path, not arbitrary metadata. `upload({ metadata })` is silently dropped.
- **`contentType`** — GitHub doesn't store a Content-Type; `download` returns `'application/octet-stream'` regardless.
- **`lastModified` in `list`** — the tree listing doesn't include per-blob commit dates; list results return `lastModified: new Date(0)`. `head` and `download` make an extra `listCommits` call to populate the real value.

## Hard limits (v1)

- **File size ≤ 1 MB.** The Contents API caps at 1 MB. Larger files throw `InvalidArgument` for now. Use the Git Data API directly via `storage.raw` if you need large blobs; native large-file support is on the roadmap.
- **Rate limits.** GitHub's REST API allows 5,000 requests/hour authenticated. First-time uploads are a single call; overwrites cost one extra call to look up the existing SHA, and a brief `409 Conflict` during a rapid sequential-write run triggers a sleep + retry (one more call). `head` and `download` are two calls each (content + last-commit lookup).

## Eventual consistency

GitHub's `repos.getContent`, `repos.listTags`, and `repos.listBranches` lag a few seconds behind writes and ref changes. The adapter compensates so the observable behavior matches the rest of the SDK:

- Reads that 404 are retried once after a short backoff before surfacing `NotFound` — covers the read-after-write window.
- `snapshots.list()` / `forks.list()` filter out anything the adapter just deleted in this process — covers the `listTags`/`listBranches` lag.

These are bounded to the lifetime of one `Storage` instance.

## Escape hatch

`storage.raw` is the underlying `Octokit` instance — reach for it when you need an API the adapter doesn't surface (releases, PRs, issues, GraphQL, the Git Data API for large files, etc.).

```ts
import type { Octokit } from '@octokit/rest';

const storage = new Storage({ adapter: github({ owner, repo }) });
//    ^^^^^^^^ — Storage<Octokit>, inferred.

await storage.raw.issues.create({
  owner,
  repo,
  title: 'storagesdk dropped a snapshot',
});
```
